package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"Monex/config"
	"Monex/internal/models"
	"Monex/internal/repository"

	"github.com/labstack/echo/v4"
)

type UserHandler struct {
	userRepo *repository.UserRepository
	config   *config.Config
}

func NewUserHandler(userRepo *repository.UserRepository, cfg *config.Config) *UserHandler {
	return &UserHandler{
		userRepo: userRepo,
		config:   cfg,
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

	users, total, err := h.userRepo.List(pageSize, offset)
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
		return echo.NewHTTPError(http.StatusConflict, "این نام کاربری از قبل در سیستم موجود است")
	}

	// Check if email exists
	exists, err = h.userRepo.ExistsByEmail(strings.TrimSpace(req.Email))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در بررسی ایمیل")
	}
	if exists {
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
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در ایجاد کاربر حدید")
	}

	return c.JSON(http.StatusCreated, user.ToResponse())
}

// UpdateUser updates a user (admin only)
func (h *UserHandler) UpdateUser(c echo.Context) error {
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

	// Update email if provided
	if req.Email != "" && req.Email != user.Email {
		// Check if email exists
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
	}

	if err := h.userRepo.Update(user); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطایی هنگام بروز رسانی کاربر رخ داده است")
	}

	return c.JSON(http.StatusOK, user.ToResponse())
}

// DeleteUser deletes a user (admin only)
func (h *UserHandler) DeleteUser(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه کاربر نامعتبر است")
	}

	// Prevent deleting yourself
	currentUserID := c.Get("user_id").(int)
	if id == currentUserID {
		return echo.NewHTTPError(http.StatusBadRequest, "شما مجوز حذف حساب کاربری خود را ندارید")
	}

	if err := h.userRepo.Delete(id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطایی هنگام حذف کاربر رخ داد")
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "کاربر با موفقیت حذف شد"})
}

// ResetUserPasswordRequest represents password reset data (admin only)
type ResetUserPasswordRequest struct {
	NewPassword string `json:"new_password" validate:"required,min=8"`
}

// ResetUserPassword resets a user's password (admin only)
func (h *UserHandler) ResetUserPassword(c echo.Context) error {
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
		return echo.NewHTTPError(http.StatusInternalServerError, "خطایی در ریست کردن کلمه عبور رخ داد")
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "کلمه عبور با موفقیت ریست شد"})
}


