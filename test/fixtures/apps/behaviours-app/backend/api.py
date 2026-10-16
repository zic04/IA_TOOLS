from enum import Enum
from typing import Literal, Optional

from fastapi import FastAPI, Query
from pydantic import BaseModel, EmailStr, Field

app = FastAPI()


class Status(str, Enum):
    OPEN = "open"
    CLOSED = "closed"


class OrderIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    email: Optional[EmailStr] = None
    channel: Literal["web", "phone"]
    quantity: int = Field(1, ge=1, le=99)


@app.get("/orders")
def list_orders(q: Optional[str] = Query(None), page: int = Query(1), limit: int = Query(20)):
    return (
        session.query(Order)
        .filter(Order.customer.ilike(f"%{q}%"))
        .order_by(Order.created.desc())
        .limit(20)
        .all()
    )
