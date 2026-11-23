
from dotenv import load_dotenv
load_dotenv()

from database import SessionLocal
from models import User

# Replace each placeholder with the COMPLETE Firebase UID
# from your Firebase Authentication output.

firebase_uid_map = {
    "admin": "Czp6HYy1eLTQspPlpoeAE27Dg5T2",
    "salesman_a": "9lp41NRdDuUBoDGRkqQcB09eN5r1",
    "salesman_b": "ilhkW6ZBnDZ1t0G7mz7bzA3Abog1",
    "production": "4sC7mP7m4EUSi8kZVYXlxBsT7083",
    "auditor": "nhLvbhRxFLaJ17cK1rY1s6GqA3v2",
    "owner": "KCJN536DKVQ5U5xvjB6m50cAxUd2",
}

# Validate before changing the database
if any(uid.startswith("PASTE_") for uid in firebase_uid_map.values()):
    raise ValueError("Replace all UID placeholders first.")

if len(set(firebase_uid_map.values())) != len(firebase_uid_map):
    raise ValueError("Duplicate Firebase UIDs detected.")

db = SessionLocal()

try:
    for username, firebase_uid in firebase_uid_map.items():
        user = db.query(User).filter(
            User.username == username
        ).first()

        if not user:
            raise ValueError(f"ERP user not found: {username}")

        if user.firebase_uid and user.firebase_uid != firebase_uid:
            raise ValueError(
                f"{username} already has a different Firebase UID."
            )

        user.firebase_uid = firebase_uid

    db.commit()

    print("Firebase accounts linked successfully!")

    for username in firebase_uid_map:
        user = db.query(User).filter(
            User.username == username
        ).first()

        print(f"{user.username} -> {user.role} -> LINKED")

except Exception:
    db.rollback()
    raise

finally:
    db.close()
