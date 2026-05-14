import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;

const api = axios.create({
  baseURL: `${BASE}/api`,
  withCredentials: false,
  headers: { "Content-Type": "application/json" },
  // Render free tier can take 20-50s to cold-start. Give every call enough
  // headroom so users don't see a misleading 502 / network error.
  timeout: 75000,
});

// Attach bearer token from localStorage if present (fallback for cookie issues)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("yk_token");
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Cold-start resilience: automatically retry once on 502 / 503 / 504 / network
// errors. Render returns 502 from its proxy while spinning the worker back up.
const RETRY_STATUSES = new Set([502, 503, 504]);
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const cfg = error?.config;
    if (!cfg || cfg.__yk_retried) return Promise.reject(error);
    const status = error?.response?.status;
    const isNetworkError = !error.response;
    if (isNetworkError || RETRY_STATUSES.has(status)) {
      cfg.__yk_retried = true;
      // Wait a moment for the server to finish warming up before re-trying.
      await new Promise((res) => setTimeout(res, 2500));
      return api.request(cfg);
    }
    return Promise.reject(error);
  }
);

export function formatApiError(err) {
  const detail = err?.response?.data?.detail;
  if (!detail) {
    if (err?.code === "ECONNABORTED") return "Server is taking too long to wake up. Please try again in a few seconds.";
    if (!err?.response) return "Could not reach the dojo server. It may be waking up — please try again.";
    return err?.message || "Something went wrong";
  }
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  }
  if (detail?.msg) return detail.msg;
  return String(detail);
}

// Fire-and-forget ping to wake a sleeping backend (Render free tier).
// Safe to call multiple times — it's just a GET to /api/health.
export function warmBackend() {
  fetch(`${BASE}/api/health`, { method: "GET", cache: "no-store" }).catch(() => {});
}

export default api;
