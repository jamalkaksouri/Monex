// internal/middleware/security.go
package middleware

import "github.com/labstack/echo/v4"

func SecurityHeadersMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// Prevent clickjacking
			c.Response().Header().Set("X-Frame-Options", "DENY")

			// Prevent MIME type sniffing
			c.Response().Header().Set("X-Content-Type-Options", "nosniff")

			// Enable XSS protection
			c.Response().Header().Set("X-XSS-Protection", "1; mode=block")

			// ✅ FIXED: Content Security Policy - allow API connections
			c.Response().Header().Set("Content-Security-Policy",
				"default-src 'self'; "+
					"script-src 'self' 'unsafe-inline' 'unsafe-eval'; "+
					"style-src 'self' 'unsafe-inline'; "+
					"connect-src 'self' http://localhost:3040 https://localhost:3040; "+
					"img-src 'self' data:; "+
					"font-src 'self' data:")

			// Referrer Policy
			c.Response().Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

			// Permissions Policy
			c.Response().Header().Set("Permissions-Policy",
				"geolocation=(), microphone=(), camera=()")

			return next(c)
		}
	}
}
