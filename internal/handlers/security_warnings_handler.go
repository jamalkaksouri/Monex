// internal/handlers/security_warnings_handler.go
package handlers

import (
	"net/http"
	"time"

	"Monex/internal/middleware"
	"Monex/internal/repository"

	"github.com/labstack/echo/v4"
)

// SecurityWarning represents a security event notification
type SecurityWarning struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	Type      string    `json:"type"` // "failed_login", "account_locked", "suspicious_activity"
	Message   string    `json:"message"`
	Severity  string    `json:"severity"` // "info", "warning", "critical"
	Read      bool      `json:"read"`
	CreatedAt time.Time `json:"created_at"`
}

type SecurityWarningsHandler struct {
	auditRepo *repository.AuditRepository
	userRepo  *repository.UserRepository
}

func NewSecurityWarningsHandler(
	auditRepo *repository.AuditRepository,
	userRepo *repository.UserRepository,
) *SecurityWarningsHandler {
	return &SecurityWarningsHandler{
		auditRepo: auditRepo,
		userRepo:  userRepo,
	}
}

// GetSecurityWarnings retrieves recent security events for the current user
func (h *SecurityWarningsHandler) GetSecurityWarnings(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	// Get user to check lock status
	user, err := h.userRepo.GetByID(userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
	}

	warnings := []SecurityWarning{}

	// ✅ Check if account is locked (warning for active sessions)
	if user.Locked && user.LockedUntil != nil && time.Now().Before(*user.LockedUntil) {
		remaining := time.Until(*user.LockedUntil)
		warnings = append(warnings, SecurityWarning{
			ID:        1,
			UserID:    userID,
			Type:      "account_locked",
			Message:   "حساب شما به دلیل تلاش‌های ناموفق ورود موقتاً مسدود شده است. سشن فعلی شما همچنان فعال است",
			Severity:  "warning",
			Read:      false,
			CreatedAt: time.Now(),
		})

		// Add time remaining info
		warnings = append(warnings, SecurityWarning{
			ID:        2,
			UserID:    userID,
			Type:      "lock_duration",
			Message:   "مدت زمان باقیمانده تا باز شدن حساب: " + formatDuration(remaining),
			Severity:  "info",
			Read:      false,
			CreatedAt: time.Now(),
		})
	}

	// ✅ Check recent failed login attempts
	if user.FailedAttempts > 0 {
		warnings = append(warnings, SecurityWarning{
			ID:        3,
			UserID:    userID,
			Type:      "failed_login_attempts",
			Message:   "تلاش‌های ناموفق ورود به حساب شما: " + formatInt(user.FailedAttempts) + " از 5",
			Severity:  determineSeverity(user.FailedAttempts),
			Read:      false,
			CreatedAt: time.Now(),
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"warnings": warnings,
		"count":    len(warnings),
	})
}

// GetAccountStatus provides detailed account security status
func (h *SecurityWarningsHandler) GetAccountStatus(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	user, err := h.userRepo.GetByID(userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
	}

	status := map[string]interface{}{
		"active":             user.Active,
		"locked":             user.Locked,
		"permanently_locked": user.PermanentlyLocked,
		"failed_attempts":    user.FailedAttempts,
		"temp_bans_count":    user.TempBansCount,
	}

	if user.LockedUntil != nil {
		status["locked_until"] = user.LockedUntil
		status["lock_remaining_seconds"] = int(time.Until(*user.LockedUntil).Seconds())
	}

	return c.JSON(http.StatusOK, status)
}

// Helper functions
func formatDuration(d time.Duration) string {
	minutes := int(d.Minutes())
	seconds := int(d.Seconds()) % 60

	if minutes > 0 {
		return formatInt(minutes) + " دقیقه و " + formatInt(seconds) + " ثانیه"
	}
	return formatInt(seconds) + " ثانیه"
}

func formatInt(n int) string {
	// Persian number conversion if needed
	return string(rune(n + '0'))
}

func determineSeverity(failedAttempts int) string {
	if failedAttempts >= 4 {
		return "critical"
	} else if failedAttempts >= 2 {
		return "warning"
	}
	return "info"
}
