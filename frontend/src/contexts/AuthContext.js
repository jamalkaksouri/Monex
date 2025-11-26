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
import fa_IR from "antd/lib/locale/fa_IR";

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

  useEffect(() => {
    const handleBeforeUnload = () => {
      // Clear tokens when browser closes
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("device_id");
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Optionally: send session end event to server
        navigator.sendBeacon(
          "/api/sessions/ping",
          JSON.stringify({
            device_id: localStorage.getItem("device_id"),
          })
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // ✅ NEW: Track refresh in progress to prevent race conditions
  const refreshPromiseRef = useRef(null);

  // ✅ NEW: Track token expiry to refresh proactively
  const refreshTimerRef = useRef(null);

  // ✅ NEW: Proactive token refresh function
  const scheduleTokenRefresh = useCallback((accessToken) => {
    try {
      // Decode JWT to get expiry
      const parts = accessToken.split(".");
      if (parts.length !== 3) return;

      const payload = JSON.parse(atob(parts[1]));
      if (!payload.exp) return;

      const expiryMs = payload.exp * 1000;
      const nowMs = Date.now();
      const timeUntilExpiry = expiryMs - nowMs;

      // Refresh when 1 minute remains
      const refreshAt = timeUntilExpiry - 60000;

      if (refreshAt > 0) {
        // Clear old timer
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

  // ✅ NEW: Centralized token refresh logic
  const performTokenRefresh = useCallback(async () => {
    const refreshToken = localStorage.getItem("refresh_token");

    if (!refreshToken) {
      console.warn("[Auth] No refresh token available");
      return false;
    }

    // ✅ FIX: Prevent concurrent refresh requests
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

      // ✅ Schedule next refresh
      scheduleTokenRefresh(access_token);

      console.log("[Auth] Token refreshed successfully");
      return true;
    } catch (error) {
      console.error("[Auth] Token refresh failed:", error);
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      delete axios.defaults.headers.common["Authorization"];
      setToken(null);
      setUser(null);
      return false;
    } finally {
      refreshPromiseRef.current = null;
    }
  }, [scheduleTokenRefresh]);

  // ✅ Initialize auth on mount
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      loadProfile();
      scheduleTokenRefresh(token);
    } else {
      setLoading(false);
    }

    // Cleanup on unmount
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [token, scheduleTokenRefresh]);

  // ✅ Setup axios interceptor for 401 responses
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // ✅ FIX: Handle 401 with automatic token refresh
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !originalRequest.url.includes("/auth/login") &&
          !originalRequest.url.includes("/auth/register")
        ) {
          originalRequest._retry = true;

          const refreshed = await performTokenRefresh();

          if (refreshed) {
            const newToken = localStorage.getItem("access_token");
            axios.defaults.headers.common[
              "Authorization"
            ] = `Bearer ${newToken}`;
            originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
            return axios(originalRequest);
          } else {
            // Refresh failed - logout
            window.location.href = "/login";
          }
        }

        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [performTokenRefresh]);

  const loadProfile = async () => {
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await axios.get("/api/profile");
      setUser(res.data);
    } catch (error) {
      if (error.response?.status === 401) {
        const refreshed = await performTokenRefresh();
        if (refreshed) {
          // Retry profile load
          try {
            const res = await axios.get("/api/profile");
            setUser(res.data);
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

  const login = async (username, password) => {
    try {
      // Generate or retrieve device ID
      let deviceID = localStorage.getItem("device_id");
      if (!deviceID) {
        // Generate unique device ID (UUID v4)
        deviceID = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
          /[xy]/g,
          function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          }
        );
        localStorage.setItem("device_id", deviceID);
      }

      // ✅ FIX #4: Send device_id to backend
      const res = await axios.post(
        "/api/auth/login",
        { username, password },
        { params: { device_id: deviceID } }
      );

      const { user, access_token, refresh_token, session_id, device_id } =
        res.data;

      // Store returned device_id (backend may have generated a new one)
      if (device_id) {
        localStorage.setItem("device_id", device_id);
      }

      // Store session info
      localStorage.setItem("session_id", session_id);
      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);

      setToken(access_token);
      setUser(user);

      scheduleTokenRefresh(access_token);
      message.success("ورود با موفقیت انجام شد");
      return true;
    } catch (error) {
      const errorMsg = error.response?.data?.message || "خطا در ورود به سیستم";
      message.error(errorMsg);
      return false;
    }
  };

  const register = async (username, email, password) => {
    try {
      const res = await axios.post("/api/auth/register", {
        username,
        email,
        password,
      });
      const { user, access_token, refresh_token } = res.data;

      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);

      setToken(access_token);
      setUser(user);

      // ✅ Schedule token refresh after registration
      scheduleTokenRefresh(access_token);

      message.success("ثبت‌نام با موفقیت انجام شد");
      return true;
    } catch (error) {
      const errorMsg = error.response?.data?.message || "خطا در ثبت‌نام";
      message.error(errorMsg);
      return false;
    }
  };

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");

    delete axios.defaults.headers.common["Authorization"];

    setToken(null);
    setUser(null);

    // Clear refresh timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    message.info("با موفقیت از سیستم خارج شدید");
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
  };

  return (
    <AuthContext.Provider value={authValue}>
      <ConfigProvider direction="rtl">{children}</ConfigProvider>
    </AuthContext.Provider>
  );
};
