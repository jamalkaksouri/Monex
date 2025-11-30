// frontend/src/axiosSetup.js
import axios from "axios";
import { message } from "antd";

let __axiosForcedLogout = false;
let networkErrorShown = false;

export function setupAxiosInterceptors(logoutFn) {
  const token = localStorage.getItem("access_token");
  if (token) axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

  axios.interceptors.response.use(
    res => res,
    err => {
      // 🔥 Detect network/server unreachable
      if (!err.response && !networkErrorShown) {
        networkErrorShown = true;
        message.error(
          "ارتباط با سرور برقرار نیست. لطفاً اتصال شبکه خود را بررسی کنید."
        );

        setTimeout(() => {
          networkErrorShown = false;
        }, 5000);
        return Promise.reject(err);
      }

      const status = err.response?.status;

      if (status === 401 && !__axiosForcedLogout) {
        __axiosForcedLogout = true;

        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("session_id");
        delete axios.defaults.headers.common["Authorization"];

        if (typeof logoutFn === "function") logoutFn();
      }

      return Promise.reject(err);
    }
  );
}
