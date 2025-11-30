import axios from "axios";
import { message } from "antd";
import { EventEmitter } from "events";

export const NetworkEvents = new EventEmitter();

let __axiosForcedLogout = false;
let __networkErrorShown = false;

export function setupAxiosInterceptors(logoutFn) {
  const token = localStorage.getItem("access_token");
  if (token) {
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  }

  axios.interceptors.response.use(
    (res) => {
      if (__networkErrorShown) {
        NetworkEvents.emit("online");
        __networkErrorShown = false;
      }
      return res;
    },

    (err) => {
      // -------------------------------------------------------
      // 🔥 Detect server unreachable / network disconnected
      // -------------------------------------------------------
      if (!err.response) {
        if (!__networkErrorShown) {
          __networkErrorShown = true;
          message.error(
            "اتصال به سرور برقرار نیست. لطفاً وضعیت اینترنت یا سیستم شبکه خود را بررسی کنید."
          );
          NetworkEvents.emit("offline");
        }
        return Promise.reject(err);
      }
      // -------------------------------------------------------

      const status = err.response?.status;

      // -------------------------------------------------------
      // 🔐 Force logout on 401
      // -------------------------------------------------------
      if (status === 401 && !__axiosForcedLogout) {
        __axiosForcedLogout = true;

        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("session_id");
        delete axios.defaults.headers.common["Authorization"];

        if (typeof logoutFn === "function") logoutFn();
      }
      // -------------------------------------------------------

      return Promise.reject(err);
    }
  );
}
