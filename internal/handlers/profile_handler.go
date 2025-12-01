package handlers

import (
	"net/http"
	"strings"
	"time"

	"Monex/config"
	"Monex/internal/middleware"
	"Monex/internal/repository"

	"github.com/labstack/echo/v4"
)

type ProfileHandler struct {
	userRepo *repository.UserRepository
	config   *config.SecurityConfig
}

func NewProfileHandler(userRepo *repository.UserRepository, cfg *config.SecurityConfig) *ProfileHandler {
	return &ProfileHandler{
		userRepo: userRepo,
		config:   cfg,
	}
}

// UpdateProfileRequest represents profile update data
type UpdateProfileRequest struct {
	Email string `json:"email" validate:"email"`
}

// ChangePasswordRequest represents password change data
type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" validate:"required"`
	NewPassword string `json:"new_password" validate:"required,min=8"`
}

// GetProfile returns the current user's profile
func (h *ProfileHandler) GetProfile(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	user, err := h.userRepo.GetByID(userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
	}

	return c.JSON(http.StatusOK, user.ToResponse())
}

// UpdateProfile updates the current user's profile
func (h *ProfileHandler) UpdateProfile(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	req := new(UpdateProfileRequest)
	if err := c.Bind(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	user, err := h.userRepo.GetByID(userID)
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
			return echo.NewHTTPError(http.StatusConflict, "ایمیل وارد شده از قبل موجود است")
		}
		user.Email = strings.TrimSpace(req.Email)
	}

	if err := h.userRepo.Update(user); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در بروز رسانی حساب کاربری")
	}

	return c.JSON(http.StatusOK, user.ToResponse())
}

// ChangePassword changes the current user's password
func (h *ProfileHandler) ChangePassword(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	req := new(ChangePasswordRequest)
	if err := c.Bind(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "درخواست نامعتبر")
	}

	if req.OldPassword == "" || req.NewPassword == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "کلمه عبور قبلی و جدید را وارد کنید")
	}

	if len(req.NewPassword) < 8 {
		return echo.NewHTTPError(http.StatusBadRequest, "کلمه عبور جدید بایستی حداقل 8 کاراکتر باشد")
	}

	user, err := h.userRepo.GetByID(userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "کاربر یافت نشد")
	}

	// ✅ For first-time password change, allow skipping old password check
	if !user.PasswordChangeRequired {
		if !user.CheckPassword(req.OldPassword) {
			return echo.NewHTTPError(http.StatusUnauthorized, "رمز عبور فعلی صحیح نیست")
		}
	}

	// Set new password
	if err := user.SetPassword(req.NewPassword, h.config.BcryptCost); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در رمزگذاری کلمه عبور")
	}

	// ✅ Clear password change requirement
	user.PasswordChangeRequired = false
	now := time.Now()
	user.LastPasswordChange = &now

	if err := h.userRepo.Update(user); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در تغییر رمز عبور")
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "کلمه عبور با موفقیت تغییر کرد",
	})
}