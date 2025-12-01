// frontend/src/hooks/useConnectionHealth.js
import { useState, useEffect, useRef, useCallback } from "react";
import { message } from "antd";
import axios from "axios";

/**
 * ✅ ROBUST CONNECTION HEALTH MONITOR
 * Tracks server connection status with multiple detection methods
 */
export const useConnectionHealth = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [serverReachable, setServerReachable] = useState(true);
  const [lastSuccessfulPing, setLastSuccessfulPing] = useState(Date.now());
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const pingIntervalRef = useRef(null);
  const offlineNotificationShown = useRef(false);
  const isMountedRef = useRef(true);

  // ✅ Server health check
  const checkServerHealth = useCallback(async () => {
    if (!isMountedRef.current) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await axios.get("/api/health", {
        signal: controller.signal,
        timeout: 5000,
      });

      clearTimeout(timeoutId);

      if (response.status === 200) {
        if (!serverReachable) {
          console.log("[Health] Server connection restored");
          setServerReachable(true);
          setReconnectAttempts(0);
          setLastSuccessfulPing(Date.now());

          if (offlineNotificationShown.current) {
            message.success("اتصال به سرور برقرار شد", 3);
            offlineNotificationShown.current = false;
          }
        } else {
          setLastSuccessfulPing(Date.now());
        }
        return true;
      }
    } catch (error) {
      console.warn("[Health] Server ping failed:", error.message);

      if (serverReachable) {
        console.error("[Health] Server connection lost");
        setServerReachable(false);
        setReconnectAttempts((prev) => prev + 1);

        if (!offlineNotificationShown.current) {
          message.error({
            content: "اتصال به سرور قطع شد. در حال تلاش برای اتصال مجدد...",
            duration: 0,
            key: "server-offline",
          });
          offlineNotificationShown.current = true;
        }
      }
      return false;
    }
  }, [serverReachable]);

  // ✅ Browser online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      console.log("[Health] Browser online");
      setIsOnline(true);
      checkServerHealth();
    };

    const handleOffline = () => {
      console.log("[Health] Browser offline");
      setIsOnline(false);
      setServerReachable(false);

      message.warning({
        content: "اتصال اینترنت قطع شده است",
        duration: 0,
        key: "browser-offline",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [checkServerHealth]);

  // ✅ Periodic health checks
  useEffect(() => {
    // Initial check
    checkServerHealth();

    // Regular pinging
    pingIntervalRef.current = setInterval(() => {
      if (isMountedRef.current) {
        checkServerHealth();
      }
    }, 10000); // Check every 10 seconds

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, [checkServerHealth]);

  // ✅ Axios interceptor for connection errors
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (
          error.code === "ERR_NETWORK" ||
          error.code === "ECONNABORTED" ||
          !error.response
        ) {
          console.error("[Health] Network error detected:", error.message);

          if (serverReachable) {
            setServerReachable(false);

            if (!offlineNotificationShown.current) {
              message.error({
                content: "خطا در ارتباط با سرور. لطفا اتصال خود را بررسی کنید",
                duration: 0,
                key: "network-error",
              });
              offlineNotificationShown.current = true;
            }
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [serverReachable]);

  // ✅ Cleanup
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      message.destroy("server-offline");
      message.destroy("browser-offline");
      message.destroy("network-error");
    };
  }, []);

  return {
    isOnline,
    serverReachable,
    isConnected: isOnline && serverReachable,
    lastSuccessfulPing,
    reconnectAttempts,
    checkHealth: checkServerHealth,
  };
};
