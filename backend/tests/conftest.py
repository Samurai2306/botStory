import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.database import get_db, Base
from app.db.models import Level, User, UserRole
from app.core.security import get_password_hash

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def _reset_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def db_session():
    return TestingSessionLocal()


SAMPLE_MAP = {
    "width": 3,
    "height": 3,
    "cells": [
        ["empty", "empty", "empty"],
        ["empty", "start", "empty"],
        ["empty", "finish", "empty"],
    ],
}


@pytest.fixture
def sample_level(db_session) -> Level:
    lvl = Level(
        title="Test level",
        description="",
        narrative="N",
        order=1,
        difficulty=1,
        map_data=SAMPLE_MAP,
        golden_code="вперед\nвперед",
        golden_steps_count=5,
        is_active=True,
    )
    db_session.add(lvl)
    db_session.commit()
    db_session.refresh(lvl)
    return lvl


@pytest.fixture
def auth_user(db_session) -> User:
    u = User(
        email="player@example.com",
        username="player1",
        password_hash=get_password_hash("secret123"),
        role=UserRole.USER,
        is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def auth_headers(client, auth_user):
    r = client.post(
        "/api/v1/auth/login",
        data={"username": auth_user.email, "password": "secret123"},
    )
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
