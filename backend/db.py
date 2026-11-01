import os
import json
from typing import Optional, List, Dict
import pymongo
from pymongo.errors import PyMongoError

DEFAULT_MONGO_URI = "mongodb+srv://thietnguyenthanh300_db_user:admin123@cluster0.atvdjic.mongodb.net/?retryWrites=true&w=majority"
MONGODB_URI = os.environ.get("MONGODB_URI", DEFAULT_MONGO_URI)
DB_NAME = "toeic_db"
COLLECTION_NAME = "sessions"

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "sessions"))

_client = None

def get_mongo_collection():
    global _client
    if not MONGODB_URI:
        return None
    try:
        if _client is None:
            _client = pymongo.MongoClient(MONGODB_URI, serverSelectionTimeoutMS=4000)
        db = _client[DB_NAME]
        return db[COLLECTION_NAME]
    except Exception as e:
        print("MongoDB connection error:", e)
        return None

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

    # Fallback to local index.json
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

    # Fallback to local session_data.json
    s_path = os.path.join(DATA_DIR, session_id, "session_data.json")
    if os.path.exists(s_path):
        try:
            with open(s_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None
