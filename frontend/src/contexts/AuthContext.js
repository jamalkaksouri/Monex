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

  const refreshPromiseRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const sessionInitializedRef = useRef(false); // ✅ NEW: Track if session is initialized

  // ✅ PERSISTENT DEVICE ID
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

  // ✅ TOKEN REFRESH SCHEDULER
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

  // ✅ TOKEN REFRESH LOGIC
  const performTokenRefresh = useCallback(async () => {
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

  // ✅ LOAD PROFILE (with session initialization tracking)
  const loadProfile = async () => {
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await axios.get("/api/profile");
      setUser(res.data);

      // ✅ MARK SESSION AS INITIALIZED AFTER PROFILE LOADS
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

  // ✅ AXIOS INTERCEPTOR (improved error handling)
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Don't treat validation errors as auth errors
        if (error.response?.status === 400 || error.response?.status === 422) {
          return Promise.reject(error);
        }

        // Skip refresh for auth endpoints and delete-all
        if (
          error.response?.status === 401 &&
          (originalRequest.url.includes("/login") ||
            originalRequest.url.includes("/register") ||
            originalRequest.url.includes("/delete-all"))
        ) {
          return Promise.reject(error);
        }

        // Handle 401 Unauthorized - try to refresh token
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

  // ✅ LOGIN (with proper session initialization)
  const login = async (username, password) => {
    try {
      const deviceID = getOrCreateDeviceID();

      console.log("[Auth] Logging in with device_id:", deviceID);

      const res = await axios.post(`/api/auth/login?device_id=${deviceID}`, {
        username,
        password,
      });

      const { user, access_token, refresh_token, session_id, device_id } =
        res.data;

      console.log("[Auth] Login response:", { session_id, device_id });

      // ✅ STORE SESSION DATA IMMEDIATELY
      if (device_id) {
        localStorage.setItem("device_id", device_id);
      }
      if (session_id) {
        localStorage.setItem("session_id", session_id);
        console.log("[Auth] Session ID saved:", session_id);
      } else {
        console.warn("[Auth] No session_id received from server");
      }

      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);

      setToken(access_token);
      setUser(user);

      // ✅ MARK SESSION AS INITIALIZED
      sessionInitializedRef.current = true;
      console.log("[Auth] Login successful - session initialized");

      scheduleTokenRefresh(access_token);
      message.success("ورود با موفقیت انجام شد");
      return true;
    } catch (error) {
      const errorMsg = error.response?.data?.message || "خطا در ورود به سیستم";
      message.error(errorMsg);
      return false;
    }
  };

  // ✅ REGISTER
  const register = async (username, email, password) => {
    try {
      const res = await axios.post("/api/auth/register", {
        username,
        email,
        password,
      });
      const { user, access_token, refresh_token } = res.data;

      const deviceID = getOrCreateDeviceID();
      localStorage.setItem("device_id", deviceID);
      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);

      setToken(access_token);
      setUser(user);

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

  // ✅ LOGOUT (improved)
  const logout = useCallback(async () => {
    try {
      await axios.post("/api/logout").catch(() => {});
    } catch {
      // Silently fail
    } finally {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("session_id");

      delete axios.defaults.headers.common["Authorization"];

      setToken(null);
      setUser(null);
      sessionInitializedRef.current = false;

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      message.info("با موفقیت از سیستم خارج شدید");
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
    sessionInitialized: sessionInitializedRef.current, // ✅ NEW: Expose session state
  };

  return (
    <AuthContext.Provider value={authValue}>
      <ConfigProvider direction="rtl">{children}</ConfigProvider>
    </AuthContext.Provider>
  );
};
