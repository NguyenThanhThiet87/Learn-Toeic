import re
from bs4 import BeautifulSoup

def clean_html_text(html_text: str) -> str:
    if not html_text:
        return ""
    # Replace non-breaking spaces and tags
    text = html_text.replace('&nbsp;', ' ').replace('\xa0', ' ')
    soup = BeautifulSoup(text, 'html.parser')
    clean = soup.get_text()
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean

def extract_part2_question_and_choices(audio_transcript: str, info_vi: str, choices: list):
    """
    Extract Question text (EN & VI) and Choices (EN & VI).
    Also detect correct choice by looking for <strong> tag.
    """
    soup_en = BeautifulSoup(audio_transcript or "", 'html.parser')
    p_tags_en = [clean_html_text(p.decode_contents()) for p in soup_en.find_all('p') if clean_html_text(p.decode_contents())]
    
    soup_vi = BeautifulSoup(info_vi or "", 'html.parser')
    p_tags_vi = [clean_html_text(p.decode_contents()) for p in soup_vi.find_all('p') if clean_html_text(p.decode_contents())]

    # Question is the first item that doesn't start with (A), (B), (C)
    q_en = ""
    q_vi = ""
    if p_tags_en:
        first = p_tags_en[0]
        if not re.match(r'^\s*\([A-D]\)', first):
            q_en = first
    if p_tags_vi:
        first_vi = p_tags_vi[0]
        if not re.match(r'^\s*\([A-D]\)', first_vi):
            q_vi = first_vi

    # Check for correct answer label marked with <strong>
    correct_label = None
    strong_tag = soup_en.find('strong')
    if strong_tag:
        st_text = strong_tag.get_text()
        m = re.search(r'\(([A-D])\)', st_text)
        if m:
            correct_label = m.group(1)

    items = []
    # 1. Question item
    if q_en:
        items.append({
            "key": "Q",
            "label": "Câu hỏi (Question)",
            "en": q_en,
            "vi": q_vi,
            "is_correct": False
        })

    # 2. Choice items
    for ch in choices:
        label = ch.get('label', '')
        t_en = ch.get('text', {}).get('en', '')
        t_vi = ch.get('text', {}).get('vi', '')
        # Clean if needed
        t_en = clean_html_text(t_en)
        t_vi = clean_html_text(t_vi)
        # Strip leading (A) if present
        t_en = re.sub(r'^\s*\([A-D]\)\s*', '', t_en)
        t_vi = re.sub(r'^\s*\([A-D]\)\s*', '', t_vi)

        items.append({
            "key": label,
            "label": f"({label})",
            "en": t_en,
            "vi": t_vi,
            "is_correct": (label == correct_label)
        })

    return items, correct_label

def parse_part1_question(group: dict, question: dict):
    """
    Parse Part 1 question (4 choices A, B, C, D).
    """
    choices = question.get('choices', [])
    ctx = group.get('context', {})
    audio_transcript = ctx.get('audio_transcript', '')
    
    # Check if correct label is marked with <strong>
    correct_label = None
    soup_en = BeautifulSoup(audio_transcript or "", 'html.parser')
    strong_tag = soup_en.find('strong')
    if strong_tag:
        m = re.search(r'\(([A-D])\)', strong_tag.get_text())
        if m:
            correct_label = m.group(1)

    items = []
    for ch in choices:
        label = ch.get('label', '')
        t_en = clean_html_text(ch.get('text', {}).get('en', ''))
        t_vi = clean_html_text(ch.get('text', {}).get('vi', ''))
        t_en = re.sub(r'^\s*\([A-D]\)\s*', '', t_en)
        t_vi = re.sub(r'^\s*\([A-D]\)\s*', '', t_vi)

        items.append({
            "key": label,
            "label": f"({label})",
            "en": t_en,
            "vi": t_vi,
            "is_correct": (label == correct_label)
        })

    return items, correct_label
