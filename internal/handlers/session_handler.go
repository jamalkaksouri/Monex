package handlers

import (
	"Monex/internal/middleware"
	"Monex/internal/repository"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
)

type SessionHandler struct {
	sessionRepo *repository.SessionRepository
	auditRepo   *repository.AuditRepository
}

func NewSessionHandler(
	sessionRepo *repository.SessionRepository,
	auditRepo *repository.AuditRepository,
) *SessionHandler {
	return &SessionHandler{
		sessionRepo: sessionRepo,
		auditRepo:   auditRepo,
	}
}

// GetSessions returns all user sessions
func (h *SessionHandler) GetSessions(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	sessions, err := h.sessionRepo.GetUserSessions(userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در دریافت جلسات")
	}

	return c.JSON(http.StatusOK, sessions)
}

// InvalidateSession revokes specific session
func (h *SessionHandler) InvalidateSession(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	sessionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه جلسه نامعتبر")
	}

	if err := h.sessionRepo.InvalidateSession(sessionID, userID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در ابطال جلسه")
	}

	_ = h.auditRepo.LogAction(
		userID,
		"invalidate_session",
		"session",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		"User terminated session",
	)

	return c.JSON(http.StatusOK, map[string]string{
		"message": "جلسه با موفقیت ابطال شد",
	})
}

// InvalidateAllSessions revokes all user sessions
func (h *SessionHandler) InvalidateAllSessions(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	if err := h.sessionRepo.InvalidateAllUserSessions(userID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در ابطال جلسات")
	}

	_ = h.auditRepo.LogAction(
		userID,
		"invalidate_all_sessions",
		"session",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		"User terminated all sessions",
	)

	return c.JSON(http.StatusOK, map[string]string{
		"message": "تمام جلسات با موفقیت ابطال شدند",
	})
}
