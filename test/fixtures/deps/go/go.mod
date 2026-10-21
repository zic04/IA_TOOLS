module github.com/acme/orders

go 1.22

toolchain go1.22.0

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/jackc/pgx/v5 v5.5.1
	github.com/acme/shared v0.3.0
	"github.com/quoted/module" v1.0.0
	golang.org/x/crypto v0.17.0 // indirect
	github.com/bytedance/sonic v1.10.2 // indirect; used by gin
)

require github.com/google/uuid v1.5.0

require github.com/stretchr/testify v1.8.4 // indirect

replace github.com/acme/shared => ../shared

replace (
	github.com/gin-gonic/gin v1.9.1 => github.com/acme/gin v1.9.1-fork
	github.com/google/uuid => ./third_party/uuid
)

exclude (
	golang.org/x/net v0.0.1
)

retract v0.1.0 // published by mistake
