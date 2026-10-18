// A test is never read by the kit: this route is never one of the application.
use axum::{routing::get, Router};

fn app() -> Router {
    Router::new().route("/never", get(never))
}
