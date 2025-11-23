package middleware

import (
	"net/http"
	"sync"

	"github.com/labstack/echo/v4"
	"golang.org/x/time/rate"
)

var userLimiters = struct {
	sync.Mutex
	limiters map[int]*rate.Limiter
}{
	limiters: make(map[int]*rate.Limiter),
}

func UserRateLimitMiddleware(reqPerSec float64) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			userID, ok := c.Get("user_id").(int)
			if !ok {
				return next(c)
			}

			userLimiters.Lock()
			limiter, exists := userLimiters.limiters[userID]
			if !exists {
				limiter = rate.NewLimiter(rate.Limit(reqPerSec), 1)
				userLimiters.limiters[userID] = limiter
			}
			userLimiters.Unlock()

			if !limiter.Allow() {
				return echo.NewHTTPError(http.StatusTooManyRequests,
					"تعداد درخواست بیش از حد مجاز است")
			}

			return next(c)
		}
	}
}
