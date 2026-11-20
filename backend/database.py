from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os

# Local development SQLite; while Live deploying DATABASE_URL env variable ->PostgreSQL URL

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./snack_factory.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
