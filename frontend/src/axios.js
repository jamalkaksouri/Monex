import axios from "axios";

axios.defaults.baseURL = "http://localhost:3040";

let refreshPromise = null;

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // ✅ FIX #1: Don't treat validation errors as auth errors
    // 400/422 errors should be returned to caller, not treated as token issues
    if (error.response?.status === 400 || error.response?.status === 422) {
      // Return rejection so component can handle it
      return Promise.reject(error);
    }

    // ✅ FIX #2: Skip refresh for auth endpoints and delete-all
    if (
      error.response?.status === 401 &&
      (originalRequest.url.includes("/login") ||
        originalRequest.url.includes("/register") ||
        originalRequest.url.includes("/delete-all"))
    ) {
      return Promise.reject(error);
    }

    // ✅ FIX #3: Handle 401 Unauthorized - try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem("refresh_token");

        if (!refreshToken) {
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
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default axios;
