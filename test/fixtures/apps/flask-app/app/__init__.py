# Fixture: the Flask application of the `flask` stack adapter (test/unit/stack-other.test.mjs).
from flask import Flask

from . import api
from .admin.routes import admin_bp
from .orders import bp as orders_bp


def create_app():
    app = Flask(__name__)
    # The prefix given here replaces the blueprint's own "/orders", as Flask does.
    app.register_blueprint(orders_bp, url_prefix="/shop/orders")
    app.register_blueprint(admin_bp)
    app.register_blueprint(api.bp, url_prefix="/api")

    @app.route("/health")
    def health():
        return {"ok": True}

    return app
