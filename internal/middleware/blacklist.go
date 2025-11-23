package middleware

import (
	"sync"
	"time"
)

// TokenBlacklist manages blacklisted JWT tokens
type TokenBlacklist struct {
	mu     sync.RWMutex
	tokens map[string]time.Time
}

// Blacklist is the global token blacklist instance
var Blacklist = &TokenBlacklist{
	tokens: make(map[string]time.Time),
}

// Add adds a token to the blacklist with an expiry time
func (tb *TokenBlacklist) Add(token string, expiry time.Time) {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	tb.tokens[token] = expiry
}

// Contains checks if a token is blacklisted
func (tb *TokenBlacklist) Contains(token string) bool {
	tb.mu.RLock()
	defer tb.mu.RUnlock()
	
	expiry, exists := tb.tokens[token]
	if !exists {
		return false
	}
	
	// Remove expired tokens
	if time.Now().After(expiry) {
		go tb.Remove(token)
		return false
	}
	
	return true
}

// Remove removes a token from the blacklist
func (tb *TokenBlacklist) Remove(token string) {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	delete(tb.tokens, token)
}

// Cleanup removes expired tokens (should be called periodically)
func (tb *TokenBlacklist) Cleanup() {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	
	now := time.Now()
	for token, expiry := range tb.tokens {
		if now.After(expiry) {
			delete(tb.tokens, token)
		}
	}
}

// StartCleanupRoutine starts a goroutine to periodically clean expired tokens
func (tb *TokenBlacklist) StartCleanupRoutine(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			tb.Cleanup()
		}
	}()
}