package middleware

import (
	"log"
	"net/http"
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
			// Get user ID from context (set by JWT middleware)
			userID, ok := c.Get("user_id").(int)
			if !ok {
				// Not authenticated - skip
				return next(c)
			}

			// ✅ STEP 1: Check if user is active
			user, err := userRepo.GetByID(userID)
			if err != nil {
				log.Printf("[SECURITY] User not found - UserID: %d", userID)
				return echo.NewHTTPError(http.StatusUnauthorized, "کاربر یافت نشد")
			}

			// ✅ STEP 2: Check if user is disabled/inactive
			if !user.Active {
				log.Printf("[SECURITY] User is inactive - UserID: %d, Username: %s", userID, user.Username)
				// Blacklist all tokens for this user
				tokenBlacklistRepo.BlacklistUserTokens(
					userID,
					"User account has been disabled by administrator",
				)
				return echo.NewHTTPError(http.StatusForbidden, "حساب کاربری شما غیرفعال است")
			}

			// ✅ STEP 3: Check if user is locked (temporarily or permanently)
			if user.Locked {
				if user.PermanentlyLocked {
					log.Printf("[SECURITY] User permanently locked - UserID: %d", userID)
					tokenBlacklistRepo.BlacklistUserTokens(
						userID,
						"User account has been permanently locked",
					)
					return echo.NewHTTPError(
						http.StatusForbidden,
						"حساب کاربری شما به دلیل نقض امنیتی مسدود شده است",
					)
				}

				// Temporarily locked - check if can auto-unlock
				if user.LockedUntil != nil && time.Now().After(*user.LockedUntil) {
					// Auto-unlock if enabled
					user.Locked = false
					user.LockedUntil = nil
					user.FailedAttempts = 0

					if err := userRepo.UpdateLockStatus(user); err != nil {
						log.Printf("[WARN] Failed to auto-unlock user: %v", err)
					} else {
						log.Printf("[DEBUG] Auto-unlocked user - UserID: %d", userID)
						return next(c)
					}
				} else {
					log.Printf("[SECURITY] User temporarily locked - UserID: %d", userID)
					tokenBlacklistRepo.BlacklistUserTokens(
						userID,
						"Account is temporarily locked",
					)
					return echo.NewHTTPError(
						http.StatusForbidden,
						"حساب کاربری شما موقتاً قفل است",
					)
				}
			}

			// ✅ STEP 4: Verify session is still valid
			deviceID := c.Request().Header.Get("X-Device-ID")
			if deviceID == "" {
				deviceID = c.QueryParam("device_id")
			}

			if deviceID != "" {
				sessionValid, err := sessionRepo.ValidateTokenSession(
					c.Request().Header.Get("Authorization"),
				)
				if err != nil {
					log.Printf("[WARN] Session validation error: %v", err)
				} else if !sessionValid {
					log.Printf("[SECURITY] Session not found or expired - UserID: %d, DeviceID: %s", userID, deviceID)
					return echo.NewHTTPError(
						http.StatusUnauthorized,
						"سشن شما منقضی شده است",
					)
				}
			}

			// ✅ All checks passed - continue
			return next(c)
		}
	}
}
