import base64
import json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PARROTO_AES_KEY_B64 = "ECJe1m62IPoNYovN/BiSXd5Xu6r1nrV86MZ0zCoX8To="

def decrypt_parroto_data(encrypted_data_b64: str, key_b64: str = PARROTO_AES_KEY_B64) -> dict:
    """Decrypt AES-GCM 256 response from Parroto API."""
    key = base64.b64decode(key_b64)
    raw = base64.b64decode(encrypted_data_b64)
    
    # Parroto puts 12-byte IV at the beginning
    iv = raw[:12]
    ciphertext = raw[12:]
    
    aesgcm = AESGCM(key)
    decrypted_bytes = aesgcm.decrypt(iv, ciphertext, None)
    text = decrypted_bytes.decode('utf-8')
    return json.loads(text)

if __name__ == "__main__":
    print("Decryptor module ready.")
