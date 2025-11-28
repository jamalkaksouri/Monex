// FILE: internal/handlers/session_handler.go - COMPLETE REPLACEMENT

package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"Monex/internal/middleware"
	"Monex/internal/models"
	"Monex/internal/repository"

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

	// Convert to response and mark current
	responses := make([]*models.SessionResponse, len(sessions))
	for i, session := range sessions {
		responses[i] = &models.SessionResponse{
			ID:           session.ID,
			DeviceID:     session.DeviceID,
			DeviceName:   session.DeviceName,
			Browser:      session.Browser,
			OS:           session.OS,
			IPAddress:    session.IPAddress,
			LastActivity: session.LastActivity,
			ExpiresAt:    session.ExpiresAt,
			CreatedAt:    session.CreatedAt,
			IsCurrent:    session.DeviceID == currentDeviceID,
		}

		// Register session for invalidation tracking
		InvalidationHub.RegisterSession(session.ID)
	}

	return c.JSON(http.StatusOK, responses)
}

// InvalidateSession revokes specific session with real-time notification
func (h *SessionHandler) InvalidateSession(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	sessionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه جلسه نامعتبر")
	}

	// Get session details before deletion for audit logging
	session, err := h.sessionRepo.GetSessionByID(sessionID, userID)
	if err != nil {
		log.Printf("[ERROR] GetSessionByID failed: %v", err)
		return echo.NewHTTPError(http.StatusNotFound, "جلسه یافت نشد")
	}

	log.Printf("[DEBUG] InvalidateSession - SessionID: %d, Device: %s", sessionID, session.DeviceName)

	// Delete from database
	if err := h.sessionRepo.InvalidateSession(sessionID, userID); err != nil {
		log.Printf("[ERROR] Failed to invalidate session: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در ابطال جلسه")
	}

	// ✅ BROADCAST invalidation to the revoked session
	log.Printf("[DEBUG] Broadcasting invalidation to session %d", sessionID)
	InvalidationHub.InvalidateSession(sessionID)
	InvalidationHub.CleanupSession(sessionID)

	_ = h.auditRepo.LogAction(
		userID,
		"invalidate_session",
		"session",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		fmt.Sprintf("Terminated session on device: %s", session.DeviceName),
	)

	return c.JSON(http.StatusOK, map[string]string{
		"message": "جلسه با موفقیت ابطال شد",
	})
}

// InvalidateAllSessions revokes all user sessions with real-time notification
func (h *SessionHandler) InvalidateAllSessions(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	log.Printf("[DEBUG] InvalidateAllSessions - UserID: %d", userID)

	// Get all sessions before deletion
	allSessions, err := h.sessionRepo.GetUserSessions(userID)
	if err != nil {
		log.Printf("[ERROR] Failed to get sessions: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در بازیابی جلسات")
	}

	log.Printf("[DEBUG] Found %d sessions to invalidate", len(allSessions))

	// Delete all from database
	if err := h.sessionRepo.InvalidateAllUserSessions(userID); err != nil {
		log.Printf("[ERROR] Failed to invalidate all sessions: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در ابطال جلسات")
	}

	// ✅ BROADCAST invalidation to ALL sessions
	sessionCount := 0
	for _, session := range allSessions {
		log.Printf("[DEBUG] Broadcasting invalidation to session %d (device: %s)", session.ID, session.DeviceName)
		InvalidationHub.InvalidateSession(session.ID)
		InvalidationHub.CleanupSession(session.ID)
		sessionCount++
	}

	_ = h.auditRepo.LogAction(
		userID,
		"invalidate_all_sessions",
		"session",
		c.RealIP(),
		c.Request().Header.Get("User-Agent"),
		true,
		fmt.Sprintf("Terminated all %d sessions", sessionCount),
	)

	return c.JSON(http.StatusOK, map[string]string{
		"message": "تمام جلسات با موفقیت ابطال شدند",
	})
}

// ValidateSession checks if a session is still valid
func (h *SessionHandler) ValidateSession(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	sessionID, err := strconv.Atoi(c.Param("sessionId"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه جلسه نامعتبر")
	}

	// Verify session belongs to user
	_, err = h.sessionRepo.GetSessionByID(sessionID, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "جلسه یافت نشد")
	}

	// Check if session is invalidated (non-blocking)
	invalidationCh := InvalidationHub.GetInvalidationChannel(sessionID)

	select {
	case <-invalidationCh:
		// Session has been invalidated
		log.Printf("[DEBUG] Session %d is invalidated", sessionID)
		return c.JSON(http.StatusOK, map[string]interface{}{
			"valid":  false,
			"reason": "جلسه شما از یک دستگاه دیگر ابطال شده است",
		})
	default:
		// Session is still valid
		return c.JSON(http.StatusOK, map[string]interface{}{
			"valid": true,
		})
	}
}

// WaitForSessionInvalidation long-polls for session invalidation
// This is called by frontend and blocks until session is invalidated or timeout
func (h *SessionHandler) WaitForSessionInvalidation(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	sessionID, err := strconv.Atoi(c.Param("sessionId"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه جلسه نامعتبر")
	}

	// Verify session belongs to user
	session, err := h.sessionRepo.GetSessionByID(sessionID, userID)
	if err != nil {
		log.Printf("[ERROR] Session %d not found for user %d", sessionID, userID)
		return echo.NewHTTPError(http.StatusNotFound, "جلسه یافت نشد")
	}

	log.Printf("[DEBUG] Client waiting for invalidation - SessionID: %d, Device: %s", sessionID, session.DeviceName)

	invalidationCh := InvalidationHub.GetInvalidationChannel(sessionID)

	// Wait for invalidation with 30-second timeout
	select {
	case <-invalidationCh:
		log.Printf("[DEBUG] Session %d invalidation detected", sessionID)
		InvalidationHub.CleanupSession(sessionID)
		return c.JSON(http.StatusOK, map[string]interface{}{
			"invalidated": true,
			"reason":      "جلسه شما از یک دستگاه دیگر ابطال شده است",
		})

	case <-time.After(30 * time.Second):
		// Timeout - session still valid, client will reconnect
		log.Printf("[DEBUG] Session %d poll timeout (session still valid)", sessionID)
		return c.JSON(http.StatusOK, map[string]interface{}{
			"invalidated": false,
		})

	case <-c.Request().Context().Done():
		// Client disconnected
		log.Printf("[DEBUG] Client disconnected from session %d poll", sessionID)
		return nil
	}
}