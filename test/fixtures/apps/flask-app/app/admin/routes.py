from flask import Blueprint
from flask_security import roles_required

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


@admin_bp.before_request
def require_staff():
    return None


@admin_bp.route("/users")
@roles_required("admin")
def users():
    return []
