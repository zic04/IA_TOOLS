# Fixture: an APIRouter with its own prefix, included by main.py with an extra prefix: the final route composes
# both ("/api" + "/orders"). Each handler also exercises a different `auth` classification of the `api` facts
# source (ARCHITECTURE.md §6.13): list_orders has no guard (auth "none"), get_order depends on the current user
# (auth "user", DEFAULT_USER_GUARD matches "current_user"), create_order depends on an admin check (auth "role",
# DEFAULT_ROLE_GUARD matches "admin").
import os
from fastapi import APIRouter, Depends

router = APIRouter(prefix="/orders")

DATABASE_URL = os.environ["DATABASE_URL"]


def get_current_user():
    return {"id": "u1"}


def require_admin():
    return True


@router.get("/")
def list_orders():
    return []


@router.get("/{order_id}")
def get_order(order_id: str, user=Depends(get_current_user)):
    return {"id": order_id}


@router.post("/")
def create_order(ok: bool = Depends(require_admin)):
    return {"created": True}
