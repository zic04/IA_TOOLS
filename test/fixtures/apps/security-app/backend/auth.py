# Fixture: a sign-in route with nothing guarding repeated attempts (a heuristic finding, severity info).
from fastapi import APIRouter

router = APIRouter()


@router.post("/login")
def login(credentials: dict):
    return {"token": "x"}
