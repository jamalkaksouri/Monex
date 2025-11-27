package middleware

import (
	"log"
	"net/http"
	"strings"

	"Monex/internal/repository"

	"github.com/labstack/echo/v4"
)

// SessionActivityMiddleware tracks last activity and validates sessions
func SessionActivityMiddleware(sessionRepo *repository.SessionRepository) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// Extract device_id from header or cookie
			deviceID := c.Request().Header.Get("X-Device-ID")
			if deviceID == "" {
				deviceID = c.QueryParam("device_id")
			}

			// If we have device_id, update last activity
			if deviceID != "" {
				if err := sessionRepo.UpdateActivity(deviceID); err != nil {
					log.Printf("[WARN] Failed to update activity for device %s: %v", deviceID, err)
				}
			}

			// Extract token to check if session still exists
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
					token := parts[1]
					
					// Check if session still exists in database
					sessionExists, err := sessionRepo.ValidateTokenSession(token)
					if err != nil {
						log.Printf("[WARN] Session validation error: %v", err)
					} else if !sessionExists {
						// ✅ Session deleted - return 401 to force logout
						return echo.NewHTTPError(http.StatusUnauthorized, "جلسه شما منقضی شده است. لطفا دوباره وارد شوید")
					}
				}
			}

			return next(c)
		}
	}
}