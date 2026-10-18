package api

import (
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func Echo() *echo.Echo {
	e := echo.New()
	e.Use(middleware.Logger())
	e.GET("/products", listProducts)
	e.PUT("/products/:id", updateProduct, RequireAdmin)
	g := e.Group("/backoffice", middleware.BasicAuth(validate))
	g.GET("/stats", stats)
	return e
}
