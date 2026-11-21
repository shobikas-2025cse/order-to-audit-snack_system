
import os
import json
import hmac
import hashlib
import base64
import time

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from database import SessionLocal
from models import User

AUTH_SECRET = os.getenv("AUTH_SECRET")

if not AUTH_SECRET or len(AUTH_SECRET) < 32:
    raise RuntimeError("AUTH_SECRET must be at least 32 characters long")

bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(user):
    payload = {
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "exp": int(time.time()) + 28800
    }

    data = base64.urlsafe_b64encode(
        json.dumps(payload).encode()
    ).decode().rstrip("=")

    signature = hmac.new(
        AUTH_SECRET.encode(),
        data.encode(),
        hashlib.sha256
    ).hexdigest()

    return f"{data}.{signature}"


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    token = credentials.credentials

    try:
        data, signature = token.rsplit(".", 1)

        expected_signature = hmac.new(
            AUTH_SECRET.encode(),
            data.encode(),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, expected_signature):
            raise ValueError("Invalid signature")

        padded_data = data + "=" * (-len(data) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded_data))

        if payload["exp"] < int(time.time()):
            raise ValueError("Token expired")

        db = SessionLocal()
        try:
            user = db.query(User).filter(
                User.id == payload["user_id"]
            ).first()

            if not user or user.role != payload["role"]:
                raise ValueError("Invalid user")

            return user
        finally:
            db.close()

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token"
        )


def require_roles(*allowed_roles):
    def role_checker(current_user=Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action"
            )
        return current_user

    return role_checker

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    iterations = 310000

    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt,
        iterations
    )

    return f"pbkdf2_sha256${iterations}${salt.hex()}${key.hex()}"


def verify_password(password: str, stored_password: str) -> bool:
    try:
        algorithm, iterations, salt, expected_hash = stored_password.split("$")

        if algorithm != "pbkdf2_sha256":
            return False

        actual_hash = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode(),
            bytes.fromhex(salt),
            int(iterations)
        )

        return hmac.compare_digest(
            actual_hash.hex(),
            expected_hash
        )

    except (ValueError, TypeError):
        return False
