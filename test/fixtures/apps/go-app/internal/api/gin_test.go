package api

import "testing"

// A test is never read by the kit: this route is never one of the application.
func TestRoutes(t *testing.T) {
	r := gin.New()
	r.GET("/never", nil)
}
