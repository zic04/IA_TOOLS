from flask import Blueprint
from flask_jwt_extended import jwt_required

bp = Blueprint("api", __name__)
reports = Blueprint("reports", __name__, url_prefix="/reports")
bp.register_blueprint(reports)


@bp.post("/tokens")
def create_token():
    return {}


@reports.get("/monthly")
@jwt_required()
def monthly():
    return []
