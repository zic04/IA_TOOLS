from flask import Blueprint, request
from flask_login import login_required

bp = Blueprint("orders", __name__, url_prefix="/orders")


@bp.route("/", methods=["GET", "POST"])
@login_required
def list_orders():
    """The orders of the shop.

    An example, never a route:
        @bp.route("/docstring-example")
    """
    q = request.args.get("q", "")
    return {"q": q}


@bp.get("/<int:order_id>")
def get_order(order_id):
    return {"id": order_id}


# Above the route decorator, login_required wraps the function Flask has already registered: no guard.
@login_required
@bp.delete("/<int:order_id>")
def delete_order(order_id):
    return {}


# @bp.route("/legacy")
