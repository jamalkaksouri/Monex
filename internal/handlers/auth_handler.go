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
	auditRepo  *repository.AuditRepository
	jwtManager *middleware.JWTManager
	config     *config.Config
}

func NewAuthHandler(userRepo *repository.UserRepository, auditRepo *repository.AuditRepository, jwtManager *middleware.JWTManager, cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		userRepo:   userRepo,
		auditRepo:  auditRepo,
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
		// Log failed login attempt
		_ = h.auditRepo.LogAction(
			0,
			"login_attempt",
			"auth",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			"Invalid request format",
		)
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	// Validate input
	if req.Username == "" || req.Password == "" {
		_ = h.auditRepo.LogAction(
			0,
			"login_attempt",
			"auth",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			"Missing credentials",
		)
		return echo.NewHTTPError(
			http.StatusBadRequest,
			"نام کاربری و کلمه عبور را وارد کنید",
		)
	}

	// Get user from database
	user, err := h.userRepo.GetByUsername(strings.TrimSpace(req.Username))
	if err != nil {
		_ = h.auditRepo.LogAction(
			0,
			"login_attempt",
			"auth",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			"User not found: "+strings.TrimSpace(req.Username),
		)
		return echo.NewHTTPError(
			http.StatusUnauthorized,
			"اطلاعات وارد شده صحیح نمی‌باشد",
		)
	}

	// Check if account is permanently locked
	if user.PermanentlyLocked {
		_ = h.auditRepo.LogAction(
			user.ID,
			"login_attempt",
			"auth",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			"Account permanently locked",
		)
		return echo.NewHTTPError(
			http.StatusForbidden,
			"حساب کاربری شما به صورت دائم مسدود شده است.",
		)
	}

	// Check if account is temporarily locked
	if user.Locked && user.LockedUntil != nil {
		if h.config.Login.AutoUnlockEnabled && time.Now().After(*user.LockedUntil) {
			user.Locked = false
			user.LockedUntil = nil

			if err := h.userRepo.UpdateLockStatus(user); err != nil {
				return echo.NewHTTPError(
					http.StatusInternalServerError,
					"خطا در بروزرسانی وضعیت حساب",
				)
			}
		} else {
			remaining := time.Until(*user.LockedUntil).Minutes()
			_ = h.auditRepo.LogAction(
				user.ID,
				"login_attempt",
				"auth",
				c.RealIP(),
				c.Request().Header.Get("User-Agent"),
				false,
				"Account temporarily locked",
			)
			return echo.NewHTTPError(
				http.StatusForbidden,
				fmt.Sprintf(
					"حساب شما موقتاً مسدود است. %.0f دقیقه دیگر امتحان کنید",
					remaining,
				),
			)
		}
	}

	// Check if user is active
	if !user.Active {
		_ = h.auditRepo.LogAction(
			user.ID,
			"login_attempt",
			"auth",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			"Account inactive",
		)
		return echo.NewHTTPError(
			http.StatusForbidden,
			"حساب کاربری شما غیر فعال است",
		)
	}

	// Verify password
	if !user.CheckPassword(req.Password) {
		user.FailedAttempts++

		if user.FailedAttempts >= h.config.Login.MaxFailedAttempts {
			user.Locked = true
			lockUntil := time.Now().Add(h.config.Login.TempBanDuration)
			user.LockedUntil = &lockUntil
			user.TempBansCount++

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

			_ = h.auditRepo.LogAction(
				user.ID,
				"login_attempt",
				"auth",
				c.RealIP(),
				c.Request().Header.Get("User-Agent"),
				false,
				"Too many failed attempts - account locked",
			)

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

		if err := h.userRepo.UpdateLockStatus(user); err != nil {
			return echo.NewHTTPError(
				http.StatusInternalServerError,
				"خطا در بروزرسانی وضعیت حساب",
			)
		}

		_ = h.auditRepo.LogAction(
			user.ID,
			"login_attempt",
			"auth",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			"Wrong password",
		)

		return echo.NewHTTPError(
			http.StatusUnauthorized,
			"نام کاربری یا رمز عبور اشتباه است",
		)
	}

	// Successful login - reset failed attempts
	if user.FailedAttempts > 0 {
		user.FailedAttempts = 0
		if err := h.userRepo.UpdateLockStatus(user); err != nil {
			// Log error but don't fail the login
		}
	}

	// Generate authentication tokens
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

	// ✅ LOG SUCCESSFUL LOGIN
	_ = h.auditRepo.LogAction(
		user.ID,
		"login_success",
		"auth",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		"User logged in successfully",
	)

	expiresIn := int(h.jwtManager.Config().AccessDuration.Seconds())

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
		_ = h.auditRepo.LogAction(
			0,
			"register_attempt",
			"auth",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			"Invalid request format",
		)
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	// ... validation code ...

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
		_ = h.auditRepo.LogAction(
			0,
			"register_attempt",
			"auth",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			"Failed to create user: "+err.Error(),
		)
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

	// ✅ LOG SUCCESSFUL REGISTRATION
	_ = h.auditRepo.LogAction(
		user.ID,
		"register_success",
		"auth",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		"New user registered",
	)

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

func (h *AuthHandler) Logout(c echo.Context) error {
	token := strings.TrimPrefix(c.Request().Header.Get("Authorization"), "Bearer ")
	if token != "" {
		middleware.Blacklist.Add(token, time.Now().Add(h.config.JWT.AccessDuration))
	}
	return c.JSON(http.StatusOK, map[string]string{
		"message": "از سیستم خارج شدید",
	})
}
