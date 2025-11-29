package handlers

import (
	"log"
	"sync"
	"time"
)

// SessionInvalidationHub manages real-time session invalidation notifications
type SessionInvalidationHub struct {
	mu              sync.RWMutex
	// Map: sessionID -> channel to notify that session is invalidated
	invalidatedChan map[int]chan struct{}
	// Track when each session was registered to prevent false signals
	registeredAt    map[int]time.Time
}

// Global hub instance - MUST be initialized in main.go
var InvalidationHub = &SessionInvalidationHub{
	invalidatedChan: make(map[int]chan struct{}),
	registeredAt:    make(map[int]time.Time),
}

// RegisterSession registers a session for invalidation tracking
func (h *SessionInvalidationHub) RegisterSession(sessionID int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, exists := h.invalidatedChan[sessionID]; !exists {
		h.invalidatedChan[sessionID] = make(chan struct{}, 1)
		h.registeredAt[sessionID] = time.Now()
		log.Printf("[DEBUG] Registered session %d for invalidation tracking at %v", sessionID, time.Now())
	}
}

// GetInvalidationChannel returns a channel that closes when session is invalidated
// GetInvalidationChannel returns a channel that closes when session is invalidated
func (h *SessionInvalidationHub) GetInvalidationChannel(sessionID int) <-chan struct{} {
	h.mu.Lock()
	defer h.mu.Unlock()

	// ALWAYS check if already registered
	if ch, exists := h.invalidatedChan[sessionID]; exists {
		return ch
	}

	// ✅ FIX: Create NEW channel (don't return closed one)
	ch := make(chan struct{}, 1)
	h.invalidatedChan[sessionID] = ch
	h.registeredAt[sessionID] = time.Now()

	return ch
}

// ✅ FIX: Only invalidate if properly registered
func (h *SessionInvalidationHub) InvalidateSession(sessionID int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if ch, exists := h.invalidatedChan[sessionID]; exists {
		// ✅ SAFETY: Only invalidate if registered for > 100ms
		if registeredTime, ok := h.registeredAt[sessionID]; ok {
			if time.Since(registeredTime) < 100*time.Millisecond {
				return  // Too soon - skip
			}
		}

		select {
		case ch <- struct{}{}:
			log.Printf("[OK] Invalidation sent to session %d", sessionID)
		default:
			log.Printf("[OK] Signal already sent to session %d", sessionID)
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
		delete(h.registeredAt, sessionID)
		log.Printf("[DEBUG] Cleaned up invalidation channel for session %d", sessionID)
	}
}

// IsSessionRegistered checks if a session is currently tracked
func (h *SessionInvalidationHub) IsSessionRegistered(sessionID int) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()

	_, exists := h.invalidatedChan[sessionID]
	return exists
}