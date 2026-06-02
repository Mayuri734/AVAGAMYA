from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import fitz
import joblib
import numpy as np
import io
import os
from classifier import extract_page_features

app = FastAPI(title="AVAGAMYA CV Page Classifier")

# Enable CORS for frontend interaction
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the model
MODEL_PATH = "page_classifier.pkl"
if os.path.exists(MODEL_PATH):
    clf = joblib.load(MODEL_PATH)
else:
    clf = None

@app.post("/classify-page")
async def classify_page(file: UploadFile = File(...)):
    """
    Expects a single-page PDF file.
    """
    if not clf:
        raise HTTPException(status_code=500, detail="Model not loaded")
    
    try:
        contents = await file.read()
        doc = fitz.open(stream=contents, filetype="pdf")
        if len(doc) == 0:
            raise HTTPException(status_code=400, detail="Empty PDF")
            
        page = doc[0]
        features = extract_page_features(page)
        
        prediction = clf.predict([features])[0]
        probabilities = clf.predict_proba([features])[0]
        confidence = float(np.max(probabilities))
        
        return {
            "page_type": prediction,
            "confidence": confidence,
            "classes": clf.classes_.tolist(),
            "probabilities": probabilities.tolist()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": clf is not None}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
