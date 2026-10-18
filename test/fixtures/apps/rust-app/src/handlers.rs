use actix_web::{get, route, web, HttpResponse, Responder};

#[get("/health")]
async fn health() -> impl Responder {
    HttpResponse::Ok().body("ok")
}

/// An example in a documentation comment, never a route:
/// #[get("/doc-example")]
#[get("/orders/{id}")]
async fn get_order(path: web::Path<u32>) -> impl Responder {
    HttpResponse::Ok().body(path.into_inner().to_string())
}

#[route("/reports", method = "GET", method = "HEAD", wrap = "AdminOnly")]
async fn reports() -> impl Responder {
    HttpResponse::Ok().finish()
}

pub async fn create_order() -> impl Responder {
    HttpResponse::Created().finish()
}

pub async fn invoice() -> impl Responder {
    HttpResponse::Ok().finish()
}

pub async fn delete_invoice() -> impl Responder {
    HttpResponse::NoContent().finish()
}
