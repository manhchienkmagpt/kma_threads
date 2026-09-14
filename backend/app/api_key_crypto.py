import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class APIKeyDecryptionError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _cipher() -> Fernet:
    configured = settings.api_key_encryption_secret
    configured_value = configured.get_secret_value().strip() if configured else ""
    secret = configured_value or settings.jwt_secret
    digest = hashlib.sha256(f"kma-threads-api-key:{secret}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_api_key(api_key: str) -> str:
    return _cipher().encrypt(api_key.encode()).decode()


def decrypt_api_key(encrypted_api_key: str) -> str:
    try:
        return _cipher().decrypt(encrypted_api_key.encode()).decode()
    except (InvalidToken, ValueError) as exc:
        raise APIKeyDecryptionError("Unable to decrypt the stored API key") from exc
