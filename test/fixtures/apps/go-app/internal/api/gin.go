package api

import (
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func Router(db *gorm.DB) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.POST("/login", login)
	r.Use(AuthRequired())
	r.GET("/orders", func(c *gin.Context) {
		q := c.Query("q")
		page := c.DefaultQuery("page", "1")
		var orders []Order
		db.Where("customer_name ILIKE ?", "%"+q+"%").Order("created_at desc").Limit(20).Offset(0).Find(&orders)
		c.JSON(200, gin.H{"orders": orders, "page": page})
	})
	admin := r.Group("/admin", RequireRole("admin"))
	{
		admin.GET("/users", listUsers)
		admin.DELETE("/users/:id", AuditLog(), deleteUser)
	}
	return r
}
