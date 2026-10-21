use axum::{middleware, routing::{get, post}, Router};
use tower_http::trace::TraceLayer;

pub fn app() -> Router {
    Router::new()
        .route("/", get(root))
        .nest("/v1", v1_routes())
        .merge(public_routes())
        .layer(TraceLayer::new_for_http())
}

fn v1_routes() -> Router {
    Router::new()
        .route("/orders", get(list_orders).post(create_order))
        .route("/orders/:id", get(get_order).delete(delete_order))
        // Only the routes added before it are guarded: /login is not.
        .route_layer(middleware::from_fn(require_auth))
        .route("/login", post(login))
        .nest(
            "/admin",
            Router::new()
                .route("/stats", get(stats))
                .layer(middleware::from_fn_with_state(state.clone(), require_admin)),
        )
}

fn public_routes() -> Router {
    Router::new().route("/status", get(status))
}

// Router::new().route("/commented", get(never))
