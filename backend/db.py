import os
import json
import time
from typing import Optional, List, Dict
import pymongo

DEFAULT_MONGO_URI = "mongodb+srv://thietnguyenthanh300_db_user:admin123@cluster0.atvdjic.mongodb.net/?retryWrites=true&w=majority"
MONGODB_URI = os.environ.get("MONGODB_URI", DEFAULT_MONGO_URI)
DB_NAME = "toeic_db"
COLLECTION_NAME = "sessions"
VOCAB_COLLECTION_NAME = "vocabulary"

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "sessions"))
VOCAB_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "vocabulary.json"))

_client = None

def get_mongo_db():
    global _client
    if not MONGODB_URI:
        return None
    try:
        if _client is None:
            _client = pymongo.MongoClient(MONGODB_URI, serverSelectionTimeoutMS=4000)
        return _client[DB_NAME]
    except Exception as e:
        print("MongoDB connection error:", e)
        return None

def get_mongo_collection():
    db = get_mongo_db()
    return db[COLLECTION_NAME] if db is not None else None

def get_vocab_collection():
    db = get_mongo_db()
    return db[VOCAB_COLLECTION_NAME] if db is not None else None

def save_session_to_db(session_dict: Dict) -> bool:
    """Save or update session in MongoDB with fallback to local disk."""
    saved_mongo = False
    try:
        col = get_mongo_collection()
        if col is not None:
            doc = dict(session_dict)
            doc_id = doc.get("session_id")
            if doc_id:
                col.update_one({"session_id": doc_id}, {"$set": doc}, upsert=True)
                saved_mongo = True
                print(f"[MongoDB] Đã lưu thành công phiên thi {doc_id} vào MongoDB!")
    except Exception as e:
        print("[MongoDB] Không thể lưu vào MongoDB, sử dụng file local:", e)

    # Always also save to local disk as cache/fallback
    try:
        sid = session_dict.get("session_id")
        if sid:
            s_folder = os.path.join(DATA_DIR, sid)
            os.makedirs(s_folder, exist_ok=True)
            with open(os.path.join(s_folder, "session_data.json"), "w", encoding="utf-8") as f:
                json.dump(session_dict, f, indent=2, ensure_ascii=False)
            
            # Update local index.json
            idx_file = os.path.join(DATA_DIR, "index.json")
            sessions = []
            if os.path.exists(idx_file):
                try:
                    with open(idx_file, "r", encoding="utf-8") as f:
                        sessions = json.load(f)
                except Exception:
                    sessions = []
            existing = next((s for s in sessions if s['session_id'] == sid), None)
            if existing:
                existing['title'] = session_dict.get('title')
                existing['total_questions'] = session_dict.get('total_questions')
            else:
                sessions.insert(0, {
                    "session_id": sid,
                    "title": session_dict.get('title'),
                    "total_questions": session_dict.get('total_questions')
                })
            with open(idx_file, "w", encoding="utf-8") as f:
                json.dump(sessions, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print("[LocalDisk] Lỗi lưu file local:", e)

    return saved_mongo

def get_sessions_from_db() -> List[Dict]:
    """Get list of sessions from MongoDB, fallback to local index.json."""
    try:
        col = get_mongo_collection()
        if col is not None:
            cursor = col.find({}, {"session_id": 1, "title": 1, "total_questions": 1, "_id": 0})
            sessions = list(cursor)
            if sessions:
                return sessions
    except Exception as e:
        print("[MongoDB] Lỗi đọc danh sách sessions từ MongoDB:", e)

    idx_file = os.path.join(DATA_DIR, "index.json")
    if os.path.exists(idx_file):
        try:
            with open(idx_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []

def get_session_by_id_from_db(session_id: str) -> Optional[Dict]:
    """Get full session data from MongoDB, fallback to local session_data.json."""
    try:
        col = get_mongo_collection()
        if col is not None:
            doc = col.find_one({"session_id": session_id}, {"_id": 0})
            if doc:
                return doc
    except Exception as e:
        print(f"[MongoDB] Lỗi đọc session {session_id} từ MongoDB:", e)

    s_path = os.path.join(DATA_DIR, session_id, "session_data.json")
    if os.path.exists(s_path):
        try:
            with open(s_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None

def update_session_progress(session_id: str, progress: Dict) -> Dict:
    """Update user's dictation progress for a specific session in MongoDB and local disk."""
    clean_progress = {
        "completed_questions": progress.get("completed_questions", []),
        "completed_items": progress.get("completed_items", {}),
        "last_question_idx": int(progress.get("last_question_idx", 0)),
        "updated_at": int(time.time() * 1000)
    }

    try:
        col = get_mongo_collection()
        if col is not None:
            col.update_one(
                {"session_id": session_id},
                {"$set": {"progress": clean_progress}}
            )
    except Exception as e:
        print(f"[MongoDB Progress] Lỗi lưu tiến độ session {session_id}:", e)

    # Also update local session_data.json if present
    s_path = os.path.join(DATA_DIR, session_id, "session_data.json")
    if os.path.exists(s_path):
        try:
            with open(s_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["progress"] = clean_progress
            with open(s_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[Local Progress] Lỗi lưu tiến độ local {session_id}:", e)

    return clean_progress

# ================= VOCABULARY FUNCTIONS =================

def _load_local_vocab() -> List[Dict]:
    if os.path.exists(VOCAB_FILE):
        try:
            with open(VOCAB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []

def _save_local_vocab(items: List[Dict]):
    try:
        os.makedirs(os.path.dirname(VOCAB_FILE), exist_ok=True)
        with open(VOCAB_FILE, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print("[LocalVocab] Lỗi lưu file vocabulary.json:", e)

def save_vocab_item(vocab_data: Dict) -> Dict:
    """Save or update a vocabulary item in MongoDB and local fallback."""
    word_raw = (vocab_data.get("word") or "").strip()
    word_key = word_raw.lower()
    if not word_key:
        raise ValueError("Từ vựng không được để trống")

    doc = {
        "word_key": word_key,
        "word": word_raw,
        "phonetic": vocab_data.get("phonetic") or "",
        "part_of_speech": vocab_data.get("part_of_speech") or "",
        "meaning": vocab_data.get("meaning") or "",
        "context_en": vocab_data.get("context_en") or "",
        "context_vi": vocab_data.get("context_vi") or "",
        "session_id": vocab_data.get("session_id") or "",
        "question_number": vocab_data.get("question_number") or 0,
        "mastered": bool(vocab_data.get("mastered", False)),
        "updated_at": int(time.time() * 1000)
    }

    try:
        col = get_vocab_collection()
        if col is not None:
            existing = col.find_one({"word_key": word_key}, {"_id": 0})
            if existing and "created_at" in existing:
                doc["created_at"] = existing["created_at"]
            else:
                doc["created_at"] = doc["updated_at"]
            col.update_one({"word_key": word_key}, {"$set": doc}, upsert=True)
    except Exception as e:
        print("[MongoDB Vocab] Lỗi lưu từ vựng:", e)

    # Also update local file
    items = _load_local_vocab()
    idx = next((i for i, x in enumerate(items) if x.get("word_key") == word_key), -1)
    if idx >= 0:
        doc["created_at"] = items[idx].get("created_at", doc["updated_at"])
        items[idx] = doc
    else:
        doc["created_at"] = doc.get("created_at", doc["updated_at"])
        items.insert(0, doc)
    _save_local_vocab(items)

    return doc

def get_vocab_list() -> List[Dict]:
    """Return all saved vocabulary sorted by newest first."""
    try:
        col = get_vocab_collection()
        if col is not None:
            cursor = col.find({}, {"_id": 0}).sort("updated_at", -1)
            res = list(cursor)
            if res:
                return res
    except Exception as e:
        print("[MongoDB Vocab] Lỗi lấy danh sách từ vựng:", e)

    return _load_local_vocab()

def delete_vocab_item(word_key: str) -> bool:
    word_key = word_key.strip().lower()
    deleted = False
    try:
        col = get_vocab_collection()
        if col is not None:
            res = col.delete_one({"word_key": word_key})
            deleted = res.deleted_count > 0
    except Exception as e:
        print("[MongoDB Vocab] Lỗi xóa từ vựng:", e)

    items = _load_local_vocab()
    new_items = [x for x in items if x.get("word_key") != word_key]
    if len(new_items) != len(items):
        deleted = True
        _save_local_vocab(new_items)

    return deleted

def toggle_vocab_mastered(word_key: str) -> Optional[Dict]:
    word_key = word_key.strip().lower()
    updated_doc = None
    try:
        col = get_vocab_collection()
        if col is not None:
            doc = col.find_one({"word_key": word_key}, {"_id": 0})
            if doc:
                new_status = not bool(doc.get("mastered", False))
                col.update_one({"word_key": word_key}, {"$set": {"mastered": new_status}})
                doc["mastered"] = new_status
                updated_doc = doc
    except Exception as e:
        print("[MongoDB Vocab] Lỗi cập nhật trạng thái từ vựng:", e)

    items = _load_local_vocab()
    for x in items:
        if x.get("word_key") == word_key:
            x["mastered"] = updated_doc["mastered"] if updated_doc else not bool(x.get("mastered", False))
            if not updated_doc:
                updated_doc = x
            break
    _save_local_vocab(items)
    return updated_doc
