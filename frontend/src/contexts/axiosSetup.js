// axiosSetup.js
import axios from "axios";
import { message } from "antd";

let __axiosForcedLogout = false;

export function setupAxiosInterceptors(logoutFn) {
  // درخواست‌ها: اگر توکن در localStorage هست، هدر بزن
  const token = localStorage.getItem("access_token");
  if (token) axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

  axios.interceptors.response.use(
    (res) => res,
    (err) => {
      const status = err.response?.status;
      // فقط یکبار forced logout رو هندل کن
      if (status === 401 && !__axiosForcedLogout) {
        __axiosForcedLogout = true;
        message.open({
          key: "session_invalidated",
          content: "جلسه منقضی شده است. لطفا دوباره وارد شوید.",
          duration: 5,
        });

        // پاک‌سازی محلی
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("session_id");
        delete axios.defaults.headers.common["Authorization"];

        // توابع context باید logout رو اجرا کنند
        if (typeof logoutFn === "function") logoutFn();

        setTimeout(() => {
          window.location.href = "/login";
        }, 1200);
      }
      return Promise.reject(err);
    }
  );
}
