from fastapi import APIRouter
from .deps import db

router = APIRouter()


@router.get("/api/orders/{id}")
def get_order(id: str):
    return db()
