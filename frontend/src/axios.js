// In frontend/src/axios.js - REPLACE entire file

import axios from "axios";

// If you don't use CRA proxy, uncomment this line:
axios.defaults.baseURL = "http://localhost:3040";

// Track refresh token request to avoid infinite loops
let refreshPromise = null;

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      (originalRequest.url.includes("/login") ||
        originalRequest.url.includes("/register") ||
        originalRequest.url.includes("/delete-all"))
    ) {
      return Promise.reject(error);
    }

    // ✅ FIX #1: Don't treat validation errors as auth errors
    // These are client errors, not authentication failures
    if (error.response?.status === 400 ||
      error.response?.status === 422) {
      // These are client validation errors - don't retry
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

        // ✅ FIX #2: Prevent concurrent refresh requests
        if (!refreshPromise) {
          refreshPromise = axios
            .post("/api/auth/refresh", { refresh_token: refreshToken })
            .finally(() => {
              refreshPromise = null;
            });
        }

        // Wait for refresh response
        const response = await refreshPromise;
        const { access_token, refresh_token } = response.data;

        // Update stored tokens
        localStorage.setItem("access_token", access_token);
        localStorage.setItem("refresh_token", refresh_token);

        // Update default header for future requests
        axios.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
        originalRequest.headers["Authorization"] = `Bearer ${access_token}`;

        // Retry original request with new token
        return axios(originalRequest);
      } catch (refreshError) {
        // ✅ FIX #3: Only logout on real auth failure
        // Don't logout on validation errors
        if (error.response?.status === 401 && !originalRequest._retry) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
export default axios;