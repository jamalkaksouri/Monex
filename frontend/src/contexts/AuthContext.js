import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
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
    if (token) {
      // Ensure header is set BEFORE making any requests
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      loadProfile();
    } else {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          logout(true);
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  useEffect(() => {
    if (token) {
      loadProfile();
    } else {
      setLoading(false);
    }
  }, []);

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
        const refreshToken = localStorage.getItem("refresh_token");
        if (refreshToken) {
          try {
            const res = await axios.post("/api/auth/refresh", {
              refresh_token: refreshToken,
            });
            localStorage.setItem("access_token", res.data.access_token);
            axios.defaults.headers.common["Authorization"] =
              `Bearer ${res.data.access_token}`;
            // Retry profile load
            const profileRes = await axios.get("/api/profile");
            setUser(profileRes.data);
          } catch (refreshErr) {
            console.error("Refresh failed:", refreshErr);
            logout(true);
          }
        } else {
          logout(true);
        }
      } else {
        // ✅ Log but don't fail silently
        console.error("Profile load error:", error);
        // Don't logout on network errors - could be transient
        if (error.response?.status >= 500) {
          message.error("Server error - please refresh");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const res = await axios.post("/api/auth/login", { username, password });
      const { user, access_token, refresh_token } = res.data;

      // ✅ Store both tokens
      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);

      setToken(access_token);
      setUser(user);

      // ✅ Set default Authorization header
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

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

      message.success("ثبت‌نام با موفقیت انجام شد");
      return true;
    } catch (error) {
      const errorMsg = error.response?.data?.message || "خطا در ثبت‌نام";
      message.error(errorMsg);
      return false;
    }
  };

  const logout = useCallback((silent = false) => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");

    // ✅ Remove authorization header
    delete axios.defaults.headers.common['Authorization'];

    setToken(null);
    setUser(null);

    if (!silent) {
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
  };

  return (
    <AuthContext.Provider value={authValue}>
      <ConfigProvider direction="rtl">{children}</ConfigProvider>
    </AuthContext.Provider>
  );
};
