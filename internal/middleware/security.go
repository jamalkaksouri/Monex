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

			// HSTS (HTTPS only - adjust max-age as needed)
			c.Response().Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

			// Content Security Policy
			c.Response().Header().Set("Content-Security-Policy",
				"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'")

			// Referrer Policy
			c.Response().Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

			// Permissions Policy
			c.Response().Header().Set("Permissions-Policy",
				"geolocation=(), microphone=(), camera=()")

			return next(c)
		}
	}
}
