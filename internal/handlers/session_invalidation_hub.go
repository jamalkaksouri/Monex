// internal/handlers/session_invalidation_hub.go - FIXED VERSION

package handlers

import (
	"log"
	"sync"
	"time"
)

type SessionInvalidationHub struct {
	mu              sync.RWMutex
	invalidatedChan map[int]chan struct{}
	registeredAt    map[int]time.Time
	closed          map[int]bool // ✅ Track closed channels
}

var InvalidationHub = &SessionInvalidationHub{
	invalidatedChan: make(map[int]chan struct{}),
	registeredAt:    make(map[int]time.Time),
	closed:          make(map[int]bool),
}

func (h *SessionInvalidationHub) RegisterSession(sessionID int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// ✅ Don't re-register if already exists
	if _, exists := h.invalidatedChan[sessionID]; exists {
		return
	}

	h.invalidatedChan[sessionID] = make(chan struct{}, 1)
	h.registeredAt[sessionID] = time.Now()
	h.closed[sessionID] = false
	log.Printf("[DEBUG] Registered session %d for invalidation tracking", sessionID)
}

func (h *SessionInvalidationHub) GetInvalidationChannel(sessionID int) <-chan struct{} {
	h.mu.Lock()
	defer h.mu.Unlock()

	// ✅ Check if channel exists and is not closed
	if ch, exists := h.invalidatedChan[sessionID]; exists {
		if !h.closed[sessionID] {
			return ch
		}
	}

	// ✅ Create new channel only if needed
	ch := make(chan struct{}, 1)
	h.invalidatedChan[sessionID] = ch
	h.registeredAt[sessionID] = time.Now()
	h.closed[sessionID] = false

	return ch
}

func (h *SessionInvalidationHub) InvalidateSession(sessionID int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	ch, exists := h.invalidatedChan[sessionID]
	if !exists || h.closed[sessionID] {
		return // Already closed or doesn't exist
	}

	// ✅ Safety: Only invalidate if registered for > 100ms
	if registeredTime, ok := h.registeredAt[sessionID]; ok {
		if time.Since(registeredTime) < 100*time.Millisecond {
			log.Printf("[SKIP] Session %d registered too recently, skipping invalidation", sessionID)
			return
		}
	}

	// ✅ Thread-safe signal sending
	select {
	case ch <- struct{}{}:
		log.Printf("[OK] Invalidation sent to session %d", sessionID)
	default:
		log.Printf("[OK] Signal already sent to session %d", sessionID)
	}
}

func (h *SessionInvalidationHub) CleanupSession(sessionID int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	ch, exists := h.invalidatedChan[sessionID]
	if !exists {
		return
	}

	// ✅ Safe channel closing
	if !h.closed[sessionID] {
		close(ch)
		h.closed[sessionID] = true
	}

	delete(h.invalidatedChan, sessionID)
	delete(h.registeredAt, sessionID)
	delete(h.closed, sessionID)
	
	log.Printf("[DEBUG] Cleaned up invalidation channel for session %d", sessionID)
}

func (h *SessionInvalidationHub) IsSessionRegistered(sessionID int) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()

	_, exists := h.invalidatedChan[sessionID]
	return exists && !h.closed[sessionID]
}

// ✅ NEW: Periodic cleanup of stale channels
func (h *SessionInvalidationHub) StartCleanupRoutine(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			h.cleanupStaleChannels()
		}
	}()
}

func (h *SessionInvalidationHub) cleanupStaleChannels() {
	h.mu.Lock()
	defer h.mu.Unlock()

	now := time.Now()
	staleThreshold := 1 * time.Hour

	for sessionID, registeredTime := range h.registeredAt {
		if now.Sub(registeredTime) > staleThreshold {
			if ch, exists := h.invalidatedChan[sessionID]; exists {
				if !h.closed[sessionID] {
					close(ch)
					h.closed[sessionID] = true
				}
			}
			delete(h.invalidatedChan, sessionID)
			delete(h.registeredAt, sessionID)
			delete(h.closed, sessionID)
			log.Printf("[CLEANUP] Removed stale session %d", sessionID)
		}
	}
}