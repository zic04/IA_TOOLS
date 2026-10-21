// Fixture: the actix-web server of the `rust` stack adapter (test/unit/stack-other.test.mjs).
use actix_web::{middleware::Logger, web, App, HttpServer};
use actix_web_httpauth::middleware::HttpAuthentication;

mod admin;
mod api;
mod handlers;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .wrap(Logger::default())
            .service(handlers::health)
            .service(
                web::scope("/api")
                    .wrap(HttpAuthentication::bearer(validator))
                    .service(handlers::get_order)
                    .route("/orders", web::post().to(handlers::create_order))
                    .service(
                        web::resource("/invoices/{id}")
                            .route(web::get().to(handlers::invoice))
                            .route(web::delete().to(handlers::delete_invoice)),
                    ),
            )
            .configure(admin::config)
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
