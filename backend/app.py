import os
import json
import urllib.request
import urllib.parse
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel
from typing import Optional

from backend.crawler import crawl_exam_session, list_downloaded_sessions, get_session_details, DATA_DIR
from backend.token_extractor import get_best_token, extract_tokens_from_chrome
from backend.db import (
    save_vocab_item,
    get_vocab_list,
    delete_vocab_item,
    toggle_vocab_mastered,
    update_session_progress
)

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

class VocabRequest(BaseModel):
    word: str
    phonetic: Optional[str] = ""
    part_of_speech: Optional[str] = ""
    meaning: str
    context_en: Optional[str] = ""
    context_vi: Optional[str] = ""
    session_id: Optional[str] = ""
    question_number: Optional[int] = 0

class ProgressUpdateRequest(BaseModel):
    completed_questions: list[int] = []
    completed_items: dict[str, list[int]] = {}
    last_question_idx: int = 0

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

@app.post("/api/sessions/{session_id}/progress")
def save_progress(session_id: str, req: ProgressUpdateRequest):
    payload = req.model_dump() if hasattr(req, "model_dump") else req.dict()
    saved = update_session_progress(session_id, payload)
    return {"status": "ok", "progress": saved}

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

# ================= WORD LOOKUP & VOCABULARY API =================

POS_VI_MAP = {
    "noun": "Danh từ",
    "verb": "Động từ",
    "adjective": "Tính từ",
    "adverb": "Trạng từ",
    "preposition": "Giới từ",
    "conjunction": "Liên từ",
    "pronoun": "Đại từ",
    "interjection": "Thán từ"
}

@app.get("/api/lookup-word")
def lookup_word(text: str = Query(..., min_length=1)):
    clean_text = text.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text rỗng")

    primary_meaning = ""
    pos_list = []
    extra_meanings = []
    phonetic = ""

    # 1. Google Translate GTX with dictionary breakdown (dt=t&dt=bd)
    try:
        q_encoded = urllib.parse.quote(clean_text)
        g_url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&dt=bd&q={q_encoded}"
        req = urllib.request.Request(g_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            g_data = json.loads(resp.read().decode("utf-8"))
            if g_data and isinstance(g_data[0], list):
                primary_meaning = "".join([part[0] for part in g_data[0] if part and part[0]])
            if len(g_data) > 1 and isinstance(g_data[1], list):
                for entry in g_data[1]:
                    if isinstance(entry, list) and len(entry) >= 2:
                        pos_en = (entry[0] or "").lower()
                        pos_vi = POS_VI_MAP.get(pos_en, entry[0])
                        if pos_vi and pos_vi not in pos_list:
                            pos_list.append(pos_vi)
                        terms = entry[1][:4] if isinstance(entry[1], list) else []
                        if terms:
                            extra_meanings.append(f"{pos_vi}: {', '.join(terms)}")
    except Exception as e:
        print("Google GTX lookup warning:", e)

    # 2. Free Dictionary API for IPA phonetic (if 1 or 2 words)
    words = clean_text.split()
    if 1 <= len(words) <= 2:
        target_w = words[0].strip(".,!?;:\"'()").lower()
        try:
            d_url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{urllib.parse.quote(target_w)}"
            req = urllib.request.Request(d_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                d_data = json.loads(resp.read().decode("utf-8"))
                if isinstance(d_data, list) and len(d_data) > 0:
                    entry0 = d_data[0]
                    phonetic = entry0.get("phonetic") or ""
                    if not phonetic:
                        for p in entry0.get("phonetics", []):
                            if p.get("text"):
                                phonetic = p["text"]
                                break
                    if not pos_list:
                        for m in entry0.get("meanings", []):
                            p_en = (m.get("partOfSpeech") or "").lower()
                            p_vi = POS_VI_MAP.get(p_en, p_en)
                            if p_vi and p_vi not in pos_list:
                                pos_list.append(p_vi)
        except Exception:
            pass

    combined_meaning = primary_meaning
    if extra_meanings:
        combined_meaning = f"{primary_meaning} ({' | '.join(extra_meanings)})"

    return {
        "word": clean_text,
        "phonetic": phonetic,
        "part_of_speech": ", ".join(pos_list),
        "primary_meaning": primary_meaning,
        "detailed_meaning": combined_meaning,
        "extra_meanings": extra_meanings
    }

@app.get("/api/vocabulary")
def list_vocabulary():
    return get_vocab_list()

@app.post("/api/vocabulary")
def add_vocabulary(req: VocabRequest):
    try:
        saved = save_vocab_item(req.model_dump() if hasattr(req, "model_dump") else req.dict())
        return saved
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/vocabulary/{word_key}")
def remove_vocabulary(word_key: str):
    decoded_key = urllib.parse.unquote(word_key)
    ok = delete_vocab_item(decoded_key)
    return {"deleted": ok, "word_key": decoded_key}

@app.patch("/api/vocabulary/{word_key}/master")
def master_vocabulary(word_key: str):
    decoded_key = urllib.parse.unquote(word_key)
    updated = toggle_vocab_mastered(decoded_key)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy từ vựng")
    return updated

# ================= SMART MEDIA ROUTES =================

@app.get("/media/{session_id}/audios/{filename}")
def serve_audio(session_id: str, filename: str):
    local_path = os.path.join(DATA_DIR, session_id, "audios", filename)
    if os.path.exists(local_path) and os.path.getsize(local_path) > 100:
        return FileResponse(local_path, media_type="audio/mpeg")
    
    data = get_session_details(session_id)
    if data:
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
