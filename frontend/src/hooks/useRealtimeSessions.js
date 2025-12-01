import { useState, useEffect, useRef, useCallback } from "react";
import { message } from "antd";
import axios from "axios";

/**
 * ✅ REAL-TIME SESSION MANAGEMENT
 * Uses SSE + polling fallback for instant device list updates
 */
export const useRealtimeSessions = (userID) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const eventSourceRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  // ✅ Fetch sessions from API
  const fetchSessions = useCallback(async () => {
    if (!userID || !isMountedRef.current) return;

    try {
      const deviceID = localStorage.getItem("device_id");
      const res = await axios.get("/api/sessions", {
        params: { device_id: deviceID },
      });

      if (isMountedRef.current) {
        setSessions(res.data || []);
        setLastUpdate(Date.now());
      }
    } catch (error) {
      console.error("[Sessions] Fetch error:", error);
    }
  }, [userID]);

  // ✅ Setup SSE connection for real-time updates
  const connectSSE = useCallback(() => {
    if (!userID || eventSourceRef.current) return;

    const token = localStorage.getItem("access_token");
    if (!token) return;

    try {
      const url = `http://localhost:3040/api/sessions/stream?token=${token}`;
      const eventSource = new EventSource(url);

      eventSource.onopen = () => {
        console.log("[Sessions SSE] Connected");
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[Sessions SSE] Event:", data);

          switch (data.type) {
            case "session_added":
            case "session_removed":
            case "session_updated":
              // Refresh sessions list
              fetchSessions();

              if (data.type === "session_added") {
                message.info({
                  content: `دستگاه جدید متصل شد: ${
                    data.data?.device_name || "نامعلوم"
                  }`,
                  duration: 5,
                });
              }
              break;

            case "heartbeat":
              // Silent heartbeat
              break;

            default:
              console.log("[Sessions SSE] Unknown event:", data.type);
          }
        } catch (error) {
          console.error("[Sessions SSE] Parse error:", error);
        }
      };

      eventSource.onerror = (error) => {
        console.error("[Sessions SSE] Connection error:", error);
        eventSource.close();
        eventSourceRef.current = null;

        // Retry connection after delay
        setTimeout(() => {
          if (isMountedRef.current) {
            connectSSE();
          }
        }, 5000);
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error("[Sessions SSE] Setup error:", error);
    }
  }, [userID, fetchSessions]);

  // ✅ Fallback polling (if SSE fails)
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;

    pollIntervalRef.current = setInterval(() => {
      if (isMountedRef.current && !eventSourceRef.current) {
        fetchSessions();
      }
    }, 15000); // Poll every 15 seconds as fallback
  }, [fetchSessions]);

  // ✅ Delete session with confirmation
  const deleteSession = useCallback(
    async (sessionID, deviceName) => {
      setLoading(true);
      try {
        await axios.delete(`/api/sessions/${sessionID}`);

        message.success(`دستگاه "${deviceName}" با موفقیت حذف شد`);

        // Immediate update
        setSessions((prev) => prev.filter((s) => s.id !== sessionID));

        // Refresh from server
        setTimeout(fetchSessions, 500);
      } catch (error) {
        console.error("[Sessions] Delete error:", error);
        message.error(error.response?.data?.message || "خطا در حذف دستگاه");
      } finally {
        setLoading(false);
      }
    },
    [fetchSessions]
  );

  // ✅ Delete all sessions
  const deleteAllSessions = useCallback(async () => {
    setLoading(true);
    try {
      await axios.delete("/api/sessions/all");

      message.success("تمام دستگاه‌ها حذف شدند");

      // Clear local state
      setSessions([]);

      // Force logout
      setTimeout(() => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("session_id");
        window.location.href = "/login?reason=all_sessions_deleted";
      }, 1500);
    } catch (error) {
      console.error("[Sessions] Delete all error:", error);
      message.error("خطا در حذف دستگاه‌ها");
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ Initialize
  useEffect(() => {
    if (!userID) return;

    // Initial fetch
    fetchSessions();

    // Setup real-time updates
    connectSSE();
    startPolling();

    return () => {
      isMountedRef.current = false;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [userID, fetchSessions, connectSSE, startPolling]);

  // ✅ Force refresh on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isMountedRef.current) {
        console.log("[Sessions] Tab became visible - refreshing");
        fetchSessions();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchSessions]);

  return {
    sessions,
    loading,
    lastUpdate,
    deleteSession,
    deleteAllSessions,
    refresh: fetchSessions,
  };
};
