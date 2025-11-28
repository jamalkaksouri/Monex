import { useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { message } from "antd";

export const useSessionMonitor = () => {
  const { user, logout } = useAuth();

  const isMonitoringRef = useRef(false);
  const longPollingTimer = useRef(null);
  const isLoggingOut = useRef(false);
  const sessionReadyRef = useRef(false); // ✅ NEW: Track if session is ready

  // ---------------------------------------------------
  // STOP MONITORING
  // ---------------------------------------------------
  const stopMonitoring = useCallback(() => {
    isMonitoringRef.current = false;
    sessionReadyRef.current = false;

    if (longPollingTimer.current) {
      clearTimeout(longPollingTimer.current);
      longPollingTimer.current = null;
    }

    console.log("[Session Monitor] Monitoring stopped.");
  }, []);

  // ---------------------------------------------------
  // PERFORM LOGOUT SAFELY (only once) + FORCE REDIRECT
  // ---------------------------------------------------
  const safeLogout = useCallback(
    (redirect = true) => {
      if (
        isLoggingOut.current ||
        (typeof window !== "undefined" && window.__isLoggingOut)
      ) {
        return;
      }

      if (typeof window !== "undefined") {
        window.__isLoggingOut = true;
      }

      isLoggingOut.current = true;

      stopMonitoring();

      // ✅ CLEAR ALL AUTH DATA
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("session_id");
      delete axios.defaults.headers.common["Authorization"];

      // ✅ CALL AUTH CONTEXT LOGOUT
      logout();

      // ✅ FORCE REDIRECT IMMEDIATELY
      if (redirect) {
        window.location.href = "/login";
      }
    },
    [logout, stopMonitoring]
  );

  // ---------------------------------------------------
  // LONG POLLING ENGINE
  // ---------------------------------------------------
  const startLongPolling = useCallback(
    (sessionId) => {
      const poll = async () => {
        if (!isMonitoringRef.current) return;

        try {
          console.log(`[Session Monitor] Polling (session: ${sessionId})`);

          const response = await axios.get(
            `/api/sessions/${sessionId}/wait-invalidation`,
            {
              timeout: 35000,
            }
          );

          // ❌ INVALIDATED
          if (response.data.invalidated) {
            const latestSessionId = localStorage.getItem("session_id");
            if (String(latestSessionId) !== String(sessionId)) {
              console.log(
                "[Session Monitor] Invalidation for an old session ignored",
                sessionId
              );
              if (isMonitoringRef.current) {
                longPollingTimer.current = setTimeout(poll, 1000);
              }
              return;
            }

            // ✅ SESSION INVALIDATED - FORCE LOGOUT
            console.log("[Session Monitor] SESSION REVOKED - LOGGING OUT");

            message.open({
              key: "session_invalidated",
              content:
                "جلسه شما از یک دستگاه دیگر ابطال شده است. در حال خروج...",
              duration: 3,
              type: "error",
            });

            // ✅ IMMEDIATE LOGOUT + REDIRECT
            setTimeout(() => {
              safeLogout(true);
            }, 500);

            return;
          }

          // Continue polling
          if (isMonitoringRef.current) {
            longPollingTimer.current = setTimeout(poll, 1000);
          }
        } catch (error) {
          if (error.code === "ECONNABORTED") {
            console.log("[Session Monitor] Poll timeout (normal)");
            longPollingTimer.current = setTimeout(poll, 1000);
            return;
          }

          if (error.response?.status === 401) {
            console.log("[Session Monitor] 401 Unauthorized - logging out");
            message.error("جلسه منقضی شده است. لطفا دوباره وارد شوید.");
            safeLogout();
            return;
          }

          if (error.response?.status === 404) {
            console.log(
              "[Session Monitor] 404 Session not found - logging out"
            );
            message.error("جلسه یافت نشد. لطفا دوباره وارد شوید.");
            safeLogout();
            return;
          }

          console.warn(
            `[Session Monitor] Network error: ${error.message} — retry in 5s`
          );
          longPollingTimer.current = setTimeout(poll, 5000);
        }
      };

      // Start immediately
      poll();
    },
    [safeLogout]
  );

  // ---------------------------------------------------
  // START MONITORING (with session ready check)
  // ---------------------------------------------------
  const startMonitoring = useCallback(() => {
    if (isMonitoringRef.current) return;

    const sessionId = localStorage.getItem("session_id");

    if (!sessionId) {
      console.log("[Session Monitor] No session yet — waiting...");

      // ✅ WAIT FOR SESSION TO BE READY (max 5 seconds)
      let attempts = 0;
      const maxAttempts = 50; // 50 * 100ms = 5 seconds

      const wait = setInterval(() => {
        const s = localStorage.getItem("session_id");
        attempts++;

        if (s) {
          clearInterval(wait);
          console.log(
            `[Session Monitor] Session ready after ${attempts * 100}ms`
          );
          sessionReadyRef.current = true;

          // ✅ DELAY START BY 500MS TO ENSURE SESSION IS FULLY INITIALIZED
          setTimeout(() => {
            if (sessionReadyRef.current) {
              isMonitoringRef.current = true;
              console.log(
                `[Session Monitor] Starting monitoring (session: ${s})`
              );
              startLongPolling(s);
            }
          }, 500);
        } else if (attempts >= maxAttempts) {
          clearInterval(wait);
          console.warn(
            "[Session Monitor] Session not ready after 5s - stopping"
          );
        }
      }, 100);

      return;
    }

    // ✅ SESSION EXISTS - DELAY START BY 500MS
    sessionReadyRef.current = true;

    setTimeout(() => {
      if (!sessionReadyRef.current) return;

      isMonitoringRef.current = true;
      console.log(
        `[Session Monitor] Starting monitoring (session: ${sessionId})`
      );
      startLongPolling(sessionId);
    }, 500);
  }, [startLongPolling]);

  // ---------------------------------------------------
  // React Effect: Start/Stop
  // ---------------------------------------------------
  useEffect(() => {
    if (user) {
      // ✅ DELAY MONITORING START TO AVOID RACE CONDITIONS
      const startTimer = setTimeout(() => {
        startMonitoring();
      }, 1000); // Wait 1 second after user is set

      return () => {
        clearTimeout(startTimer);
        stopMonitoring();
      };
    } else {
      stopMonitoring();
    }
  }, [user, startMonitoring, stopMonitoring]);

  return { startMonitoring, stopMonitoring };
};
