package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"Monex/config"
	"Monex/internal/middleware"
	"Monex/internal/models"
	"Monex/internal/repository"

	"github.com/labstack/echo/v4"
)

type UserHandler struct {
	userRepo           *repository.UserRepository
	auditRepo          *repository.AuditRepository
	sessionRepo        *repository.SessionRepository
	tokenBlacklistRepo *repository.TokenBlacklistRepository
	config             *config.Config
}

// Note: constructor signature changed to accept sessionRepo and tokenBlacklistRepo.
// Update call sites accordingly.
func NewUserHandler(
	userRepo *repository.UserRepository,
	auditRepo *repository.AuditRepository,
	sessionRepo *repository.SessionRepository,
	tokenBlacklistRepo *repository.TokenBlacklistRepository,
	cfg *config.Config,
) *UserHandler {
	return &UserHandler{
		userRepo:           userRepo,
		auditRepo:          auditRepo,
		sessionRepo:        sessionRepo,
		tokenBlacklistRepo: tokenBlacklistRepo,
		config:             cfg,
	}
}

// CreateUserRequest represents user creation data (admin only)
type CreateUserRequest struct {
	Username string `json:"username" validate:"required,min=3,max=50"`
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
	Role     string `json:"role" validate:"required,oneof=admin user"`
	Active   *bool  `json:"active"`
}

// UpdateUserRequest represents user update data (admin only)
type UpdateUserRequest struct {
	Email  string `json:"email" validate:"email"`
	Role   string `json:"role" validate:"oneof=admin user"`
	Active *bool  `json:"active"`
}

// ListUsers returns all users (admin only)
func (h *UserHandler) ListUsers(c echo.Context) error {
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}

	pageSize, _ := strconv.Atoi(c.QueryParam("pageSize"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}

	offset := (page - 1) * pageSize

	// Build filters
	filters := make(map[string]interface{})
	if search := c.QueryParam("q"); search != "" {
		filters["search"] = search
	}
	if sortField := c.QueryParam("sortField"); sortField != "" {
		filters["sortField"] = sortField
	}
	if sortOrder := c.QueryParam("sortOrder"); sortOrder != "" {
		filters["sortOrder"] = sortOrder
	}

	users, total, err := h.userRepo.List(pageSize, offset, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to list users")
	}

	// Convert to response format
	responses := make([]*models.UserResponse, len(users))
	for i, user := range users {
		responses[i] = user.ToResponse()
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"data":     responses,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// GetUser returns a specific user by ID (admin only)
func (h *UserHandler) GetUser(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه کاربر نامعتبر است")
	}

	user, err := h.userRepo.GetByID(id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
	}

	return c.JSON(http.StatusOK, user.ToResponse())
}

// CreateUser creates a new user (admin only)
func (h *UserHandler) CreateUser(c echo.Context) error {
	adminID, _ := middleware.GetUserID(c)
	req := new(CreateUserRequest)
	if err := c.Bind(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	// Validate input
	if req.Username == "" || req.Email == "" || req.Password == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "نام کاربری، ایمیل و کلمه عبور را وارد نمایید")
	}

	if len(req.Username) < 3 || len(req.Username) > 50 {
		return echo.NewHTTPError(http.StatusBadRequest, "کلمه عبور باید بین 3 تا 50 کاراکتر باشد")
	}

	if len(req.Password) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "کلمه عبور بایستی حداقل 8 کاراکتر باشد")
	}

	// Validate role
	if req.Role != models.RoleAdmin && req.Role != models.RoleUser {
		return echo.NewHTTPError(http.StatusBadRequest, "نقش نامعتبر")
	}

	// Check if username exists
	exists, err := h.userRepo.ExistsByUsername(strings.TrimSpace(req.Username))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در بررسی نام کاربری")
	}
	if exists {
		_ = h.auditRepo.LogAction(
			adminID,
			"create_user",
			"user",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			fmt.Sprintf("Username already exists: %s", req.Username),
		)
		return echo.NewHTTPError(http.StatusConflict, "این نام کاربری از قبل در سیستم موجود است")
	}

	// Check if email exists
	exists, err = h.userRepo.ExistsByEmail(strings.TrimSpace(req.Email))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در بررسی ایمیل")
	}
	if exists {
		_ = h.auditRepo.LogAction(
			adminID,
			"create_user",
			"user",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			fmt.Sprintf("Email already exists: %s", req.Email),
		)
		return echo.NewHTTPError(http.StatusConflict, "این ایمیل از قبل در سیستم موجود است")
	}

	// Set default active status
	active := true
	if req.Active != nil {
		active = *req.Active
	}

	// Create user
	user := &models.User{
		Username: strings.TrimSpace(req.Username),
		Email:    strings.TrimSpace(req.Email),
		Role:     req.Role,
		Active:   active,
	}

	// Hash password
	if err := user.SetPassword(req.Password, h.config.Security.BcryptCost); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در رمزگذاری کلمه عبور")
	}

	// Save user
	if err := h.userRepo.Create(user); err != nil {
		_ = h.auditRepo.LogAction(
			adminID,
			"create_user",
			"user",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			fmt.Sprintf("Failed to create user: %v", err),
		)
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در ایجاد کاربر حدید")
	}

	// ✅ Log successful user creation
	_ = h.auditRepo.LogAction(
		adminID,
		"create_user",
		"user",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		fmt.Sprintf("Created user: %s (ID: %d, Role: %s)", user.Username, user.ID, user.Role),
	)

	return c.JSON(http.StatusCreated, user.ToResponse())
}

// DeleteUser deletes a user (admin only)
func (h *UserHandler) DeleteUser(c echo.Context) error {
	adminID, _ := middleware.GetUserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه کاربر نامعتبر است")
	}

	// Prevent deleting yourself
	currentUserID := c.Get("user_id").(int)
	if id == currentUserID {
		return echo.NewHTTPError(http.StatusBadRequest, "شما مجوز حذف حساب کاربری خود را ندارید")
	}

	// Get user info before deletion
	user, err := h.userRepo.GetByID(id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
	}

	if err := h.userRepo.Delete(id); err != nil {
		_ = h.auditRepo.LogAction(
			adminID,
			"delete_user",
			"user",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			fmt.Sprintf("Failed to delete user ID %d: %v", id, err),
		)
		return echo.NewHTTPError(http.StatusInternalServerError, "خطایی هنگام حذف کاربر رخ داد")
	}

	// ✅ Log successful user deletion
	_ = h.auditRepo.LogAction(
		adminID,
		"delete_user",
		"user",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		fmt.Sprintf("Deleted user: %s (ID: %d, Email: %s)", user.Username, user.ID, user.Email),
	)

	return c.JSON(http.StatusOK, map[string]string{"message": "کاربر با موفقیت حذف شد"})
}

// ResetUserPasswordRequest represents password reset data (admin only)
type ResetUserPasswordRequest struct {
	NewPassword string `json:"new_password" validate:"required,min=8"`
}

// ResetUserPassword resets a user's password (admin only)
func (h *UserHandler) ResetUserPassword(c echo.Context) error {
	adminID, _ := middleware.GetUserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه کاربر نامعتبر است")
	}

	req := new(ResetUserPasswordRequest)
	if err := c.Bind(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	if len(req.NewPassword) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "کلمه عبور بایستی حداقل 8 کاراکتر باشد")
	}

	user, err := h.userRepo.GetByID(id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
	}

	// Set new password
	if err := user.SetPassword(req.NewPassword, h.config.Security.BcryptCost); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در رمزگذاری کلمه عبور")
	}

	if err := h.userRepo.Update(user); err != nil {
		_ = h.auditRepo.LogAction(
			adminID,
			"reset_password",
			"user",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			fmt.Sprintf("Failed to reset password for user ID %d: %v", id, err),
		)
		return echo.NewHTTPError(http.StatusInternalServerError, "خطایی در ریست کردن کلمه عبور رخ داد")
	}

	// ✅ Log successful password reset
	_ = h.auditRepo.LogAction(
		adminID,
		"reset_password",
		"user",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		fmt.Sprintf("Reset password for user: %s (ID: %d)", user.Username, user.ID),
	)

	return c.JSON(http.StatusOK, map[string]string{"message": "کلمه عبور با موفقیت ریست شد"})
}

// UnlockUser unlocks a user account (admin only)
func (h *UserHandler) UnlockUser(c echo.Context) error {
	adminID, _ := middleware.GetUserID(c)

	username := c.Param("id") // از username استفاده می‌شود

	// Get user by username
	user, err := h.userRepo.GetByUsername(username)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
	}

	// Unlock the user
	user.Locked = false
	user.LockedUntil = nil
	user.PermanentlyLocked = false
	user.FailedAttempts = 0

	if err := h.userRepo.UpdateLockStatus(user); err != nil {
		_ = h.auditRepo.LogAction(
			adminID,
			"unlock_user",
			"user",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			fmt.Sprintf("Failed to unlock user %s: %v", username, err),
		)
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در بروزرسانی وضعیت کاربر")
	}

	_ = h.auditRepo.LogAction(
		adminID,
		"unlock_user",
		"user",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		fmt.Sprintf("Unlocked user: %s (ID: %d)", user.Username, user.ID),
	)

	return c.JSON(http.StatusOK, map[string]string{
		"message": "کاربر با موفقیت از حالت قفل خارج شد",
	})
}

func (h *UserHandler) disableUserSessions(
	userID int,
	reason string,
) error {
	// Get all active sessions
	sessions, err := h.sessionRepo.GetUserSessions(userID)
	if err != nil {
		log.Printf("[WARN] Failed to get sessions: %v", err)
		return err
	}

	// Blacklist all tokens for this user
	if h.tokenBlacklistRepo != nil {
		if err := h.tokenBlacklistRepo.BlacklistUserTokens(userID, reason); err != nil {
			log.Printf("[WARN] Failed to blacklist tokens: %v", err)
		}
	} else {
		log.Printf("[WARN] tokenBlacklistRepo is nil; skipping token blacklist for user %d", userID)
	}

	// Invalidate all sessions (triggers notification)
	if err := h.sessionRepo.InvalidateAllUserSessions(userID); err != nil {
		log.Printf("[WARN] Failed to invalidate sessions: %v", err)
	}

	// Broadcast invalidation to all connected clients
	for _, session := range sessions {
		log.Printf("[SECURITY] Broadcasting invalidation - SessionID: %d, Reason: %s", session.ID, reason)
		// InvalidationHub assumed to be a package-level var in this package
		InvalidationHub.InvalidateSession(session.ID)
		InvalidationHub.CleanupSession(session.ID)
	}

	return nil
}

// Update existing UpdateUser method
func (h *UserHandler) UpdateUser(c echo.Context) error {
	adminID, _ := middleware.GetUserID(c)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه کاربر نامعتبر است")
	}

	req := new(UpdateUserRequest)
	if err := c.Bind(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	user, err := h.userRepo.GetByID(id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
	}

	oldActive := user.Active
	oldUserInfo := fmt.Sprintf("%s (Email: %s, Role: %s, Active: %v)", user.Username, user.Email, user.Role, user.Active)

	// Update email if provided
	if req.Email != "" && req.Email != user.Email {
		exists, err := h.userRepo.ExistsByEmail(strings.TrimSpace(req.Email))
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "خطا در بررسی ایمیل")
		}
		if exists {
			return echo.NewHTTPError(http.StatusConflict, "این ایمیل از قبل در سیستم موجود است")
		}
		user.Email = strings.TrimSpace(req.Email)
	}

	// Update role if provided
	if req.Role != "" {
		if req.Role != models.RoleAdmin && req.Role != models.RoleUser {
			return echo.NewHTTPError(http.StatusBadRequest, "نقش نامعتبر")
		}
		user.Role = req.Role
	}

	// Update active status if provided
	if req.Active != nil {
		user.Active = *req.Active

		// ✅ NEW: If disabling user, invalidate all sessions
		if oldActive && !user.Active {
			log.Printf("[SECURITY] Admin %d is disabling user %d - invalidating all sessions", adminID, id)
			h.disableUserSessions(
				id,
				fmt.Sprintf("Account disabled by admin %d", adminID),
			)
		}
	}

	if err := h.userRepo.Update(user); err != nil {
		_ = h.auditRepo.LogAction(
			adminID,
			"update_user",
			"user",
			c.RealIP(),
			c.Request().Header.Get("User-Agent"),
			false,
			fmt.Sprintf("Failed to update user ID %d: %v", id, err),
		)
		return echo.NewHTTPError(http.StatusInternalServerError, "خطایی هنگام بروز رسانی کاربر رخ داده است")
	}

	newUserInfo := fmt.Sprintf("%s (Email: %s, Role: %s, Active: %v)", user.Username, user.Email, user.Role, user.Active)
	_ = h.auditRepo.LogAction(
		adminID,
		"update_user",
		"user",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		fmt.Sprintf("Updated user ID %d: From [%s] To [%s]", id, oldUserInfo, newUserInfo),
	)

	return c.JSON(http.StatusOK, user.ToResponse())
}
