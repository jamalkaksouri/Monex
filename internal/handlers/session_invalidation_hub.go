// Real-time session invalidation notification system

package handlers

import (
	"log"
	"sync"
)

// SessionInvalidationHub manages real-time session invalidation notifications
type SessionInvalidationHub struct {
	mu              sync.RWMutex
	// Map: sessionID -> channel to notify that session is invalidated
	invalidatedChan map[int]chan struct{}
}

// Global hub instance - MUST be initialized in main.go
var InvalidationHub = &SessionInvalidationHub{
	invalidatedChan: make(map[int]chan struct{}),
}

// RegisterSession registers a session for invalidation tracking
func (h *SessionInvalidationHub) RegisterSession(sessionID int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, exists := h.invalidatedChan[sessionID]; !exists {
		h.invalidatedChan[sessionID] = make(chan struct{}, 1)
		log.Printf("[DEBUG] Registered session %d for invalidation tracking", sessionID)
	}
}

// GetInvalidationChannel returns a channel that closes when session is invalidated
func (h *SessionInvalidationHub) GetInvalidationChannel(sessionID int) <-chan struct{} {
	h.mu.Lock()
	defer h.mu.Unlock()

	if ch, exists := h.invalidatedChan[sessionID]; exists {
		return ch
	}

	// Return closed channel if session doesn't exist (already invalidated)
	ch := make(chan struct{})
	close(ch)
	return ch
}

// InvalidateSession notifies a specific session it has been revoked
func (h *SessionInvalidationHub) InvalidateSession(sessionID int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if ch, exists := h.invalidatedChan[sessionID]; exists {
		select {
		case ch <- struct{}{}:
			log.Printf("[DEBUG] Invalidation signal sent to session %d", sessionID)
		default:
			log.Printf("[DEBUG] Invalidation signal already sent to session %d", sessionID)
		}
	}
}

// CleanupSession removes session from tracking
func (h *SessionInvalidationHub) CleanupSession(sessionID int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if ch, exists := h.invalidatedChan[sessionID]; exists {
		close(ch)
		delete(h.invalidatedChan, sessionID)
		log.Printf("[DEBUG] Cleaned up invalidation channel for session %d", sessionID)
	}
}