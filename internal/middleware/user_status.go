// internal/middleware/user_status.go
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
// ✅ NEW POLICY: Does NOT terminate existing sessions when account is locked
// Only validates Active status and permanent locks
func UserStatusMiddleware(
	userRepo *repository.UserRepository,
	tokenBlacklistRepo *repository.TokenBlacklistRepository,
	sessionRepo *repository.SessionRepository,
) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			userID, ok := c.Get("user_id").(int)
			if !ok {
				return next(c) // Not authenticated - skip
			}

			// Get user
			user, err := userRepo.GetByID(userID)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "User not found")
			}

			// ✅ CRITICAL: Check if INACTIVE (admin disabled account)
			if !user.Active {
				// Account was MANUALLY disabled by admin
				// This is a serious action - terminate all sessions
				log.Printf("[SECURITY] Inactive account detected - UserID: %d", userID)
				tokenBlacklistRepo.BlacklistUserTokens(userID, "Account disabled by administrator")
				return echo.NewHTTPError(
					http.StatusForbidden,
					"حساب کاربری شما غیرفعال شده است. با پشتیبانی تماس بگیرید",
				)
			}

			// ✅ CRITICAL: Check if PERMANENTLY locked
			if user.PermanentlyLocked {
				// Permanent lock - serious security issue
				log.Printf("[SECURITY] Permanently locked account - UserID: %d", userID)
				tokenBlacklistRepo.BlacklistUserTokens(userID, "Account permanently locked")
				return echo.NewHTTPError(
					http.StatusForbidden,
					"حساب کاربری شما به دلیل نقض امنیتی مسدود شده است",
				)
			}

			// ✅ NEW POLICY: If temporarily locked, DO NOT terminate session
			// Only NEW logins are blocked - existing sessions continue
			if user.Locked {
				if user.LockedUntil != nil && time.Now().After(*user.LockedUntil) {
					// Auto-unlock if expired
					user.Locked = false
					user.LockedUntil = nil
					user.FailedAttempts = 0
					userRepo.UpdateLockStatus(user)
					log.Printf("[INFO] Auto-unlocked account - UserID: %d", userID)
				} else {
					// ✅ IMPORTANT: Session continues even if locked
					// User will see warning in UI but won't be logged out
					log.Printf("[INFO] Locked account with active session - UserID: %d (session preserved)", userID)
					// DO NOT return error - let request continue
				}
			}

			// ✅ Verify session exists in database
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
					token := parts[1]

					sessionExists, err := sessionRepo.ValidateTokenSession(token)
					if err != nil {
						log.Printf("[WARN] Session validation error: %v", err)
					} else if !sessionExists {
						log.Printf("[SECURITY] Session not found for token - UserID: %d", userID)
						return echo.NewHTTPError(
							http.StatusUnauthorized,
							"سشن شما منقضی شده است. لطفا دوباره وارد شوید",
						)
					}
				}
			}

			return next(c)
		}
	}
}
