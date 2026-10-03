# Fixture: FastAPI entry point, for the `api` facts source and the `fastapi` coverage adapter.
# include_router's own "/api" prefix composes with the router's own "/orders" prefix (declared in routers/orders.py):
# the final routes are "/api/orders" and "/api/orders/{order_id}" (engine/facts/api.mjs matches by variable name,
# so the router must keep the name it was declared with across the include_router call).
from fastapi import FastAPI
from routers.orders import router

app = FastAPI()
app.include_router(router, prefix="/api")


@app.get("/health")
def health():
    return {"ok": True}
