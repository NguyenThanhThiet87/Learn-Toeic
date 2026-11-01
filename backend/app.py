import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel
from typing import Optional

from backend.crawler import crawl_exam_session, list_downloaded_sessions, get_session_details, DATA_DIR
from backend.token_extractor import get_best_token, extract_tokens_from_chrome

app = FastAPI(title="TOEIC Dictation Practice Tool")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CrawlRequest(BaseModel):
    url: str
    token: Optional[str] = None

# In-memory crawl status
crawl_status = {
    "status": "idle",
    "message": "",
    "percentage": 0,
    "session_id": None,
    "error": None
}

@app.get("/api/token-status")
def token_status():
    tokens = extract_tokens_from_chrome()
    if tokens:
        t = tokens[0]
        return {
            "has_token": True,
            "email": t.get("email"),
            "expired": t.get("expired", False),
            "token_snippet": t["token"][:30] + "..."
        }
    return {
        "has_token": False,
        "message": "Không tìm thấy token trong Google Chrome. Bạn có thể dán token thủ công nếu cần."
    }

@app.get("/api/sessions")
def get_sessions():
    return list_downloaded_sessions()

@app.get("/api/sessions/{session_id}")
def get_session(session_id: str):
    data = get_session_details(session_id)
    if not data:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài thi")
    return data

@app.post("/api/crawl")
def start_crawl(req: CrawlRequest):
    global crawl_status
    try:
        crawl_status = {
            "status": "running",
            "message": "Đang khởi động tiến trình cào đề...",
            "percentage": 5,
            "session_id": None,
            "error": None
        }

        def on_progress(msg, pct):
            global crawl_status
            crawl_status["message"] = msg
            crawl_status["percentage"] = pct

        res = crawl_exam_session(req.url, manual_token=req.token, progress_cb=on_progress)
        crawl_status["status"] = "success"
        crawl_status["message"] = "Đã cào thành công toàn bộ 31 câu audio & lưu vào MongoDB Atlas!"
        crawl_status["percentage"] = 100
        crawl_status["session_id"] = res["session_id"]
        return res
    except Exception as e:
        crawl_status["status"] = "error"
        crawl_status["error"] = str(e)
        crawl_status["message"] = f"Lỗi: {str(e)}"
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/crawl-status")
def get_crawl_status():
    return crawl_status

# Smart Media Route: Serves local file if exists, otherwise redirects to Parroto CDN URL!
@app.get("/media/{session_id}/audios/{filename}")
def serve_audio(session_id: str, filename: str):
    local_path = os.path.join(DATA_DIR, session_id, "audios", filename)
    if os.path.exists(local_path) and os.path.getsize(local_path) > 100:
        return FileResponse(local_path, media_type="audio/mpeg")
    
    # Cloud fallback: query MongoDB for remote_audio_url
    data = get_session_details(session_id)
    if data:
        # filename is e.g. q1.mp3 -> question_number = 1
        m = filename.replace(".mp3", "").replace("q", "")
        if m.isdigit():
            q_num = int(m)
            for q in data.get("questions", []):
                if q.get("question_number") == q_num:
                    remote = q.get("remote_audio_url")
                    if remote:
                        return RedirectResponse(url=remote, status_code=307)
    raise HTTPException(status_code=404, detail="Audio not found")

@app.get("/media/{session_id}/images/{filename}")
def serve_image(session_id: str, filename: str):
    local_path = os.path.join(DATA_DIR, session_id, "images", filename)
    if os.path.exists(local_path) and os.path.getsize(local_path) > 100:
        return FileResponse(local_path, media_type="image/webp")
    
    # Cloud fallback
    data = get_session_details(session_id)
    if data:
        m = filename.replace(".webp", "").replace("q", "")
        if m.isdigit():
            q_num = int(m)
            for q in data.get("questions", []):
                if q.get("question_number") == q_num:
                    remote = q.get("remote_image_url")
                    if remote:
                        return RedirectResponse(url=remote, status_code=307)
    raise HTTPException(status_code=404, detail="Image not found")

# Mount frontend
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
os.makedirs(FRONTEND_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/")
def serve_index():
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Frontend chưa khởi tạo"}
