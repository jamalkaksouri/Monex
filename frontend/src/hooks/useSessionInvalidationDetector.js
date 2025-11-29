import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { message } from "antd";

/**
 * Hook that detects when user is disabled/locked and forces logout
 * Runs EVERY 5 seconds to detect status changes
 */
export const useSessionInvalidationDetector = () => {
  const { user, logout, isLoggingOut } = useAuth();
  const isMountedRef = useRef(true);
  const lastCheckRef = useRef(0);
  const MIN_CHECK_INTERVAL = 5000; // 5 seconds

  useEffect(() => {
    isMountedRef.current = true;

    if (!user) {
      console.log("[SessionDetector] No user - skipping checks");
      return;
    }

    // ✅ Check immediately on mount
    const checkUserStatus = async () => {
      // Skip if logging out
      if (isLoggingOut() || !isMountedRef.current) {
        console.log("[SessionDetector] Skipping - logout in progress");
        return;
      }

      // Throttle checks - don't check too frequently
      const now = Date.now();
      if (now - lastCheckRef.current < MIN_CHECK_INTERVAL) {
        console.log("[SessionDetector] Throttling - too soon since last check");
        return;
      }
      lastCheckRef.current = now;

      try {
        console.log("[SessionDetector] Checking user status...");

        // This endpoint requires auth and will check user status
        const response = await axios.get("/api/profile", {
          timeout: 5000,
        });

        // Check if user is still active
        if (!response.data.active) {
          console.error("[SECURITY] User account is disabled!");
          message.error({
            content:
              "حساب کاربری شما غیرفعال شده است. لطفا با پشتیبان تماس بگیرید.",
            duration: 3,
            onClose: () => {
              logout(false); // Silent logout
              setTimeout(() => {
                window.location.href = "/login?reason=account_disabled";
              }, 500);
            },
          });
          return;
        }

        // Check if user is locked
        if (response.data.locked) {
          console.error("[SECURITY] User account is locked!");

          if (response.data.permanently_locked) {
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
          } else if (response.data.locked_until) {
            const unlockTime = new Date(response.data.locked_until);
            const now = new Date();
            const minutesRemaining = Math.ceil((unlockTime - now) / 60000);

            message.warning({
              content: `حساب شما موقتاً مسدود است. ${minutesRemaining} دقیقه دیگر امتحان کنید.`,
              duration: 3,
            });

            logout(false);
            setTimeout(() => {
              window.location.href = "/login?reason=temporarily_locked";
            }, 500);
          }
          return;
        }

        console.log("[SessionDetector] User status check passed");
      } catch (error) {
        // 401/403 means token is invalid or user is unauthorized
        if (error.response?.status === 401 || error.response?.status === 403) {
          console.error(
            "[SECURITY] Access denied or unauthorized!",
            error.response.data
          );

          const reason =
            error.response.data?.message || "دسترسی شما ابطال شده است";
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
          return;
        }

        // Other errors - just log, don't force logout
        console.warn("[SessionDetector] Status check failed:", error.message);
      }
    };

    // Check immediately
    checkUserStatus();

    // Then check every 5 seconds
    const interval = setInterval(checkUserStatus, MIN_CHECK_INTERVAL);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [user, logout, isLoggingOut]);

  return {};
};
