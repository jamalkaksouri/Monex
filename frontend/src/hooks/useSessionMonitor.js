import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";

// ✅ CRITICAL: Start monitoring IMMEDIATELY after login
export const useSessionMonitor = () => {
  const { user, logout } = useAuth();
  const sessionIDRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    // ✅ FIX: Get session_id from localStorage immediately
    const sessionId = localStorage.getItem("session_id");

    if (!sessionId || !user) {
      console.log("[Session] No session to monitor");
      return;
    }

    sessionIDRef.current = parseInt(sessionId);
    console.log(
      "[Session] Starting monitor - SessionID:",
      sessionIDRef.current
    );

    // ✅ Start long-polling immediately
    let pollInterval;

    const startPolling = () => {
      const poll = async () => {
        if (!isMountedRef.current || !user) return;

        try {
          const response = await axios.get(
            `/api/sessions/${sessionIDRef.current}/wait-invalidation`,
            { timeout: 35000 }
          );

          if (response.data.invalidated) {
            console.error("[SECURITY] Session invalidated remotely!");
            logout(false);
            setTimeout(() => {
              window.location.href = "/login?reason=session_ended";
            }, 500);
            return;
          }

          // Continue polling
          if (isMountedRef.current) {
            pollInterval = setTimeout(poll, 1000);
          }
        } catch (error) {
          if (error.code === "ECONNABORTED") {
            // Timeout - normal long poll end
            if (isMountedRef.current) {
              pollInterval = setTimeout(poll, 1000);
            }
          } else {
            console.warn("[Session] Polling error:", error.message);
            if (isMountedRef.current) {
              pollInterval = setTimeout(poll, 5000);
            }
          }
        }
      };

      poll();
    };

    // ✅ Start polling
    startPolling();

    return () => {
      isMountedRef.current = false;
      if (pollInterval) clearTimeout(pollInterval);
    };
  }, [user, logout]);
};
