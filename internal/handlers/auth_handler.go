package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"Monex/config"
	"Monex/internal/middleware"
	"Monex/internal/models"
	"Monex/internal/repository"

	"github.com/labstack/echo/v4"
)

type AuthHandler struct {
	userRepo   *repository.UserRepository
	jwtManager *middleware.JWTManager
	config     *config.Config
}

func NewAuthHandler(userRepo *repository.UserRepository, jwtManager *middleware.JWTManager, cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		userRepo:   userRepo,
		jwtManager: jwtManager,
		config:     cfg,
	}
}

type LoginRequest struct {
	Username string `json:"username" validate:"required"`
	Password string `json:"password" validate:"required"`
}

type RegisterRequest struct {
	Username string `json:"username" validate:"required,min=3,max=50"`
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
}

type LoginResponse struct {
	User         *models.UserResponse `json:"user"`
	AccessToken  string               `json:"access_token"`
	RefreshToken string               `json:"refresh_token"`
	ExpiresIn    int                  `json:"expires_in"`
}

func (h *AuthHandler) Login(c echo.Context) error {
	req := new(LoginRequest)

	if err := c.Bind(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	// Validate input
	if req.Username == "" || req.Password == "" {
		return echo.NewHTTPError(
			http.StatusBadRequest,
			"نام کاربری و کلمه عبور را وارد کنید",
		)
	}

	// Get user from database
	user, err := h.userRepo.GetByUsername(strings.TrimSpace(req.Username))
	if err != nil {
		return echo.NewHTTPError(
			http.StatusUnauthorized,
			"اطلاعات وارد شده صحیح نمی‌باشد",
		)
	}

	// ─────────────────────────────────────────────────────────────────
	// Check if account is permanently locked
	// ─────────────────────────────────────────────────────────────────
	if user.PermanentlyLocked {
		return echo.NewHTTPError(
			http.StatusForbidden,
			"حساب کاربری شما به صورت دائم مسدود شده است.",
		)
	}

	// ─────────────────────────────────────────────────────────────────
	// Check if account is temporarily locked
	// ─────────────────────────────────────────────────────────────────
	if user.Locked && user.LockedUntil != nil {
		// Auto-unlock if time has passed and auto-unlock is enabled
		if h.config.Login.AutoUnlockEnabled && time.Now().After(*user.LockedUntil) {
			user.Locked = false
			user.LockedUntil = nil
			// ✅ FIX #1: Don't reset failed_attempts - keep it for display

			if err := h.userRepo.UpdateLockStatus(user); err != nil {
				return echo.NewHTTPError(
					http.StatusInternalServerError,
					"خطا در بروزرسانی وضعیت حساب",
				)
			}
		} else {
			// Still locked - calculate remaining time
			remaining := time.Until(*user.LockedUntil).Minutes()
			return echo.NewHTTPError(
				http.StatusForbidden,
				fmt.Sprintf(
					"حساب شما موقتاً مسدود است. %.0f دقیقه دیگر امتحان کنید",
					remaining,
				),
			)
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// Check if user is active
	// ─────────────────────────────────────────────────────────────────
	if !user.Active {
		return echo.NewHTTPError(
			http.StatusForbidden,
			"حساب کاربری شما غیر فعال است",
		)
	}

	// ─────────────────────────────────────────────────────────────────
	// Verify password
	// ─────────────────────────────────────────────────────────────────
	if !user.CheckPassword(req.Password) {
		// Wrong password - increment failed attempts
		user.FailedAttempts++

		// Check if max failed attempts reached
		if user.FailedAttempts >= h.config.Login.MaxFailedAttempts {
			// Lock account temporarily
			user.Locked = true
			lockUntil := time.Now().Add(h.config.Login.TempBanDuration)
			user.LockedUntil = &lockUntil

			// ✅ FIX #2: Don't reset FailedAttempts - keep value for UI display
			user.TempBansCount++

			// ✅ FIX #3: Don't permanently lock ADMIN users
			if user.TempBansCount >= h.config.Login.MaxTempBans &&
				user.Role != models.RoleAdmin {
				user.PermanentlyLocked = true
			}

			if err := h.userRepo.UpdateLockStatus(user); err != nil {
				return echo.NewHTTPError(
					http.StatusInternalServerError,
					"خطا در بروزرسانی وضعیت حساب",
				)
			}

			// Return appropriate error based on lock type
			if user.PermanentlyLocked {
				return echo.NewHTTPError(
					http.StatusForbidden,
					"حساب کاربری شما به دلیل تلاش‌های مکرر ناموفق، به صورت دائم مسدود شد",
				)
			}

			return echo.NewHTTPError(
				http.StatusForbidden,
				fmt.Sprintf(
					"به دلیل تلاش‌های ناموفق زیاد، حساب شما برای %d دقیقه مسدود شد",
					int(h.config.Login.TempBanDuration.Minutes()),
				),
			)
		}

		// Update lock status with incremented failed attempts
		if err := h.userRepo.UpdateLockStatus(user); err != nil {
			return echo.NewHTTPError(
				http.StatusInternalServerError,
				"خطا در بروزرسانی وضعیت حساب",
			)
		}

		return echo.NewHTTPError(
			http.StatusUnauthorized,
			"نام کاربری یا رمز عبور اشتباه است",
		)
	}

	// ─────────────────────────────────────────────────────────────────
	// ✅ Successful login - reset failed attempts
	// ─────────────────────────────────────────────────────────────────
	if user.FailedAttempts > 0 {
		user.FailedAttempts = 0
		if err := h.userRepo.UpdateLockStatus(user); err != nil {
			// Log error but don't fail the login
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// Generate authentication tokens
	// ─────────────────────────────────────────────────────────────────
	accessToken, err := h.jwtManager.GenerateAccessToken(user)
	if err != nil {
		return echo.NewHTTPError(
			http.StatusInternalServerError,
			"توکن دسترسی ایجاد نشد",
		)
	}

	refreshToken, err := h.jwtManager.GenerateRefreshToken(user)
	if err != nil {
		return echo.NewHTTPError(
			http.StatusInternalServerError,
			"خطا در بروز رسانی توکن",
		)
	}

	expiresIn := int(h.jwtManager.Config().AccessDuration.Seconds())

	// Return login response
	return c.JSON(http.StatusOK, LoginResponse{
		User:         user.ToResponse(),
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    expiresIn,
	})
}

func (h *UserHandler) UnlockUser(c echo.Context) error {
	// Get user ID or username from URL parameter
	idOrUsername := c.Param("id")

	var user *models.User
	var err error

	// Try to parse as integer ID first
	if id, parseErr := strconv.Atoi(idOrUsername); parseErr == nil {
		user, err = h.userRepo.GetByID(id)
	} else {
		// Fall back to username lookup
		user, err = h.userRepo.GetByUsername(idOrUsername)
	}

	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
	}

	// ─────────────────────────────────────────────────────────────────
	// ✅ FIX: Reset all lock-related fields
	// ─────────────────────────────────────────────────────────────────
	user.Locked = false
	user.LockedUntil = nil

	// ✅ FIX #1: Only reset failed_attempts on explicit unlock
	user.FailedAttempts = 0

	user.PermanentlyLocked = false
	user.TempBansCount = 0

	// ─────────────────────────────────────────────────────────────────
	// Update user in database
	// ─────────────────────────────────────────────────────────────────
	if err := h.userRepo.UpdateLockStatus(user); err != nil {
		return echo.NewHTTPError(
			http.StatusInternalServerError,
			"خطا در باز کردن حساب کاربری",
		)
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "حساب کاربری با موفقیت باز شد",
	})
}

func (h *AuthHandler) Register(c echo.Context) error {
	req := new(RegisterRequest)
	if err := c.Bind(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	if req.Username == "" || req.Email == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "نام کاربری، ایمیل و کلمه عبور را وارد کنید")
	}

	if len(req.Username) < 3 || len(req.Username) > 50 {
		return echo.NewHTTPError(http.StatusBadRequest, "نام کاربری باید بین 3 تا 50 کاراکتر باشد")
	}

	if len(req.Password) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "کلمه عبور بایستی حداقل 8 کاراکتر باشد")
	}

	exists, err := h.userRepo.ExistsByUsername(strings.TrimSpace(req.Username))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در بررسی نام کاربری")
	}
	if exists {
		return echo.NewHTTPError(http.StatusConflict, "نام کاربری قبلا ثبت شده است")
	}

	exists, err = h.userRepo.ExistsByEmail(strings.TrimSpace(req.Email))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در بررسی ایمیل")
	}
	if exists {
		return echo.NewHTTPError(http.StatusConflict, "ایمیل وارد شده قبلا ثبت شده است")
	}

	user := &models.User{
		Username: strings.TrimSpace(req.Username),
		Email:    strings.TrimSpace(req.Email),
		Role:     models.RoleUser,
		Active:   true,
	}

	if err := user.SetPassword(req.Password, h.config.Security.BcryptCost); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در هش کردن کلمه عبور")
	}

	if err := h.userRepo.Create(user); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در ایجاد کاربر جدید")
	}

	accessToken, err := h.jwtManager.GenerateAccessToken(user)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "توکن دسترسی ایجاد نشد")
	}

	refreshToken, err := h.jwtManager.GenerateRefreshToken(user)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در بروز رسانی توکن")
	}

	expiresIn := int(h.jwtManager.Config().AccessDuration.Seconds())

	return c.JSON(http.StatusCreated, LoginResponse{
		User:         user.ToResponse(),
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    expiresIn,
	})
}

// Add to internal/handlers/auth_handler.go

type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

func (h *AuthHandler) RefreshToken(c echo.Context) error {
	req := new(RefreshTokenRequest)
	if err := c.Bind(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	// ✅ FIX: Validate refresh token signature FIRST
	claims, err := h.jwtManager.ValidateToken(req.RefreshToken)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "توکن بروز‌رسانی منقضی شده است")
	}

	// ✅ FIX: Get user and check if still valid
	user, err := h.userRepo.GetByID(claims.UserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
	}

	// ✅ FIX: Check user is still active
	if !user.Active {
		return echo.NewHTTPError(http.StatusForbidden, "حساب کاربری غیرفعال است")
	}

	// ✅ FIX: Check user not locked
	if user.Locked {
		return echo.NewHTTPError(http.StatusForbidden, "حساب کاربری مسدود است")
	}

	// Generate new tokens with token rotation
	newAccessToken, err := h.jwtManager.GenerateAccessToken(user)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "توکن دسترسی ایجاد نشد")
	}

	newRefreshToken, err := h.jwtManager.GenerateRefreshToken(user)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در بروز رسانی توکن")
	}

	expiresIn := int(h.jwtManager.Config().AccessDuration.Seconds())

	return c.JSON(http.StatusOK, LoginResponse{
		User:         user.ToResponse(),
		AccessToken:  newAccessToken,
		RefreshToken: newRefreshToken,
		ExpiresIn:    expiresIn,
	})
}
