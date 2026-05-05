from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from groq import Groq
from supabase import create_client
from huggingface_hub import InferenceClient
import requests
import time
import os
from dotenv import load_dotenv
load_dotenv() 

# ── config ────────────────────────────────────────────────────

# ──────────────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
HF_TOKEN = os.getenv("HF_TOKEN")
 


app = FastAPI(title="Jay's AI Assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# clients
groq_client = Groq(api_key=GROQ_API_KEY)
supabase    = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
hf_client   = InferenceClient(provider="hf-inference", api_key=HF_TOKEN)


# ── helpers ───────────────────────────────────────────────────
app = FastAPI(title="Jay's AI Assistant")
 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
 
groq_client = Groq(api_key=GROQ_API_KEY)
supabase    = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
 
 
# ── helpers ───────────────────────────────────────────────────
 
def call_edge(endpoint: str, payload: dict) -> dict:
    """Call a Supabase edge function"""
    res = requests.post(
        f"{SUPABASE_URL}/functions/v1/{endpoint}",
        headers={
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json"
        },
        json=payload
    )
    return res.json()
 
def search_memories(query: str, match_count: int = 5) -> list:
    """Use the search edge function we built"""
    data = call_edge("search", {"query": query, "match_count": match_count})
    return data.get("results", [])
 
 
# ── routes ────────────────────────────────────────────────────
 
# 1. transcribe audio via Groq Whisper
@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    transcription = groq_client.audio.transcriptions.create(
        file=(file.filename, audio_bytes, "audio/wav"),
        model="whisper-large-v3",
        language="hi",
        response_format="json"
    )
    return {"text": transcription.text}
 
 
# 2. save audio to Supabase Storage
@app.post("/save-audio")
async def save_audio(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    filename = f"rec_{int(time.time())}.wav"
    supabase.storage.from_("audio").upload(
        filename,
        audio_bytes,
        {"content-type": "audio/wav"}
    )
    url = supabase.storage.from_("audio").get_public_url(filename)
    return {"filename": filename, "url": url}
 
 
# 3. save text + embedding via embed edge function
class EmbedRequest(BaseModel):
    text: str
    audio_url: str = ""
 
@app.post("/embed")
async def embed(body: EmbedRequest):
    result = call_edge("embed", {"text": body.text, "audio_url": body.audio_url})
    return result
 
 
# 4. search memories via search edge function
class SearchRequest(BaseModel):
    query: str
    match_count: int = 5
 
@app.post("/search")
async def search(body: SearchRequest):
    results = search_memories(body.query, body.match_count)
    return {"results": results}
 
 
# 5. search + Llama planning
class PlanRequest(BaseModel):
    text: str
    match_count: int = 5
 
@app.post("/plan")
async def plan(body: PlanRequest):
    # fetch relevant memories via search edge function
    memories = search_memories(body.text, body.match_count)
 
    # build context
    if memories:
        context = "\n".join([
            f"- {m['text']} (relevance: {(m['similarity'] * 100):.0f}%)"
            for m in memories
        ])
    else:
        context = "No relevant memories found."
 
    # call Groq Llama
    llm_response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": """You are a smart personal assistant for Jay.
You help with planning, reminders, and summarization.
Based on the user's current note and their past memories, give actionable planning advice.
Be concise and direct. Use bullet points for action items.
If the user writes in Hindi or Hinglish, respond in the same language."""
            },
            {
                "role": "user",
                "content": f"My past memories/notes:\n{context}\n\nCurrent note: {body.text}\n\nPlease help me plan and summarize."
            }
        ],
        temperature=0.7,
        max_tokens=1024
    )
 
    return {
        "answer": llm_response.choices[0].message.content,
        "memories": memories
    }
 
 
# serve frontend
@app.get("/")
async def serve_frontend():
    return FileResponse("assistant.html")
 
 
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)