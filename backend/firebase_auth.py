
import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, auth
from dotenv import load_dotenv
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import get_db
from models import User
from sqlalchemy.orm import Session
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

service_account_path = os.getenv(
    "FIREBASE_SERVICE_ACCOUNT_PATH",
    "firebase-service-account.json"
)

credential_file = BASE_DIR / service_account_path

if not firebase_admin._apps:
    cred = credentials.Certificate(str(credential_file))
    firebase_admin.initialize_app(cred)

bearer_scheme = HTTPBearer(auto_error=False)


def verify_firebase_user(
    credentials_data: HTTPAuthorizationCredentials = Depends(bearer_scheme)
):
    if credentials_data is None:
        raise HTTPException(
            status_code=401,
            detail="Missing authentication token"
        )

    try:
        decoded_token = auth.verify_id_token(
            credentials_data.credentials
        )
        return decoded_token

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired Firebase token"
        )

def get_current_erp_user(
    decoded_token=Depends(verify_firebase_user),
    db: Session = Depends(get_db)
):
    firebase_uid = decoded_token.get("uid")

    if not firebase_uid:
        raise HTTPException(
            status_code=401,
            detail="Firebase UID missing"
        )

    user = db.query(User).filter(
        User.firebase_uid == firebase_uid
    ).first()

    if not user:
        raise HTTPException(
            status_code=403,
            detail="Firebase account is not linked to an ERP user"
        )

    return user


def require_firebase_roles(*allowed_roles):
    def role_checker(
        current_user: User = Depends(get_current_erp_user)
    ):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action"
            )

        return current_user

    return role_checker
