import os
import uuid
from pathlib import Path

os.environ["THREADS_DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["THREADS_JWT_SECRET"] = "test-secret"
os.environ["THREADS_DEBUG"] = "true"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

engine = create_engine(
    "sqlite+pysqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def override_db():
    with TestingSession() as session:
        yield session


app.dependency_overrides[get_db] = override_db


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def test_upload_dir():
    path = Path(__file__).parent / f".uploads-{uuid.uuid4().hex}"
    path.mkdir()
    yield path
    for item in path.iterdir():
        item.unlink()
    path.rmdir()


@pytest.fixture
def registered(client):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "an@example.com",
            "username": "an.nguyen",
            "display_name": "An Nguyen",
            "password": "Password123!",
        },
    )
    assert response.status_code == 201, response.text
    data = response.json()
    return data, {"Authorization": f"Bearer {data['access_token']}"}
