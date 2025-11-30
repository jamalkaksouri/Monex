package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"Monex/internal/middleware"

	"github.com/labstack/echo/v4"
)

// NotificationEvent represents a server-sent event
type NotificationEvent struct {
	Type      string                 `json:"type"` // "security_warning", "session_invalidated", "account_status"
	Message   string                 `json:"message"`
	Severity  string                 `json:"severity"` // "info", "warning", "critical"
	Data      map[string]interface{} `json:"data,omitempty"`
	Timestamp time.Time              `json:"timestamp"`
}

// NotificationHub manages SSE connections for all users
type NotificationHub struct {
	mu          sync.RWMutex
	connections map[int]map[chan NotificationEvent]struct{} // userID -> set of channels
}

var GlobalNotificationHub = &NotificationHub{
	connections: make(map[int]map[chan NotificationEvent]struct{}),
}

// Subscribe adds a new SSE connection for a user
func (h *NotificationHub) Subscribe(userID int) chan NotificationEvent {
	h.mu.Lock()
	defer h.mu.Unlock()

	ch := make(chan NotificationEvent, 10) // Buffered channel

	if h.connections[userID] == nil {
		h.connections[userID] = make(map[chan NotificationEvent]struct{})
	}

	h.connections[userID][ch] = struct{}{}
	log.Printf("[SSE] User %d subscribed (total connections: %d)", userID, len(h.connections[userID]))

	return ch
}

// Unsubscribe removes an SSE connection
func (h *NotificationHub) Unsubscribe(userID int, ch chan NotificationEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if connections, exists := h.connections[userID]; exists {
		delete(connections, ch)
		close(ch)

		if len(connections) == 0 {
			delete(h.connections, userID)
		}

		log.Printf("[SSE] User %d unsubscribed (remaining: %d)", userID, len(h.connections[userID]))
	}
}

// Broadcast sends notification to all connections for a user
func (h *NotificationHub) Broadcast(userID int, event NotificationEvent) {
	h.mu.RLock()
	connections := h.connections[userID]
	h.mu.RUnlock()

	if connections == nil {
		return
	}

	event.Timestamp = time.Now()

	for ch := range connections {
		select {
		case ch <- event:
			log.Printf("[SSE] Sent %s to user %d", event.Type, userID)
		case <-time.After(1 * time.Second):
			log.Printf("[SSE] Timeout sending to user %d", userID)
		}
	}
}

// BroadcastToAll sends notification to all active users
func (h *NotificationHub) BroadcastToAll(event NotificationEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for userID := range h.connections {
		go h.Broadcast(userID, event)
	}
}

// SSEHandler handles Server-Sent Events endpoint
type SSEHandler struct {
	hub *NotificationHub
}

func NewSSEHandler(hub *NotificationHub) *SSEHandler {
	return &SSEHandler{hub: hub}
}

// HandleSSE manages SSE connections
func (h *SSEHandler) HandleSSE(c echo.Context) error {
	userID, err := middleware.GetUserID(c)
	if err != nil {
		return echo.NewHTTPError(401, "عدم احراز هویت")
	}

	// Set SSE headers
	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().Header().Set("X-Accel-Buffering", "no") // Disable Nginx buffering

	// Subscribe to notifications
	eventChan := h.hub.Subscribe(userID)
	defer h.hub.Unsubscribe(userID, eventChan)

	// Send initial connection success
	initialEvent := NotificationEvent{
		Type:      "connected",
		Message:   "اتصال برقرار شد",
		Severity:  "info",
		Timestamp: time.Now(),
	}

	if err := h.writeEvent(c, initialEvent); err != nil {
		return err
	}

	// Keep connection alive with heartbeat
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	ctx := c.Request().Context()

	for {
		select {
		case <-ctx.Done():
			log.Printf("[SSE] Client disconnected - User %d", userID)
			return nil

		case event := <-eventChan:
			if err := h.writeEvent(c, event); err != nil {
				log.Printf("[SSE] Write error for user %d: %v", userID, err)
				return err
			}

		case <-ticker.C:
			// Send heartbeat
			heartbeat := NotificationEvent{
				Type:      "heartbeat",
				Timestamp: time.Now(),
			}
			if err := h.writeEvent(c, heartbeat); err != nil {
				return err
			}
		}
	}
}

// writeEvent writes an SSE event to the response
func (h *SSEHandler) writeEvent(c echo.Context, event NotificationEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	// SSE format: data: {json}\n\n
	_, err = fmt.Fprintf(c.Response(), "data: %s\n\n", data)
	if err != nil {
		return err
	}

	c.Response().Flush()
	return nil
}

// SendSecurityWarning sends a security warning to a specific user
func SendSecurityWarning(userID int, message string, severity string, data map[string]interface{}) {
	event := NotificationEvent{
		Type:      "security_warning",
		Message:   message,
		Severity:  severity,
		Data:      data,
		Timestamp: time.Now(),
	}

	GlobalNotificationHub.Broadcast(userID, event)
}

// SendAccountStatusChange notifies user of account status change
func SendAccountStatusChange(userID int, status string, message string) {
	event := NotificationEvent{
		Type:     "account_status",
		Message:  message,
		Severity: "warning",
		Data: map[string]interface{}{
			"status": status,
		},
		Timestamp: time.Now(),
	}

	GlobalNotificationHub.Broadcast(userID, event)
}
