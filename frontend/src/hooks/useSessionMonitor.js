import { useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { message } from "antd";
import { setAxiosLoggingOut } from "../axios";

export const useSessionMonitor = () => {
  const { user, setUser, setToken, isLoggingOut } = useAuth();
  const isMonitoringRef = useRef(false);
  const longPollingTimer = useRef(null);
  const isLoggingOutRef = useRef(false);
  const sessionCountRef = useRef(0);

  // ✅ Stop monitoring
  const stopMonitoring = useCallback(() => {
    console.log("[Session] Stopping monitoring...");
    isMonitoringRef.current = false;

    if (longPollingTimer.current) {
      clearTimeout(longPollingTimer.current);
      longPollingTimer.current = null;
    }

    console.log("[Session] Monitoring stopped");
  }, []);

  // ✅ FORCE LOGOUT (clean, single-toast, no duplication)
  const forceLogout = useCallback(
    (reason) => {
      if (isLoggingOutRef.current) return;
      isLoggingOutRef.current = true;
      setAxiosLoggingOut(true); // ✅ NEW: Notify axios

      console.log("[Session] FORCE LOGOUT:", reason);

      // Stop monitoring FIRST
      stopMonitoring();

      // Clear storage
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("session_id");
      delete axios.defaults.headers.common["Authorization"];

      // Clear auth context (silent)
      setUser(null);
      setToken(null);

      // Show ONE toast
      message.error(reason, 2);

      // Redirect AFTER toast
      setTimeout(() => {
        setAxiosLoggingOut(false); // ✅ Reset before redirect
        window.location.href = "/login?reason=session_ended";
      }, 1500);
    },
    [setUser, setToken, stopMonitoring]
  );

  // ✅ Long Polling
  const startLongPolling = useCallback(
    (sessionId) => {
      const poll = async () => {
        // ❌ CRITICAL: Stop if monitoring disabled or logging out
        if (
          !isMonitoringRef.current ||
          isLoggingOut() ||
          isLoggingOutRef.current
        ) {
          console.log("[Session] Polling stopped - monitoring disabled");
          return;
        }

        try {
          const response = await axios.get(
            `/api/sessions/${sessionId}/wait-invalidation`,
            { timeout: 35000 }
          );

          // Session invalidated
          if (response.data.invalidated) {
            forceLogout("سشن شما از یک دستگاه دیگر ابطال شده است.");
            return;
          }

          // Continue polling (valid)
          if (
            isMonitoringRef.current &&
            !isLoggingOut() &&
            !isLoggingOutRef.current
          ) {
            longPollingTimer.current = setTimeout(poll, 1000);
          }
        } catch (error) {
          // ❌ Stop polling if logging out
          if (isLoggingOut() || isLoggingOutRef.current) {
            console.log("[Session] Polling stopped - logout in progress");
            return;
          }

          // 401 → expired
          if (error.response?.status === 401) {
            forceLogout("سشن منقضی شده است. لطفا دوباره وارد شوید.");
            return;
          }

          // 404 → deleted
          if (error.response?.status === 404) {
            forceLogout("سشن یافت نشد. لطفا دوباره وارد شوید.");
            return;
          }

          // Timeout → normal long poll end
          if (error.code === "ECONNABORTED") {
            if (
              isMonitoringRef.current &&
              !isLoggingOut() &&
              !isLoggingOutRef.current
            ) {
              longPollingTimer.current = setTimeout(poll, 1000);
            }
            return;
          }

          // Network errors → retry
          console.warn("[Session] Network error, retrying in 5s...");
          if (
            isMonitoringRef.current &&
            !isLoggingOut() &&
            !isLoggingOutRef.current
          ) {
            longPollingTimer.current = setTimeout(poll, 5000);
          }
        }
      };

      poll();
    },
    [forceLogout, isLoggingOut]
  );

  // ✅ Start/Stop based on user state
  useEffect(() => {
    // ❌ CRITICAL: Don't start if user is null
    if (!user) {
      console.log("[Session] No user - stopping monitoring");
      stopMonitoring();
      isLoggingOutRef.current = false; // Reset flag when no user
      return;
    }

    const sessionId = localStorage.getItem("session_id");

    if (!sessionId) {
      console.log("[Session] Waiting for session to be initialized...");

      let attempts = 0;
      const maxAttempts = 50;

      const wait = setInterval(() => {
        const s = localStorage.getItem("session_id");
        attempts++;

        if (s) {
          clearInterval(wait);
          console.log(`[Session] Ready after ${attempts * 100}ms`);
          isMonitoringRef.current = true;
          startLongPolling(parseInt(s));
        } else if (attempts >= maxAttempts) {
          clearInterval(wait);
          console.warn("[Session] Session not ready after 5s");
        }
      }, 100);

      return () => {
        clearInterval(wait);
        stopMonitoring();
      };
    }

    // Session exists → start monitoring
    isMonitoringRef.current = true;
    console.log(`[Session] Starting monitor for sessionId=${sessionId}`);
    startLongPolling(parseInt(sessionId));

    return () => {
      stopMonitoring();
    };
  }, [user, startLongPolling, stopMonitoring]);

  // ✅ Lightweight polling to detect remote changes
  useEffect(() => {
    // ❌ Don't poll if no user
    if (!user) return;

    const checkForChanges = async () => {
      // Skip if logging out or no user
      if (isLoggingOut() || !user || isLoggingOutRef.current) return;

      try {
        const deviceID = localStorage.getItem("device_id");
        const response = await axios.get("/api/sessions", {
          params: { device_id: deviceID },
        });

        const currentCount = response.data.length;

        // ✅ Only update if count changed (lightweight check)
        if (
          sessionCountRef.current > 0 &&
          sessionCountRef.current !== currentCount
        ) {
          console.log(
            `[Sessions] Count changed: ${sessionCountRef.current} → ${currentCount}`
          );

          if (user) {
            message.info("لیست دستگاه‌ها به‌روز شد");
          }
        }

        sessionCountRef.current = currentCount;
      } catch (err) {
        // Silently ignore errors during polling
        if (!isLoggingOut() && !isLoggingOutRef.current) {
          console.warn("[Sessions] Polling check failed:", err);
        }
      }
    };

    // ✅ Check every 10 seconds (lightweight - only compares count)
    const pollInterval = setInterval(checkForChanges, 10000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [isLoggingOut, user]);

  return { startMonitoring: () => {}, stopMonitoring };
};
