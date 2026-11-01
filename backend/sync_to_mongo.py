import os
import json
from backend.db import save_session_to_db, DATA_DIR

def sync_local_to_mongo():
    print("Đang quét dữ liệu local tại:", DATA_DIR)
    if not os.path.exists(DATA_DIR):
        print("Chưa có thư mục data/sessions")
        return

    count = 0
    for folder in os.listdir(DATA_DIR):
        session_file = os.path.join(DATA_DIR, folder, "session_data.json")
        if os.path.exists(session_file):
            try:
                with open(session_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                # Make sure remote URLs exist or fallback
                for q in data.get("questions", []):
                    if not q.get("remote_audio_url") and q.get("audio_file"):
                        # If audio_file is local path, ensure remote_audio_url fallback can be used if needed
                        pass
                
                print(f"Đang đồng bộ đề: {data.get('title')} ({data.get('session_id')}) lên MongoDB...")
                success = save_session_to_db(data)
                if success:
                    print(f" => Thành công đồng bộ {data.get('session_id')} lên MongoDB Atlas!")
                    count += 1
                else:
                    print(f" => Không kết nối được MongoDB cho {data.get('session_id')}")
            except Exception as e:
                print(f"Lỗi đồng bộ {folder}:", e)
                
    print(f"Hoàn tất đồng bộ {count} đề lên MongoDB Atlas!")

if __name__ == "__main__":
    sync_local_to_mongo()
