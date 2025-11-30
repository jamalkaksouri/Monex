import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { message } from "antd";

/**
 * OPTIMIZED: Event-driven session invalidation detector
 * - Removed continuous polling
 * - Uses SSE for real-time notifications
 * - Minimal fallback checking only on user interaction
 */
export const useSessionInvalidationDetector = () => {
  const { user, logout, isLoggingOut } = useAuth();
  const isMountedRef = useRef(true);
  const lastCheckRef = useRef(0);
  const MIN_CHECK_INTERVAL = 60000; // 1 minute (drastically reduced from 5 seconds)

  useEffect(() => {
    isMountedRef.current = true;

    if (!user) {
      return;
    }

    // ✅ CRITICAL OPTIMIZATION: Only check on visibility change (tab becomes active)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && !isLoggingOut() && isMountedRef.current) {
        const now = Date.now();
        if (now - lastCheckRef.current < MIN_CHECK_INTERVAL) {
          return; // Throttle
        }
        lastCheckRef.current = now;

        console.log("[SessionDetector] Tab became active - checking status");
        await checkUserStatus();
      }
    };

    // Only check when tab becomes visible (user returns to page)
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Initial check on mount (only once)
    const initialCheckTimer = setTimeout(() => {
      if (isMountedRef.current && !isLoggingOut()) {
        checkUserStatus();
      }
    }, 3000); // Wait 3 seconds after page load

    return () => {
      isMountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimeout(initialCheckTimer);
    };
  }, [user, logout, isLoggingOut]);

  const checkUserStatus = async () => {
    if (isLoggingOut() || !isMountedRef.current) {
      return;
    }

    try {
      const response = await axios.get("/api/profile", { timeout: 5000 });

      // ✅ ONLY check for PERMANENT blocks or account disabled
      // Temporary locks are handled by SSE notifications
      if (!response.data.active) {
        console.error("[SECURITY] User account is disabled!");
        message.error({
          content: "حساب کاربری شما غیرفعال شده است.",
          duration: 3,
          onClose: () => {
            logout(false);
            setTimeout(() => {
              window.location.href = "/login?reason=account_disabled";
            }, 500);
          },
        });
        return;
      }

      if (response.data.permanently_locked) {
        console.error("[SECURITY] User account is permanently locked!");
        message.error({
          content: "حساب کاربری شما به دلیل نقض امنیتی مسدود شده است.",
          duration: 3,
          onClose: () => {
            logout(false);
            setTimeout(() => {
              window.location.href = "/login?reason=account_locked";
            }, 500);
          },
        });
        return;
      }

      // ✅ NOTE: Temporary locks (locked: true) are NOT checked here
      // They are handled by SSE real-time notifications

    } catch (error) {
      if (isLoggingOut()) {
        return; // Ignore errors during logout
      }

      if (error.response?.status === 401 || error.response?.status === 403) {
        console.error("[SECURITY] Access denied!");
        const reason = error.response.data?.message || "دسترسی شما ابطال شده است";
        message.error({
          content: reason,
          duration: 3,
          onClose: () => {
            logout(false);
            setTimeout(() => {
              window.location.href = "/login?reason=unauthorized";
            }, 500);
          },
        });
      }
      // Other errors are silently ignored (network issues, etc.)
    }
  };

  return {};
};