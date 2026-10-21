# A test is never read by the kit: this route is never one of the application.
from app.orders import bp


@bp.route("/never")
def never():
    return {}
