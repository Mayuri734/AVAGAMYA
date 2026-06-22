import os
import re
import httpx
import json
from typing import List, Dict
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_KEY", "")
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")

supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


async def get_raw_clauses(document_hash: str) -> List[Dict]:
    if not supabase:
        return []
    try:
        if document_hash:
            response = supabase.table("document_cache").select(
                "ai_results"
            ).eq("file_hash", document_hash).eq("language", "en").limit(1).execute()
            if not response.data:
                response = supabase.table("document_cache").select(
                    "ai_results"
                ).eq("file_hash", document_hash).limit(1).execute()
        else:
            response = supabase.table("document_cache").select("ai_results").limit(1).execute()

        if response.data and response.data[0].get("ai_results"):
            return response.data[0]["ai_results"]
    except Exception as e:
        print(f"Error fetching raw clauses: {e}")
    return []


async def search_analyzed_clauses(document_hash: str, query: str) -> str:
    clauses = await get_raw_clauses(document_hash)
    if not clauses:
        return ""
    try:
        query_lower = query.lower()

        if "summarize" in query_lower or "summary" in query_lower:
            return "\n".join([f"- {c.get('original_text', '')}" for c in clauses[:5]])

        if "penalty" in query_lower or "penalties" in query_lower or "fee" in query_lower or "fees" in query_lower:
            penalties = [
                c for c in clauses
                if "fee" in c.get('original_text', '').lower() or "penalty" in c.get('original_text', '').lower()
            ]
            if penalties:
                return "\n".join([f"- {c.get('original_text', '')}" for c in penalties[:3]])
            # Fall through to default fallback instead of returning NO_PENALTIES_FOUND

        match = re.search(r'clause\s+(\d+)', query_lower)
        if match:
            idx = int(match.group(1)) - 1
            if 0 <= idx < len(clauses):
                return clauses[idx].get('original_text', '')

        # Default fallback
        return "\n".join([f"- {c.get('original_text', '')}" for c in clauses[:3]])
    except Exception as e:
        print(f"Error searching clauses: {e}")
    return ""


async def generate_shrawya_response(  # noqa: C901
    query: str, history: List[Dict[str, str]], document_hash: str, language: str = "en"
) -> str:
    context = await search_analyzed_clauses(document_hash, query)

    if not context:
        return "I cannot find the analyzed document in my memory. Please upload and analyze a document first."

    lang_map = {"en": "English", "hi": "Hindi", "mr": "Marathi"}
    target_lang = lang_map.get(language.strip().lower(), "English")

    prompt = f"""You are SHRAWYA, a highly intelligent Legal/Financial AI Assistant.
You answer the user's question USING ONLY the Document Context.
If the user asks a math/calculation question about loans, YOU MUST NOT DO THE MATH YOURSELF.
Instead, you MUST reply with EXACTLY this JSON format and nothing else:
{{"action": "SIMULATE", "principal": 50000, "roi": 7.0, "tenure_months": 6, "processing_fee_percent": 1.0}}

If the user asks about external laws, RBI rules, YOU MUST NOT GUESS.
Instead, you MUST reply with EXACTLY this JSON format and nothing else:
{{"action": "SEARCH", "query": "RBI rules on late payment penalty fees 2024"}}

If the user asks about complex chain reactions, triggers, YOU MUST NOT GUESS.
Instead, you MUST reply with EXACTLY this JSON format and nothing else:
{{"action": "GRAPH_TRAVERSAL", "keyword": "miss a payment"}}

If the user asks about a penalty, fee, or fine, and you explain it, you MUST append this exact tag:
[ACTION: DRAFT_WAIVER_EMAIL]

Document Context:
{context}
"""

    messages = [{"role": "system", "content": prompt}]
    for msg in history[-4:]:
        role = str(msg.get("role", "user")).strip().lower()
        if role == "agent":
            role = "assistant"
        # Sarvam/OpenAI format expects 'user' or 'assistant'
        messages.append({"role": role, "content": msg.get('content', '')})

    messages.append({"role": "user", "content": query})

    if not SARVAM_API_KEY:
        return "Sarvam API Key is missing. I cannot process this request."

    url = "https://api.sarvam.ai/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "api-subscription-key": SARVAM_API_KEY,
    }

    from simulator_tool import calculate_emi_and_cost

    async def _call_sarvam(msgs):
        payload = {"model": "sarvam-30b", "messages": msgs, "temperature": 0.1}
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    content = resp.json().get("choices", [{}])[0].get("message", {}).get("content")
                    return content.strip() if content else ""
                print(f"Sarvam Error: {resp.text}")
                return None
        except Exception as e:
            print(f"Agent generation error: {e}")
            return None

    # First attempt
    ans = await _call_sarvam(messages)
    if not ans:
        return "I'm having trouble connecting to my reasoning engine."

    # Check if AI wants to use a tool
    if "SIMULATE" in ans and "{" in ans:
        try:
            # Extract JSON
            json_str = ans[ans.find("{"):ans.rfind("}")+1]
            data = json.loads(json_str)
            if data.get("action") == "SIMULATE":
                sim_res = calculate_emi_and_cost(
                    float(data.get("principal", 0)),
                    float(data.get("roi", 0)),
                    int(data.get("tenure_months", 0)),
                    float(data.get("processing_fee_percent", 0))
                )
                tool_msg = (
                    f"SIMULATOR RESULTS: EMI is {sim_res['monthly_emi']}, "
                    f"Total Interest is {sim_res['total_interest']}. "
                    f"Now explain this to the user natively in {target_lang}."
                )
                messages.append({"role": "assistant", "content": ans})
                messages.append({"role": "user", "content": tool_msg})
                final_ans = await _call_sarvam(messages)
                if final_ans:
                    # Append Generative UI Flag for the frontend
                    ui_flag = f"\n\n[UI: SIMULATOR | P={data.get('principal', 0)} | R={data.get('roi', 0)} | T={data.get('tenure_months', 0)} | F={data.get('processing_fee_percent', 0)}]"  # noqa: E501
                    return final_ans + ui_flag
                return "I calculated the result but had trouble formatting it."
        except Exception as e:
            print(f"Tool execution failed: {e}")

    if "SEARCH" in ans and "{" in ans:
        try:
            from duckduckgo_search import DDGS
            json_str = ans[ans.find("{"):ans.rfind("}")+1]
            data = json.loads(json_str)
            if data.get("action") == "SEARCH":
                search_query = data.get("query", "")
                with DDGS() as ddgs:
                    results = [r for r in ddgs.text(search_query, max_results=3)]

                search_context = "\n".join([f"- {r['title']}: {r['body']}" for r in results])
                tool_msg = f"WEB SEARCH RESULTS for '{search_query}':\n{search_context}\n\nBased on these search results and the document context, answer the user's question natively in {target_lang}."  # noqa: E501
                messages.append({"role": "assistant", "content": ans})
                messages.append({"role": "user", "content": tool_msg})
                final_ans = await _call_sarvam(messages)
                return final_ans if final_ans else "I searched the web but had trouble reading the results."
        except Exception as e:
            print(f"Web Search Tool failed: {e}")

    if "GRAPH_TRAVERSAL" in ans and "{" in ans:
        try:
            from graph_rag import traverse_graph
            json_str = ans[ans.find("{"):ans.rfind("}")+1]
            data = json.loads(json_str)
            if data.get("action") == "GRAPH_TRAVERSAL":
                keyword = data.get("keyword", "")
                raw_clauses = await get_raw_clauses(document_hash)

                graph_context = traverse_graph(raw_clauses, keyword)

                tool_msg = f"DETERMINISTIC GRAPH RAG RESULTS for '{keyword}':\n{graph_context}\n\nBased on this deterministic graph traversal, explain the chain reaction to the user natively in {target_lang}."  # noqa: E501
                messages.append({"role": "assistant", "content": ans})
                messages.append({"role": "user", "content": tool_msg})
                final_ans = await _call_sarvam(messages)
                return final_ans if final_ans else "I traversed the graph but had trouble formatting the result."
        except Exception as e:
            print(f"Graph Traversal Tool failed: {e}")

    return ans
