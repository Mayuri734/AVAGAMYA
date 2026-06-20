import torch
from transformers import pipeline
import time


class LocalLLMRouter:
    _instance = None
    _classifier_pipeline = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(LocalLLMRouter, cls).__new__(cls)
        return cls._instance

    @classmethod
    def pre_warm(cls):
        """
        Pre-loads the TinyLlama model into RAM during FastAPI startup.
        Uses FP16 quantization to cut memory usage in half.
        """
        if cls._classifier_pipeline is not None:
            return

        print("🚀 [Local LLM] Pre-warming TinyLlama-1.1B in FP16...")
        start_time = time.time()

        # Check for GPU, fallback to CPU
        device = 0 if torch.cuda.is_available() else -1

        try:
            # We use float16 to save RAM and speed up inference
            cls._classifier_pipeline = pipeline(
                "text-generation",
                model="TinyLlama/TinyLlama-1.1B-Chat-v1.0",
                torch_dtype=torch.float16,
                device=device
            )
            print(f"✅ [Local LLM] TinyLlama loaded successfully in {time.time() - start_time:.2f} seconds.")
        except Exception as e:
            print(f"❌ [Local LLM] Failed to load TinyLlama: {e}")
            cls._classifier_pipeline = "FAILED"

    @classmethod
    def classify_complexity_local(cls, text: str) -> str:
        """
        Uses Few-Shot Prompting to classify if a clause is COMPLEX or SIMPLE.
        Runs synchronously (must be wrapped in run_in_threadpool in FastAPI).
        """
        if cls._classifier_pipeline is None:
            # Fallback if not pre-warmed
            cls.pre_warm()

        if cls._classifier_pipeline == "FAILED":
            # If local LLM fails to load, default to COMPLEX so Gemini handles it safely
            return "COMPLEX"

        # Few-Shot Prompt Template
        prompt = f"""<|system|>
You are an expert legal AI. Classify the following clause as exactly "SIMPLE" or "COMPLEX".
A SIMPLE clause is easy to understand. A COMPLEX clause contains heavy jargon or predatory terms.

Example 1:
Clause: "You must pay your bill by the 5th of every month."
Classification: SIMPLE

Example 2:
Clause: "The bank reserves the sole discretion to levy a penalty without prior notice."
Classification: COMPLEX
</s>
<|user|>
Clause: "{text}"
Classification:</s>
<|assistant|>
"""
        try:
            results = cls._classifier_pipeline(
                prompt,
                max_new_tokens=5,
                temperature=0.1,  # Low temperature for deterministic classification
                do_sample=False,
                return_full_text=False
            )

            output = results[0]['generated_text'].strip().upper()

            # Robust parsing of the output
            if "SIMPLE" in output:
                return "SIMPLE"
            return "COMPLEX"  # Default to complex if unsure

        except Exception as e:
            print(f"⚠️ [Local LLM] Inference Error: {e}")
            return "COMPLEX"  # Safe fallback
