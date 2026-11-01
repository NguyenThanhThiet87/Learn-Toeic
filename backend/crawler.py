import os
import re
import json
import urllib.request
import urllib.error
from typing import Optional, Callable
from backend.token_extractor import get_best_token
from backend.decryptor import decrypt_parroto_data
from backend.exam_parser import parse_part1_question, extract_part2_question_and_choices
from backend.db import save_session_to_db, get_sessions_from_db, get_session_by_id_from_db, DATA_DIR

def extract_session_id(url_or_id: str) -> str:
    url_or_id = url_or_id.strip()
    m = re.search(r'/session/([a-f0-9]{24})', url_or_id)
    if m:
        return m.group(1)
    if re.fullmatch(r'[a-f0-9]{24}', url_or_id):
        return url_or_id
    raise ValueError(f"Không nhận diện được Session ID hợp lệ từ: {url_or_id}")

def download_file(url: str, dest_path: str):
    """Download audio/image file with timeout and headers."""
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 100:
        return
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://parroto.app/'
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp, open(dest_path, 'wb') as out_f:
            while True:
                chunk = resp.read(64 * 1024)
                if not chunk:
                    break
                out_f.write(chunk)
    except Exception as e:
        print(f"Warning: Không thể tải file {url}: {e}")

def fetch_api(url: str, token: str) -> dict:
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Authorization': f'Bearer {token}',
        'Origin': 'https://parroto.app',
        'Referer': 'https://parroto.app/'
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read().decode('utf-8')
            return json.loads(data)
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise RuntimeError("Token xác thực đã hết hạn hoặc không hợp lệ. Vui lòng mở Parroto trên Chrome hoặc đăng nhập lại.")
        raise RuntimeError(f"Lỗi kết nối Parroto API ({e.code}): {e.reason}")

def crawl_exam_session(session_url_or_id: str, manual_token: Optional[str] = None, progress_cb: Optional[Callable[[str, int], None]] = None) -> dict:
    session_id = extract_session_id(session_url_or_id)
    if progress_cb: progress_cb("Đang kiểm tra token xác thực...", 5)
    
    token = get_best_token(manual_token)
    if not token:
        raise RuntimeError("Không tìm thấy token đăng nhập Parroto trong Google Chrome. Hãy đảm bảo bạn đã mở hoặc đăng nhập parroto.app trên Chrome!")

    session_folder = os.path.join(DATA_DIR, session_id)
    audios_folder = os.path.join(session_folder, "audios")
    images_folder = os.path.join(session_folder, "images")
    os.makedirs(audios_folder, exist_ok=True)
    os.makedirs(images_folder, exist_ok=True)

    # 1. Lấy thông tin chung session
    if progress_cb: progress_cb("Đang lấy thông tin đề thi...", 10)
    sess_url = f"https://api.parroto.app/api/exams/sessions/{session_id}"
    sess_resp = fetch_api(sess_url, token)
    sess_data = sess_resp.get('data', {}).get('session', {})
    exam_title = sess_data.get('title') or "TOEIC Exam"

    # 2. Lấy & giải mã Part 1 (câu 1 - 6)
    if progress_cb: progress_cb("Đang tải dữ liệu Part 1...", 20)
    p1_url = f"https://api.parroto.app/api/exams/sessions/{session_id}/questions?part=1"
    p1_raw = fetch_api(p1_url, token)
    if p1_raw.get('encrypted'):
        p1_data = decrypt_parroto_data(p1_raw['data'])
    else:
        p1_data = p1_raw

    # 3. Lấy & giải mã Part 2 (câu 7 - 31)
    if progress_cb: progress_cb("Đang tải dữ liệu Part 2...", 35)
    p2_url = f"https://api.parroto.app/api/exams/sessions/{session_id}/questions?part=2"
    p2_raw = fetch_api(p2_url, token)
    if p2_raw.get('encrypted'):
        p2_data = decrypt_parroto_data(p2_raw['data'])
    else:
        p2_data = p2_raw

    questions_list = []

    # Xử lý Part 1
    p1_groups = p1_data.get('data', {}).get('groups', [])
    p1_questions = p1_data.get('data', {}).get('questions', [])
    q_map_p1 = {q.get('group_id'): q for q in p1_questions}

    for idx, grp in enumerate(p1_groups):
        q_num = idx + 1
        q_obj = q_map_p1.get(grp.get('_id'), {})
        ctx = grp.get('context', {})
        audio_remote = ctx.get('audio_url')
        image_remote = ctx.get('image_url')

        # Download audio
        local_audio_name = f"q{q_num}.mp3"
        local_audio_path = os.path.join(audios_folder, local_audio_name)
        if audio_remote:
            download_file(audio_remote, local_audio_path)

        # Download image
        local_image_name = f"q{q_num}.webp"
        local_image_path = os.path.join(images_folder, local_image_name)
        if image_remote:
            download_file(image_remote, local_image_path)

        items, correct_choice = parse_part1_question(grp, q_obj)
        questions_list.append({
            "question_number": q_num,
            "part": 1,
            "title": f"Part 1 - Câu {q_num}",
            "audio_file": f"/media/{session_id}/audios/{local_audio_name}",
            "image_file": f"/media/{session_id}/images/{local_image_name}" if image_remote else None,
            "remote_audio_url": audio_remote,
            "remote_image_url": image_remote,
            "items": items,
            "correct_choice": correct_choice,
            "audio_transcript": ctx.get('audio_transcript', ''),
            "info_vi": ctx.get('info', '')
        })

    # Xử lý Part 2
    if progress_cb: progress_cb("Đang tải audio và dữ liệu Part 2...", 60)
    p2_groups = p2_data.get('data', {}).get('groups', [])
    p2_questions = p2_data.get('data', {}).get('questions', [])
    q_map_p2 = {q.get('group_id'): q for q in p2_questions}

    total_p2 = len(p2_groups)
    for idx, grp in enumerate(p2_groups):
        q_num = idx + 7
        q_obj = q_map_p2.get(grp.get('_id'), {})
        ctx = grp.get('context', {})
        audio_remote = ctx.get('audio_url')

        local_audio_name = f"q{q_num}.mp3"
        local_audio_path = os.path.join(audios_folder, local_audio_name)
        if audio_remote:
            download_file(audio_remote, local_audio_path)

        items, correct_choice = extract_part2_question_and_choices(
            ctx.get('audio_transcript', ''),
            ctx.get('info', ''),
            q_obj.get('choices', [])
        )

        questions_list.append({
            "question_number": q_num,
            "part": 2,
            "title": f"Part 2 - Câu {q_num}",
            "audio_file": f"/media/{session_id}/audios/{local_audio_name}",
            "image_file": None,
            "remote_audio_url": audio_remote,
            "remote_image_url": None,
            "items": items,
            "correct_choice": correct_choice,
            "audio_transcript": ctx.get('audio_transcript', ''),
            "info_vi": ctx.get('info', '')
        })

        if progress_cb and idx % 5 == 0:
            pct = 60 + int((idx / max(total_p2, 1)) * 35)
            progress_cb(f"Đang tải audio câu {q_num}...", pct)

    final_data = {
        "session_id": session_id,
        "title": exam_title,
        "total_questions": len(questions_list),
        "questions": questions_list
    }

    # Save to MongoDB & local disk
    save_session_to_db(final_data)

    if progress_cb: progress_cb("Hoàn tất cào dữ liệu và đã lưu vào MongoDB Atlas!", 100)
    return final_data

def list_downloaded_sessions() -> list:
    return get_sessions_from_db()

def get_session_details(session_id: str) -> Optional[dict]:
    return get_session_by_id_from_db(session_id)
