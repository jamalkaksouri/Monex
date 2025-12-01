import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useRef,
} from "react";
import axios from "axios";
import { message, ConfigProvider } from "antd";
import { setAxiosLoggingOut } from "../axios";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth باید در AuthProvider استفاده شود");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem("access_token"));

  const refreshPromiseRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const sessionInitializedRef = useRef(false);

  // ✅ NEW: Flag to prevent API calls during logout
  const isLoggingOutRef = useRef(false);

  const getOrCreateDeviceID = useCallback(() => {
    let deviceID = localStorage.getItem("device_id");
    if (!deviceID) {
      deviceID = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c) {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        }
      );
      localStorage.setItem("device_id", deviceID);
      console.log("[Auth] Generated new device_id:", deviceID);
    }
    return deviceID;
  }, []);

  useEffect(() => {
    getOrCreateDeviceID();
  }, [getOrCreateDeviceID]);

  const scheduleTokenRefresh = useCallback((accessToken) => {
    try {
      const parts = accessToken.split(".");
      if (parts.length !== 3) return;

      const payload = JSON.parse(atob(parts[1]));
      if (!payload.exp) return;

      const expiryMs = payload.exp * 1000;
      const nowMs = Date.now();
      const timeUntilExpiry = expiryMs - nowMs;
      const refreshAt = timeUntilExpiry - 60000;

      if (refreshAt > 0) {
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
        }

        refreshTimerRef.current = setTimeout(() => {
          console.log("[Auth] Access token expiring soon - refreshing...");
          performTokenRefresh();
        }, refreshAt);
      }
    } catch (err) {
      console.warn("[Auth] Failed to schedule token refresh:", err);
    }
  }, []);

  const performTokenRefresh = useCallback(async () => {
    // ✅ Don't refresh if logging out
    if (isLoggingOutRef.current) {
      console.log("[Auth] Skipping token refresh - logout in progress");
      return false;
    }

    const refreshToken = localStorage.getItem("refresh_token");

    if (!refreshToken) {
      console.warn("[Auth] No refresh token available");
      return false;
    }

    if (refreshPromiseRef.current) {
      console.log("[Auth] Token refresh already in progress");
      return refreshPromiseRef.current;
    }

    try {
      refreshPromiseRef.current = axios.post("/api/auth/refresh", {
        refresh_token: refreshToken,
      });

      const response = await refreshPromiseRef.current;
      const { access_token, refresh_token } = response.data;

      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);

      axios.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;

      setToken(access_token);

      scheduleTokenRefresh(access_token);

      console.log("[Auth] Token refreshed successfully");
      return true;
    } catch (error) {
      console.error("[Auth] Token refresh failed:", error);
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("session_id");
      delete axios.defaults.headers.common["Authorization"];
      setToken(null);
      setUser(null);
      return false;
    } finally {
      refreshPromiseRef.current = null;
    }
  }, [scheduleTokenRefresh]);

  const loadProfile = async () => {
    // ✅ Don't load profile if logging out
    if (isLoggingOutRef.current) {
      console.log("[Auth] Skipping profile load - logout in progress");
      return;
    }

    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await axios.get("/api/profile");
      setUser(res.data);

      sessionInitializedRef.current = true;
      console.log("[Auth] Session initialized successfully");
    } catch (error) {
      if (error.response?.status === 401) {
        const refreshed = await performTokenRefresh();
        if (refreshed) {
          try {
            const res = await axios.get("/api/profile");
            setUser(res.data);
            sessionInitializedRef.current = true;
            console.log("[Auth] Session initialized after token refresh");
          } catch {
            console.error("[Auth] Profile load failed after refresh");
          }
        }
      } else {
        console.error("[Auth] Profile load error:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      loadProfile();
      scheduleTokenRefresh(token);
    } else {
      setLoading(false);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [token, scheduleTokenRefresh]);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        // ✅ Skip interceptor if logging out
        if (isLoggingOutRef.current) {
          return Promise.reject(error);
        }

        const originalRequest = error.config;

        if (error.response?.status === 400 || error.response?.status === 422) {
          return Promise.reject(error);
        }

        if (
          error.response?.status === 401 &&
          (originalRequest.url.includes("/login") ||
            originalRequest.url.includes("/register") ||
            originalRequest.url.includes("/delete-all"))
        ) {
          return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = localStorage.getItem("refresh_token");

            if (!refreshToken) {
              return Promise.reject(error);
            }

            if (!refreshPromiseRef.current) {
              refreshPromiseRef.current = axios
                .post("/api/auth/refresh", { refresh_token: refreshToken })
                .finally(() => {
                  refreshPromiseRef.current = null;
                });
            }

            const response = await refreshPromiseRef.current;
            const { access_token, refresh_token } = response.data;

            localStorage.setItem("access_token", access_token);
            localStorage.setItem("refresh_token", refresh_token);

            axios.defaults.headers.common[
              "Authorization"
            ] = `Bearer ${access_token}`;
            originalRequest.headers["Authorization"] = `Bearer ${access_token}`;

            return axios(originalRequest);
          } catch (refreshError) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            localStorage.removeItem("session_id");
            delete axios.defaults.headers.common["Authorization"];
            setToken(null);
            setUser(null);
            window.location.href = "/login";
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [performTokenRefresh]);

  const login = async (username, password) => {
    try {
      // ✅ Get or create device_id BEFORE login
      let deviceID = localStorage.getItem("device_id");

      if (!deviceID) {
        // Generate client-side device fingerprint
        deviceID = generateDeviceFingerprint();
        localStorage.setItem("device_id", deviceID);
      }

      console.log("[Auth] Login with device_id:", deviceID);

      // ✅ Send device_id as query parameter
      const res = await axios.post(`/api/auth/login?device_id=${deviceID}`, {
        username,
        password,
      });

      // ✅ Verify response contains session_id
      if (!res.data.session_id || !res.data.device_id) {
        message.error("Session not created - please retry");
        return false;
      }

      const {
        user: userPayload,
        access_token,
        refresh_token,
        session_id,
        device_id,
      } = res.data;

      // ✅ Store server-confirmed device_id (may be different if server generated)
      localStorage.setItem("device_id", device_id);
      localStorage.setItem("session_id", String(session_id));
      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);

      setToken(access_token);
      setUser(userPayload);
      scheduleTokenRefresh(access_token);

      return true;
    } catch (error) {
      const errorMsg = error.response?.data?.message || "خطا در ورود به سیستم";
      message.error(errorMsg);
      return false;
    }
  };

  async function generateDeviceFingerprint() {
    // 1) Collect stable browser info
    const components = [
      navigator.userAgent || "",
      navigator.language || "",
      `${window.screen?.width || 0}x${window.screen?.height || 0}`,
      new Date().getTimezoneOffset(),
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    ];

    // 2) Canvas fingerprint (stable enough)
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillText("secure_fingerprint", 2, 2);
      components.push(canvas.toDataURL());
    } catch {
      components.push("no_canvas");
    }

    // 3) Audio fingerprint (lightweight and stable)
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const analyser = audioCtx.createAnalyser();
      oscillator.connect(analyser);
      oscillator.start(0);

      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);

      oscillator.stop();
      components.push(Array.from(data).slice(0, 32).join(","));
    } catch {
      components.push("no_audio_fp");
    }

    // Combine everything
    const rawFingerprint = components.join("|");

    // 4) Hash everything using SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(rawFingerprint);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    // Convert ArrayBuffer → Hex
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Final fingerprint format
    return "dev_" + hashHex.substring(0, 40);
  }

  const register = async (username, email, password) => {
    try {
      const res = await axios.post("/api/auth/register", {
        username,
        email,
        password,
      });
      const { user: userPayload, access_token, refresh_token } = res.data;

      const deviceID = getOrCreateDeviceID();
      localStorage.setItem("device_id", deviceID);
      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);

      setToken(access_token);
      setUser(userPayload);

      sessionInitializedRef.current = true;

      scheduleTokenRefresh(access_token);

      message.success("ثبت‌نام با موفقیت انجام شد");
      return true;
    } catch (error) {
      const errorMsg = error.response?.data?.message || "خطا در ثبت‌نام";
      message.error(errorMsg);
      return false;
    }
  };

  // ✅ FIXED: Improved logout with proper cleanup
  const logout = useCallback(async (showMessage = true) => {
    isLoggingOutRef.current = true;
    setAxiosLoggingOut(true);

    try {
      const accessToken = localStorage.getItem("access_token");
      const refreshToken = localStorage.getItem("refresh_token");
      const deviceID = localStorage.getItem("device_id");

      // Cancel any pending refresh
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      // ✅ Send BOTH tokens and device_id to server
      try {
        await axios
          .post("/api/logout", null, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "X-Refresh-Token": refreshToken,
              "X-Device-ID": deviceID,
            },
          })
          .catch(() => {});
      } catch {
        // Ignore logout API errors
      }

      // Clear state
      setToken(null);
      setUser(null);
      sessionInitializedRef.current = false;

      // Clear storage
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("session_id");
      // ✅ Keep device_id for future logins
      // localStorage.removeItem("device_id");

      delete axios.defaults.headers.common["Authorization"];

      if (showMessage) {
        message.success("شما با موفقیت از سیستم خارج شدید");
      }
    } finally {
      setTimeout(() => {
        isLoggingOutRef.current = false;
        setAxiosLoggingOut(false);
      }, 1000);
    }
  }, []);

  const updateProfile = async (data) => {
    try {
      const res = await axios.put("/api/profile", data);
      setUser(res.data);
      message.success("پروفایل با موفقیت به‌روزرسانی شد");
      return true;
    } catch (error) {
      const errorMsg =
        error.response?.data?.message || "خطا در به‌روزرسانی پروفایل";
      message.error(errorMsg);
      return false;
    }
  };

  const changePassword = async (oldPassword, newPassword) => {
    try {
      await axios.post("/api/profile/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      message.success("رمز عبور با موفقیت تغییر کرد");
      return true;
    } catch (error) {
      const errorMsg = error.response?.data?.message || "خطا در تغییر رمز عبور";
      message.error(errorMsg);
      return false;
    }
  };

  const isAdmin = () => {
    return user?.role === "admin";
  };

  const authValue = {
    user,
    loading,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    isAdmin,
    deviceID: localStorage.getItem("device_id"),
    sessionInitialized: sessionInitializedRef.current,
    setUser,
    setToken,
    // ✅ NEW: Expose logout flag for components to check
    isLoggingOut: () => isLoggingOutRef.current,
  };

  return (
    <AuthContext.Provider value={authValue}>
      <ConfigProvider direction="rtl">{children}</ConfigProvider>
    </AuthContext.Provider>
  );
};
