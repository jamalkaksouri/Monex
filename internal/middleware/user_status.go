package middleware

import (
	"log"
	"net/http"
	"strings"
	"time"

	"Monex/internal/repository"

	"github.com/labstack/echo/v4"
)

// UserStatusMiddleware validates user status on every request
// IMPORTANT: This must be called AFTER JWT middleware
func UserStatusMiddleware(
	userRepo *repository.UserRepository,
	tokenBlacklistRepo *repository.TokenBlacklistRepository,
	sessionRepo *repository.SessionRepository,
) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			userID, ok := c.Get("user_id").(int)
			if !ok {
				return next(c)  // Not authenticated - skip
			}

			// ✅ Get user
			user, err := userRepo.GetByID(userID)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "User not found")
			}

			// ✅ Check if active
			if !user.Active {
				tokenBlacklistRepo.BlacklistUserTokens(userID, "Account disabled")
				return echo.NewHTTPError(http.StatusForbidden, "Account is inactive")
			}

			// ✅ Check if locked
			if user.Locked {
				if user.PermanentlyLocked {
					tokenBlacklistRepo.BlacklistUserTokens(userID, "Account locked")
					return echo.NewHTTPError(http.StatusForbidden, "Account is locked")
				}
				
				// Check auto-unlock
				if user.LockedUntil != nil && time.Now().After(*user.LockedUntil) {
					user.Locked = false
					user.LockedUntil = nil
					user.FailedAttempts = 0
					userRepo.UpdateLockStatus(user)
				} else {
					return echo.NewHTTPError(http.StatusForbidden, "Account temporarily locked")
				}
			}

			// ✅ CRITICAL: Verify session exists
			// Get token from header
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
					token := parts[1]
					
					// ✅ Check if session exists in database
					sessionExists, err := sessionRepo.ValidateTokenSession(token)
					if err != nil {
						// ❌ DB error - don't fail auth
						log.Printf("[WARN] Session validation error: %v", err)
					} else if !sessionExists {
						// ✅ Session definitely deleted
						log.Printf("[SECURITY] Session not found for token")
						return echo.NewHTTPError(http.StatusUnauthorized, "Session expired")
					}
				}
			}

			return next(c)
		}
	}
};
