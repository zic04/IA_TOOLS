from flask import Blueprint, abort
from flask_login import current_user
from flask_security import roles_required

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


@admin_bp.before_request
def require_staff():
    if not current_user.is_staff:
        abort(403)


@admin_bp.route("/users")
@roles_required("admin")
def users():
    return []
