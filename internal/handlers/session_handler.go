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
	sessionRepo        *repository.SessionRepository
	auditRepo          *repository.AuditRepository
	tokenBlacklistRepo *repository.TokenBlacklistRepository // ✅ NEW: Add blacklist repo
}

func NewSessionHandler(
	sessionRepo *repository.SessionRepository,
	auditRepo *repository.AuditRepository,
	tokenBlacklistRepo *repository.TokenBlacklistRepository, // ✅ NEW: Add parameter
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
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در دریافت سشن‌ها")
	}

	log.Printf("[DEBUG] Found %d sessions for user %d", len(sessions), userID)

	responses := make([]*models.SessionResponse, len(sessions))
	for i, session := range sessions {
		isCurrent := session.DeviceID == currentDeviceID
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
			IsCurrent:    isCurrent,
		}

		// Register ALL sessions for invalidation tracking
		InvalidationHub.RegisterSession(session.ID)
	}

	return c.JSON(http.StatusOK, responses)
}

// ✅ NEW: Blacklist session tokens to enforce immediate logout
func (h *SessionHandler) blacklistSessionTokens(sessionID int, userID int) error {
	// Get session to retrieve token hashes
	_, err := h.sessionRepo.GetSessionByID(sessionID, userID)
	if err != nil {
		return fmt.Errorf("failed to get session: %w", err)
	}

	// Blacklist tokens using repository (if implemented)
	// This ensures tokens are immediately invalidated
	if h.tokenBlacklistRepo != nil {
		err = h.tokenBlacklistRepo.BlacklistBySessionID(sessionID, userID)
		if err != nil {
			log.Printf("[WARN] Failed to blacklist tokens for session %d: %v", sessionID, err)
		} else {
			log.Printf("[DEBUG] Blacklisted tokens for session %d", sessionID)
		}
	}

	return nil
}

// InvalidateSession revokes specific session with FORCED LOGOUT
func (h *SessionHandler) InvalidateSession(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	sessionID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه سشن نامعتبر")
	}

	// Get session details before deletion
	session, err := h.sessionRepo.GetSessionByID(sessionID, userID)
	if err != nil {
		log.Printf("[ERROR] GetSessionByID failed: %v", err)
		return echo.NewHTTPError(http.StatusNotFound, "سشن یافت نشد")
	}

	log.Printf("[DEBUG] InvalidateSession - SessionID: %d, Device: %s", sessionID, session.DeviceName)

	// ✅ STEP 1: BLACKLIST TOKENS FIRST (force immediate logout)
	err = h.blacklistSessionTokens(sessionID, userID)
	if err != nil {
		log.Printf("[WARN] Failed to blacklist tokens: %v", err)
	}

	// ✅ STEP 2: DELETE FROM DATABASE
	if err := h.sessionRepo.InvalidateSession(sessionID, userID); err != nil {
		log.Printf("[ERROR] Failed to invalidate session: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در ابطال سشن")
	}

	// ✅ STEP 3: BROADCAST INVALIDATION (for real-time notification)
	log.Printf("[DEBUG] Broadcasting invalidation to session %d", sessionID)
	InvalidationHub.InvalidateSession(sessionID)

	// ✅ STEP 4: CLEANUP AFTER 2 SECONDS (give time for notification)
	go func() {
		time.Sleep(2 * time.Second)
		InvalidationHub.CleanupSession(sessionID)
		log.Printf("[DEBUG] Cleaned up session %d after invalidation", sessionID)
	}()

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
		"message": "سشن با موفقیت ابطال شد",
	})
}

// InvalidateAllSessions revokes all user sessions with FORCED LOGOUT
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
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در بازیابی سشن‌ها")
	}

	log.Printf("[DEBUG] Found %d sessions to invalidate", len(allSessions))

	// ✅ STEP 1: BLACKLIST ALL TOKENS (force immediate logout)
	if h.tokenBlacklistRepo != nil {
		err = h.tokenBlacklistRepo.BlacklistUserTokens(userID, "All sessions invalidated by user")
		if err != nil {
			log.Printf("[WARN] Failed to blacklist user tokens: %v", err)
		} else {
			log.Printf("[DEBUG] Blacklisted all tokens for user %d", userID)
		}
	}

	// ✅ STEP 2: DELETE ALL FROM DATABASE
	if err := h.sessionRepo.InvalidateAllUserSessions(userID); err != nil {
		log.Printf("[ERROR] Failed to invalidate all sessions: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "خطا در ابطال سشن‌ها")
	}

	// ✅ STEP 3: BROADCAST INVALIDATION TO ALL SESSIONS
	sessionCount := 0
	for _, session := range allSessions {
		log.Printf("[DEBUG] Broadcasting invalidation to session %d (device: %s)", session.ID, session.DeviceName)
		InvalidationHub.InvalidateSession(session.ID)
		sessionCount++
	}

	// ✅ STEP 4: CLEANUP AFTER 2 SECONDS
	go func() {
		time.Sleep(2 * time.Second)
		for _, session := range allSessions {
			InvalidationHub.CleanupSession(session.ID)
		}
		log.Printf("[DEBUG] Cleaned up %d sessions after invalidation", len(allSessions))
	}()

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
		"message": "تمام سشن‌ها با موفقیت ابطال شدند",
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
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه سشن نامعتبر")
	}

	// Verify session belongs to user
	_, err = h.sessionRepo.GetSessionByID(sessionID, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "سشن یافت نشد")
	}

	// Check if session is invalidated (non-blocking)
	invalidationCh := InvalidationHub.GetInvalidationChannel(sessionID)

	select {
	case <-invalidationCh:
		log.Printf("[DEBUG] Session %d is invalidated", sessionID)
		return c.JSON(http.StatusOK, map[string]interface{}{
			"valid":  false,
			"reason": "سشن شما از یک دستگاه دیگر ابطال شده است",
		})
	default:
		return c.JSON(http.StatusOK, map[string]interface{}{
			"valid": true,
		})
	}
}

// WaitForSessionInvalidation long-polls for session invalidation
func (h *SessionHandler) WaitForSessionInvalidation(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "عدم احراز هویت")
	}

	sessionID, err := strconv.Atoi(c.Param("sessionId"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "شناسه سشن نامعتبر")
	}

	// Verify session belongs to user
	session, err := h.sessionRepo.GetSessionByID(sessionID, userID)
	if err != nil {
		log.Printf("[ERROR] Session %d not found for user %d", sessionID, userID)
		return echo.NewHTTPError(http.StatusNotFound, "سشن یافت نشد")
	}

	log.Printf("[DEBUG] Client waiting for invalidation - SessionID: %d, Device: %s", sessionID, session.DeviceName)

	invalidationCh := InvalidationHub.GetInvalidationChannel(sessionID)

	// Wait for invalidation with 30-second timeout
	select {
	case <-invalidationCh:
		log.Printf("[DEBUG] Session %d invalidation detected", sessionID)
		return c.JSON(http.StatusOK, map[string]interface{}{
			"invalidated": true,
			"reason":      "سشن شما از یک دستگاه دیگر ابطال شده است",
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
