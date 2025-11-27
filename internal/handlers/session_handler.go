package handlers

import (
	"Monex/internal/middleware"
	"Monex/internal/models"
	"Monex/internal/repository"
	"log"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
)

type SessionHandler struct {
	sessionRepo        *repository.SessionRepository
	auditRepo          *repository.AuditRepository
	tokenBlacklistRepo *repository.TokenBlacklistRepository
}

func NewSessionHandler(
	sessionRepo *repository.SessionRepository,
	auditRepo *repository.AuditRepository,
	tokenBlacklistRepo *repository.TokenBlacklistRepository,
) *SessionHandler {
	return &SessionHandler{
		sessionRepo:        sessionRepo,
		auditRepo:          auditRepo,
		tokenBlacklistRepo: tokenBlacklistRepo,
	}
}

// GetSessions returns all user sessions with current device marked
func (h *SessionHandler) GetSessions(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	currentDeviceID := c.QueryParam("device_id")

	log.Printf("[DEBUG] GetSessions - UserID: %d, CurrentDeviceID: %s", userID, currentDeviceID)

	sessions, err := h.sessionRepo.GetUserSessions(userID)
	if err != nil {
		log.Printf("[ERROR] GetUserSessions failed: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در دریافت جلسات")
	}

	log.Printf("[DEBUG] Found %d sessions for user %d", len(sessions), userID)

	// ✅ FIX: Proper timestamp parsing and response formatting
	responses := make([]*models.SessionResponse, len(sessions))
	for i, session := range sessions {
		responses[i] = &models.SessionResponse{
			ID:           session.ID,
			DeviceID:     session.DeviceID,
			DeviceName:   session.DeviceName,
			Browser:      session.Browser,
			OS:           session.OS,
			IPAddress:    session.IPAddress,
			LastActivity: session.LastActivity, // Already parsed as time.Time
			ExpiresAt:    session.ExpiresAt,    // Already parsed as time.Time
			CreatedAt:    session.CreatedAt,
			IsCurrent:    session.DeviceID == currentDeviceID,
		}

		log.Printf("[DEBUG] Session %d: LastActivity=%v, ExpiresAt=%v",
			session.ID, session.LastActivity, session.ExpiresAt)
	}

	return c.JSON(http.StatusOK, responses)
}

// InvalidateSession revokes specific session - ✅ FIXED with token blacklisting
func (h *SessionHandler) InvalidateSession(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	sessionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه جلسه نامعتبر")
	}

	// Get session details before deletion
	sessions, err := h.sessionRepo.GetUserSessions(userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در دریافت جلسه")
	}

	var sessionToDelete *models.Session
	for _, s := range sessions {
		if s.ID == sessionID {
			sessionToDelete = s
			break
		}
	}

	if sessionToDelete == nil {
		return echo.NewHTTPError(http.StatusNotFound, "جلسه یافت نشد")
	}

	// ✅ FIX: Blacklist tokens BEFORE deleting session
	if err := h.tokenBlacklistRepo.BlacklistBySessionID(sessionID, userID); err != nil {
		log.Printf("[ERROR] Failed to blacklist tokens: %v", err)
		// Continue anyway - still delete session
	}

	// Delete session
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
		"User terminated session: "+sessionToDelete.DeviceName,
	)

	log.Printf("[DEBUG] Session %d invalidated for user %d", sessionID, userID)

	return c.JSON(http.StatusOK, map[string]string{
		"message": "جلسه با موفقیت ابطال شد",
	})
}

// InvalidateAllSessions revokes all user sessions - ✅ FIXED
func (h *SessionHandler) InvalidateAllSessions(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	// ✅ FIX: Blacklist ALL user tokens
	if err := h.tokenBlacklistRepo.BlacklistUserTokens(userID, "User invalidated all sessions"); err != nil {
		log.Printf("[ERROR] Failed to blacklist all user tokens: %v", err)
		// Continue anyway
	}

	// Delete all sessions
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

	log.Printf("[DEBUG] All sessions invalidated for user %d", userID)

	return c.JSON(http.StatusOK, map[string]string{
		"message": "تمام جلسات با موفقیت ابطال شدند",
	})
}
