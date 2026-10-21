use actix_web::web;

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(web::scope("/admin").route("/users", web::get().to(list_users)));
}
