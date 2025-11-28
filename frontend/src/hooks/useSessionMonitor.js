// Real-time session invalidation monitoring

import { useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { message } from "antd";

export const useSessionMonitor = () => {
  const { user, logout } = useAuth();
  const longPollingRef = useRef(null);
  const isMonitoringRef = useRef(false);

  // Start monitoring for session invalidation
  const startMonitoring = useCallback(() => {
    if (isMonitoringRef.current) {
      console.log("[Session Monitor] Already monitoring");
      return;
    }

    const sessionId = localStorage.getItem("session_id");
    const deviceId = localStorage.getItem("device_id");

    if (!sessionId || !deviceId) {
      console.warn("[Session Monitor] Session ID or Device ID missing");
      return;
    }

    isMonitoringRef.current = true;
    console.log(
      `[Session Monitor] Started monitoring - SessionID: ${sessionId}, DeviceID: ${deviceId}`
    );

    // Start long-polling
    startLongPolling(sessionId);
  }, [logout]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    isMonitoringRef.current = false;
    if (longPollingRef.current) {
      clearTimeout(longPollingRef.current);
      longPollingRef.current = null;
    }
    console.log("[Session Monitor] Stopped monitoring");
  }, []);

  // Long-polling function
  const startLongPolling = useCallback(
    (sessionId) => {
      if (!isMonitoringRef.current) {
        console.log("[Session Monitor] Monitoring stopped, exiting poll");
        return;
      }

      const pollServer = async () => {
        try {
          console.log(`[Session Monitor] Polling... (SessionID: ${sessionId})`);

          // ✅ Call server endpoint that waits for invalidation
          const response = await axios.get(
            `/api/sessions/${sessionId}/wait-invalidation`,
            {
              timeout: 35000, // 35 seconds (server timeout is 30)
            }
          );

          if (response.data.invalidated) {
            // ✅ SESSION INVALIDATED - LOGOUT IMMEDIATELY
            console.error(
              `[Session Monitor] Session invalidated: ${response.data.reason}`
            );

            message.error({
              content:
                "جلسه شما از یک دستگاه دیگر ابطال شده است. لطفا دوباره وارد شوید.",
              duration: 5,
            });

            // Stop monitoring
            stopMonitoring();

            // Clear storage
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            localStorage.removeItem("session_id");
            localStorage.removeItem("device_id");
            delete axios.defaults.headers.common["Authorization"];

            // Call logout context
            logout();

            // Redirect to login
            setTimeout(() => {
              window.location.href = "/login";
            }, 1500);
            return;
          }

          // Still valid - restart polling
          if (isMonitoringRef.current) {
            longPollingRef.current = setTimeout(pollServer, 1000);
          }
        } catch (error) {
          if (error.code === "ECONNABORTED") {
            // Timeout is normal - just restart polling
            console.log("[Session Monitor] Poll timeout (normal) - restarting");
            if (isMonitoringRef.current) {
              longPollingRef.current = setTimeout(pollServer, 1000);
            }
          } else if (error.response?.status === 401) {
            // Unauthorized - session expired or invalid token
            console.warn("[Session Monitor] Session expired (401)");
            message.error({
              content: "جلسه شما منقضی شده است. لطفا دوباره وارد شوید.",
              duration: 5,
            });

            stopMonitoring();

            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            localStorage.removeItem("session_id");
            localStorage.removeItem("device_id");
            delete axios.defaults.headers.common["Authorization"];

            logout();
            setTimeout(() => {
              window.location.href = "/login";
            }, 1500);
          } else if (error.response?.status === 404) {
            // Session not found
            console.warn("[Session Monitor] Session not found (404)");
            message.error({
              content: "جلسه شما یافت نشد. لطفا دوباره وارد شوید.",
              duration: 5,
            });

            stopMonitoring();
            logout();
            setTimeout(() => {
              window.location.href = "/login";
            }, 1500);
          } else {
            console.warn(
              `[Session Monitor] Poll error: ${error.message} - restarting in 5s`
            );
            // Network error - restart polling with delay
            if (isMonitoringRef.current) {
              longPollingRef.current = setTimeout(pollServer, 5000);
            }
          }
        }
      };

      // Start polling immediately
      pollServer();
    },
    [logout, stopMonitoring]
  );

  // Monitor effect
  useEffect(() => {
    if (user) {
      startMonitoring();
    } else {
      stopMonitoring();
    }

    return () => {
      stopMonitoring();
    };
  }, [user, startMonitoring, stopMonitoring]);

  return {
    startMonitoring,
    stopMonitoring,
  };
};
