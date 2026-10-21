package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func Chi() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Get("/", home)
	r.Route("/invoices", func(r chi.Router) {
		r.Use(Authenticated)
		r.Get("/", listInvoices)
		r.With(RequireRole("accountant")).Post("/", createInvoice)
		r.Route("/{invoiceID}", func(r chi.Router) {
			r.Get("/", getInvoice)
		})
	})
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(tokenAuth))
		r.Delete("/sessions", logout)
	})
	r.Mount("/admin", adminRouter())
	return r
}

func adminRouter() chi.Router {
	r := chi.NewRouter()
	r.Use(AdminOnly)
	r.Get("/", adminIndex)
	return r
}
