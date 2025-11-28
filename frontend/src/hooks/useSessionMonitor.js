// useSessionMonitor.js
// Fully fixed & stable WhatsApp-style session invalidation watcher

import { useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { message } from "antd";

export const useSessionMonitor = () => {
  const { user, logout } = useAuth();

  const isMonitoringRef = useRef(false); // prevents multi-start
  const longPollingTimer = useRef(null); // timeout holder
  const isLoggingOut = useRef(false); // avoid multiple logout() calls

  // ---------------------------------------------------
  // STOP MONITORING
  // ---------------------------------------------------
  const stopMonitoring = useCallback(() => {
    isMonitoringRef.current = false;

    if (longPollingTimer.current) {
      clearTimeout(longPollingTimer.current);
      longPollingTimer.current = null;
    }

    console.log("[Session Monitor] Monitoring stopped.");
  }, []);

  // ---------------------------------------------------
  // PERFORM LOGOUT SAFELY (only once)
  // ---------------------------------------------------
  const safeLogout = useCallback(
    (redirect = true) => {
      if (isLoggingOut.current) return;
      isLoggingOut.current = true;

      console.warn("[Session Monitor] Performing forced logout...");

      stopMonitoring();

      // Clear tokens
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("session_id");
      localStorage.removeItem("device_id");

      delete axios.defaults.headers.common["Authorization"];

      logout();

      if (redirect) {
        setTimeout(() => {
          window.location.href = "/login";
        }, 1200);
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
            console.error("[Session Monitor] Session invalidated!");

            message.error({
              content:
                "جلسه شما از یک دستگاه دیگر ابطال شده است. لطفا دوباره وارد شوید.",
              duration: 5,
            });

            safeLogout();
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
            message.error("جلسه منقضی شده است. لطفا دوباره وارد شوید.");
            safeLogout();
            return;
          }

          if (error.response?.status === 404) {
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
  // START MONITORING
  // ---------------------------------------------------
  const startMonitoring = useCallback(() => {
    if (isMonitoringRef.current) return;

    const sessionId = localStorage.getItem("session_id");

    if (!sessionId) {
      console.log("[Session Monitor] No session yet — waiting...");

      // Wait for session_id to appear
      const wait = setInterval(() => {
        const s = localStorage.getItem("session_id");
        if (s) {
          clearInterval(wait);
          startMonitoring(); // safe because isMonitoringRef stops recursion
        }
      }, 400);

      return;
    }

    isMonitoringRef.current = true;

    console.log(`[Session Monitor] Monitoring active (session: ${sessionId})`);

    // Start the long polling engine
    startLongPolling(sessionId);
  }, [startLongPolling]);

  // ---------------------------------------------------
  // React Effect: Start/Stop
  // ---------------------------------------------------
  useEffect(() => {
    if (user) startMonitoring();
    else stopMonitoring();

    return () => {
      stopMonitoring();
    };
  }, [user, startMonitoring, stopMonitoring]);

  return { startMonitoring, stopMonitoring };
};
