// Fixture: the net/http server of the `go` stack adapter (test/unit/stack-other.test.mjs).
package main

import (
	"net/http"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health)
	mux.HandleFunc("POST /orders/{id}/cancel", requireAuth(cancelOrder))
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("public"))))
	// mux.HandleFunc("/legacy", legacy)
	http.ListenAndServe(":8080", mux)
}

func listOrders(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	w.Write([]byte(status))
}
