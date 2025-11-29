import axios from "axios";

axios.defaults.baseURL = "http://localhost:3040";

let refreshPromise = null;
let isLoggingOut = false; // ✅ NEW: Track logout state

// ✅ NEW: Export function to set logout state
export const setAxiosLoggingOut = (state) => {
  isLoggingOut = state;
  console.log("[Axios] Logging out state:", state);
};

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    // ✅ CRITICAL: Skip all error handling if logging out
    if (isLoggingOut) {
      console.log("[Axios] Skipping error handler - logout in progress");
      return Promise.reject(error);
    }

    const originalRequest = error.config;

    // ✅ FIX #1: Don't treat validation errors as auth errors
    // 400/422 errors should be returned to caller, not treated as token issues
    if (error.response?.status === 400 || error.response?.status === 422) {
      return Promise.reject(error);
    }

    // ✅ FIX #2: Skip refresh for auth endpoints and delete-all
    if (
      error.response?.status === 401 &&
      (originalRequest.url.includes("/login") ||
        originalRequest.url.includes("/register") ||
        originalRequest.url.includes("/delete-all") ||
        originalRequest.url.includes("/logout")) // ✅ NEW: Skip logout endpoint
    ) {
      return Promise.reject(error);
    }

    // ✅ FIX #3: Handle 401 Unauthorized - try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem("refresh_token");

        if (!refreshToken) {
          console.log("[Axios] No refresh token - redirecting to login");
          return Promise.reject(error);
        }

        // Prevent concurrent refresh requests
        if (!refreshPromise) {
          refreshPromise = axios
            .post("/api/auth/refresh", { refresh_token: refreshToken })
            .finally(() => {
              refreshPromise = null;
            });
        }

        const response = await refreshPromise;
        const { access_token, refresh_token } = response.data;

        localStorage.setItem("access_token", access_token);
        localStorage.setItem("refresh_token", refresh_token);

        axios.defaults.headers.common[
          "Authorization"
        ] = `Bearer ${access_token}`;
        originalRequest.headers["Authorization"] = `Bearer ${access_token}`;

        return axios(originalRequest);
      } catch (refreshError) {
        console.log("[Axios] Token refresh failed - cleaning up");

        // ✅ Only redirect if NOT logging out
        if (!isLoggingOut) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("session_id");
          delete axios.defaults.headers.common["Authorization"];
          window.location.href = "/login";
        }

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default axios;
