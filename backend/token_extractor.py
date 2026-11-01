import os
import glob
import re
import json
import base64
import time

def decode_jwt_payload(token: str) -> dict:
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return {}
        payload = parts[1]
        padded = payload + '=' * (-len(payload) % 4)
        data = base64.urlsafe_b64decode(padded)
        return json.loads(data.decode('utf-8'))
    except Exception:
        return {}

def extract_tokens_from_chrome() -> list:
    """Scan Chrome User Data for active Parroto Firebase JWT tokens."""
    user_home = os.path.expanduser("~")
    chrome_data_dir = os.path.join(user_home, "AppData", "Local", "Google", "Chrome", "User Data")
    if not os.path.exists(chrome_data_dir):
        return []

    tokens = []
    
    # Check all possible profiles (Default, Profile 1, Profile 2, etc.)
    profiles = ["Default"] + [f"Profile {i}" for i in range(1, 20)]
    
    for profile in profiles:
        idb_base = os.path.join(chrome_data_dir, profile, "IndexedDB")
        if not os.path.exists(idb_base):
            continue
            
        for folder in os.listdir(idb_base):
            if "parroto" in folder.lower() and folder.endswith(".leveldb"):
                leveldb_path = os.path.join(idb_base, folder)
                for fpath in glob.glob(os.path.join(leveldb_path, "*.ldb")) + glob.glob(os.path.join(leveldb_path, "*.log")):
                    try:
                        with open(fpath, "rb") as fp:
                            content = fp.read()
                        matches = re.findall(rb'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+', content)
                        for m in matches:
                            t_str = m.decode('ascii', errors='ignore')
                            if t_str not in tokens:
                                tokens.append(t_str)
                    except Exception:
                        continue

    # Filter by unexpired tokens or sort by latest expiration
    now = time.time()
    valid_tokens = []
    for tok in tokens:
        payload = decode_jwt_payload(tok)
        # Firebase token contains 'exp' and 'user_id'
        if payload.get('iss', '').startswith('https://securetoken.google.com/'):
            exp = payload.get('exp', 0)
            valid_tokens.append({
                'token': tok,
                'exp': exp,
                'email': payload.get('email', ''),
                'expired': exp < now if exp else False
            })
            
    # Sort with newest/valid tokens first
    valid_tokens.sort(key=lambda x: x['exp'], reverse=True)
    return valid_tokens

def get_best_token(manual_token: str = None) -> str:
    """Return manual token if provided and non-empty, otherwise find the freshest token in Chrome."""
    if manual_token and manual_token.strip():
        return manual_token.strip()
        
    tokens = extract_tokens_from_chrome()
    if tokens:
        return tokens[0]['token']
    return None

if __name__ == "__main__":
    toks = extract_tokens_from_chrome()
    print(f"Found {len(toks)} tokens.")
    if toks:
        print("Best token email:", toks[0].get('email'))
        print("Expired:", toks[0].get('expired'))
        print("Token snippet:", toks[0]['token'][:40] + "...")
