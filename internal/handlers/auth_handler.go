// internal/handlers/auth_handler.go
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"Monex/config"
	"Monex/internal/middleware"
	"Monex/internal/models"
	"Monex/internal/repository"

	"github.com/labstack/echo/v4"
	"golang.org/x/time/rate"
)

// ✅ NEW: Login rate limiter per IP address
type LoginRateLimiter struct {
	mu       sync.RWMutex
	limiters map[string]*rate.Limiter
}

func NewLoginRateLimiter() *LoginRateLimiter {
	lrl := &LoginRateLimiter{
		limiters: make(map[string]*rate.Limiter),
	}

	// Cleanup old entries every 10 minutes
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			lrl.cleanup()
		}
	}()

	return lrl
}

func (lrl *LoginRateLimiter) getLimiter(ip string) *rate.Limiter {
	lrl.mu.Lock()
	defer lrl.mu.Unlock()

	limiter, exists := lrl.limiters[ip]
	if !exists {
		// Allow 5 login attempts per minute per IP
		limiter = rate.NewLimiter(rate.Every(12*time.Second), 5)
		lrl.limiters[ip] = limiter
	}

	return limiter
}

func (lrl *LoginRateLimiter) cleanup() {
	lrl.mu.Lock()
	defer lrl.mu.Unlock()

	// Remove limiters that haven't been used recently
	// (Implementation simplified - in production, track last access time)
	if len(lrl.limiters) > 1000 {
		lrl.limiters = make(map[string]*rate.Limiter)
	}
}

type AuthHandler struct {
	userRepo           *repository.UserRepository
	auditRepo          *repository.AuditRepository
	sessionRepo        *repository.SessionRepository
	tokenBlacklistRepo *repository.TokenBlacklistRepository
	jwtManager         *middleware.JWTManager
	config             *config.Config
	loginRateLimiter   *LoginRateLimiter // ✅ NEW
}

func NewAuthHandler(
	userRepo *repository.UserRepository,
	auditRepo *repository.AuditRepository,
	sessionRepo *repository.SessionRepository,
	tokenBlacklistRepo *repository.TokenBlacklistRepository,
	jwtManager *middleware.JWTManager,
	cfg *config.Config,
) *AuthHandler {
	return &AuthHandler{
		userRepo:           userRepo,
		auditRepo:          auditRepo,
		sessionRepo:        sessionRepo,
		tokenBlacklistRepo: tokenBlacklistRepo,
		jwtManager:         jwtManager,
		config:             cfg,
		loginRateLimiter:   NewLoginRateLimiter(), // ✅ NEW
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
	SessionID    int                  `json:"session_id"`
	DeviceID     string               `json:"device_id"`
}

func (h *AuthHandler) Login(c echo.Context) error {
	// ✅ NEW: Rate limiting per IP address
	clientIP := c.RealIP()
	limiter := h.loginRateLimiter.getLimiter(clientIP)

	if !limiter.Allow() {
		_ = h.auditRepo.LogAction(
			0,
			"login_rate_limited",
			"auth",
			clientIP,
			c.Request().Header.Get("User-Agent"),
			false,
			fmt.Sprintf("Too many login attempts from IP: %s", clientIP),
		)
		return echo.NewHTTPError(
			http.StatusTooManyRequests,
			"تعداد تلاش‌های ورود بیش از حد است. لطفاً چند دقیقه صبر کنید",
		)
	}

	req := new(LoginRequest)
	if err := c.Bind(req); err != nil {
		_ = h.auditRepo.LogAction(
			0,
			"login_attempt",
			"auth",
			clientIP,
			c.Request().Header.Get("User-Agent"),
			false,
			"Invalid request format",
		)
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	if req.Username == "" || req.Password == "" {
		_ = h.auditRepo.LogAction(
			0,
			"login_attempt",
			"auth",
			clientIP,
			c.Request().Header.Get("User-Agent"),
			false,
			"Missing credentials",
		)
		return echo.NewHTTPError(
			http.StatusBadRequest,
			"نام کاربری و کلمه عبور را وارد کنید",
		)
	}

	user, err := h.userRepo.GetByUsername(strings.TrimSpace(req.Username))
	if err != nil {
		_ = h.auditRepo.LogAction(
			0,
			"login_attempt",
			"auth",
			clientIP,
			c.Request().Header.Get("User-Agent"),
			false,
			"User not found: "+strings.TrimSpace(req.Username),
		)
		return echo.NewHTTPError(
			http.StatusUnauthorized,
			"اطلاعات وارد شده صحیح نمی‌باشد",
		)
	}

	// ✅ CRITICAL: Check if account is permanently locked
	if user.PermanentlyLocked {
		_ = h.auditRepo.LogAction(
			user.ID,
			"login_attempt",
			"auth",
			clientIP,
			c.Request().Header.Get("User-Agent"),
			false,
			"Account permanently locked",
		)
		return echo.NewHTTPError(
			http.StatusForbidden,
			"حساب کاربری شما به صورت دائم مسدود شده است.",
		)
	}

	// ✅ NEW POLICY: Check if account is temporarily locked
	// BUT ONLY BLOCK NEW LOGINS - Don't terminate existing sessions
	if user.Locked && user.LockedUntil != nil {
		if h.config.Login.AutoUnlockEnabled && time.Now().After(*user.LockedUntil) {
			// Auto-unlock if time has passed
			user.Locked = false
			user.LockedUntil = nil
			user.FailedAttempts = 0

			if err := h.userRepo.UpdateLockStatus(user); err != nil {
				return echo.NewHTTPError(
					http.StatusInternalServerError,
					"خطا در بروزرسانی وضعیت حساب",
				)
			}

			_ = h.auditRepo.LogAction(
				user.ID,
				"auto_unlock",
				"auth",
				clientIP,
				c.Request().Header.Get("User-Agent"),
				true,
				"Account auto-unlocked after temporary ban expired",
			)
		} else {
			// ✅ STILL LOCKED - Block NEW login attempt
			remaining := time.Until(*user.LockedUntil).Minutes()
			_ = h.auditRepo.LogAction(
				user.ID,
				"login_attempt_blocked",
				"auth",
				clientIP,
				c.Request().Header.Get("User-Agent"),
				false,
				fmt.Sprintf("Login blocked - account locked for %.0f more minutes", remaining),
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

	// ✅ Check if user is active
	if !user.Active {
		_ = h.auditRepo.LogAction(
			user.ID,
			"login_attempt",
			"auth",
			clientIP,
			c.Request().Header.Get("User-Agent"),
			false,
			"Account inactive",
		)
		return echo.NewHTTPError(
			http.StatusForbidden,
			"حساب کاربری شما غیر فعال است",
		)
	}

	// ✅ Verify password
	if !user.CheckPassword(req.Password) {
		user.FailedAttempts++

		// ✅ NEW POLICY: Send security warning to active sessions
		if user.FailedAttempts >= h.config.Login.MaxFailedAttempts-2 {
			// Warning threshold: 2 attempts before lockout
			go h.sendSecurityWarningToActiveSessions(
				user.ID,
				fmt.Sprintf("تلاش ناموفق ورود شماره %d از %d",
					user.FailedAttempts,
					h.config.Login.MaxFailedAttempts),
			)
		}

		if user.FailedAttempts >= h.config.Login.MaxFailedAttempts {
			// Lock account for NEW logins
			user.Locked = true
			lockUntil := time.Now().Add(h.config.Login.TempBanDuration)
			user.LockedUntil = &lockUntil
			user.TempBansCount++

			// ✅ Check for permanent lock (non-admin only)
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
				"account_locked",
				"auth",
				clientIP,
				c.Request().Header.Get("User-Agent"),
				false,
				fmt.Sprintf("Too many failed attempts - account locked (temp ban #%d)", user.TempBansCount),
			)

			// ✅ NEW: Send warning to active sessions about lockout
			go h.sendSecurityWarningToActiveSessions(
				user.ID,
				"حساب شما به دلیل تلاش‌های ناموفق متعدد موقتاً مسدود شد",
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

		// Update failed attempts count
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
			clientIP,
			c.Request().Header.Get("User-Agent"),
			false,
			fmt.Sprintf("Wrong password - attempt %d/%d", user.FailedAttempts, h.config.Login.MaxFailedAttempts),
		)

		return echo.NewHTTPError(
			http.StatusUnauthorized,
			"نام کاربری یا رمز عبور اشتباه است",
		)
	}

	// ✅ PASSWORD CORRECT - SUCCESSFUL LOGIN

	// Reset failed attempts
	if user.FailedAttempts > 0 {
		user.FailedAttempts = 0
		if err := h.userRepo.UpdateLockStatus(user); err != nil {
			log.Printf("[WARN] Failed to reset failed_attempts: %v", err)
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

	deviceID := c.QueryParam("device_id")
	if deviceID == "" {
		var genErr error
		deviceID, genErr = h.sessionRepo.GenerateDeviceID()
		if genErr != nil {
			return echo.NewHTTPError(
				http.StatusInternalServerError,
				"خطا در ایجاد شناسه دستگاه",
			)
		}
	}

	deviceInfo := ParseUserAgent(c.Request().Header.Get("User-Agent"))

	session, err := h.sessionRepo.CreateOrUpdateSession(
		user.ID,
		deviceID,
		deviceInfo.DeviceName,
		deviceInfo.Browser,
		deviceInfo.OS,
		clientIP,
		accessToken,
		refreshToken,
		time.Now().Add(h.jwtManager.Config().RefreshDuration),
	)
	if err != nil {
		log.Printf("[ERROR] Session creation failed: %v", err)
		return echo.NewHTTPError(
			http.StatusInternalServerError,
			"خطا در ایجاد سشن",
		)
	}

	InvalidationHub.RegisterSession(session.ID)

	_ = h.auditRepo.LogAction(
		user.ID,
		"login_success",
		"auth",
		clientIP,
		c.Request().Header.Get("User-Agent"),
		true,
		fmt.Sprintf("User logged in successfully from %s (%s)", deviceInfo.DeviceName, clientIP),
	)

	expiresIn := int(h.jwtManager.Config().AccessDuration.Seconds())

	response := LoginResponse{
		User:         user.ToResponse(),
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    expiresIn,
		SessionID:    session.ID,
		DeviceID:     session.DeviceID,
	}

	return c.JSON(http.StatusOK, response)
}

// ✅ NEW: Send security warning to all active sessions
func (h *AuthHandler) sendSecurityWarningToActiveSessions(userID int, message string) {
	sessions, err := h.sessionRepo.GetUserSessions(userID)
	if err != nil {
		log.Printf("[WARN] Failed to get user sessions for warning: %v", err)
		return
	}

	for _, session := range sessions {
		// Register warning event (can be polled by frontend)
		log.Printf("[SECURITY] Warning sent to session %d: %s", session.ID, message)

		// In a production system, you might store these warnings in a separate table
		// or use WebSockets to push notifications
		_ = h.auditRepo.LogAction(
			userID,
			"security_warning_sent",
			"session",
			"",
			"",
			true,
			fmt.Sprintf("Session %d warned: %s", session.ID, message),
		)
	}
}

// Register and other methods remain unchanged...
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

type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

func (h *AuthHandler) RefreshToken(c echo.Context) error {
	req := new(RefreshTokenRequest)
	if err := c.Bind(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	claims, err := h.jwtManager.ValidateToken(req.RefreshToken)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "توکن بروز‌رسانی منقضی شده است")
	}

	user, err := h.userRepo.GetByID(claims.UserID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
	}

	if !user.Active {
		return echo.NewHTTPError(http.StatusForbidden, "حساب کاربری غیرفعال است")
	}

	// ✅ NEW POLICY: Allow token refresh even if account is locked
	// Existing sessions can continue - only NEW logins are blocked

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
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	token := strings.TrimPrefix(c.Request().Header.Get("Authorization"), "Bearer ")
	if token != "" {
		middleware.Blacklist.Add(token, time.Now().Add(h.jwtManager.Config().AccessDuration))
	}

	_ = h.auditRepo.LogAction(
		userID,
		"logout",
		"auth",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		"User logged out",
	)

	return c.JSON(http.StatusOK, map[string]string{
		"message": "از سیستم خارج شدید",
	})
}
