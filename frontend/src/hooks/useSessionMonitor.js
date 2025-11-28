import { useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { message } from "antd";

export const useSessionMonitor = () => {
  const { user, logout } = useAuth();

  const isMonitoringRef = useRef(false);
  const longPollingTimer = useRef(null);
  const isLoggingOutRef = useRef(false);

  // □□□□□ FORCE LOGOUT (clean, no duplicate toast)
  const forceLogout = useCallback(
    (reason) => {
      if (isLoggingOutRef.current) return; // Prevent duplicates
      isLoggingOutRef.current = true;

      console.log("[Session] FORCE LOGOUT:", reason);

      // Local cleanup (logout already clears context)
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("session_id");
      delete axios.defaults.headers.common["Authorization"];

      // Clear auth context (silent)
      logout(false); // important: silent logout, no toast

      // Show toast ONCE
      message.error(reason, 2);

      // Redirect AFTER message renders
      setTimeout(() => {
        window.location.href = "/login?reason=session_ended";
      }, 1500);
    },
    [logout]
  );

  // □□□□□ Stop monitoring
  const stopMonitoring = useCallback(() => {
    isMonitoringRef.current = false;

    if (longPollingTimer.current) {
      clearTimeout(longPollingTimer.current);
      longPollingTimer.current = null;
    }

    console.log("[Session] Monitoring stopped");
  }, []);

  // □□□□□ Long Polling
  const startLongPolling = useCallback(
    (sessionId) => {
      const poll = async () => {
        if (!isMonitoringRef.current) return;

        try {
          const response = await axios.get(
            `/api/sessions/${sessionId}/wait-invalidation`,
            { timeout: 35000 }
          );

          if (response.data.invalidated) {
            forceLogout("سشن شما از یک دستگاه دیگر ابطال شده است.");
            return;
          }

          // Still valid → poll again
          longPollingTimer.current = setTimeout(poll, 1000);
        } catch (error) {
          if (error.response?.status === 401) {
            forceLogout("سشن منقضی شده است. لطفا دوباره وارد شوید.");
            return;
          }

          if (error.response?.status === 404) {
            forceLogout("سشن یافت نشد. لطفا دوباره وارد شوید.");
            return;
          }

          if (error.code === "ECONNABORTED") {
            longPollingTimer.current = setTimeout(poll, 1000);
            return;
          }

          console.warn("[Session] Network error, retrying in 5s...");
          longPollingTimer.current = setTimeout(poll, 5000);
        }
      };

      poll();
    },
    [forceLogout]
  );

  // □□□□□ Start/Stop Monitoring
  useEffect(() => {
    if (user) {
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

        return () => clearInterval(wait);
      }

      // session already exists
      isMonitoringRef.current = true;
      console.log(`[Session] Starting monitor for sessionId=${sessionId}`);
      startLongPolling(parseInt(sessionId));

      return () => stopMonitoring();
    } else {
      stopMonitoring();
    }
  }, [user, startLongPolling, stopMonitoring]);

  return { startMonitoring: () => {}, stopMonitoring };
};
