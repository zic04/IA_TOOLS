package api

import "github.com/gorilla/mux"

func Gorilla() *mux.Router {
	r := mux.NewRouter()
	s := r.PathPrefix("/v2").Subrouter()
	s.Use(tokenMiddleware)
	s.HandleFunc("/customers", listCustomers).Methods("GET", "POST")
	return r
}
