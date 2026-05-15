import axios from "axios";

// Tolerate operators who accidentally set REACT_APP_BACKEND_URL with a trailing
// slash or with `/api` already appended — both situations cause `/api/api/...`
// 404s in production. Normalise once at module load.
const RAW = (process.env.REACT_APP_BACKEND_URL || "").trim();
const BASE = RAW.replace(/\/+$/, "").replace(/\/api$/i, "");

const api = axios.create({
  baseURL: `${BASE}/api`,
  withCredentials: false,
  headers: { "Content-Type": "application/json" },
  // Render free tier can take 30-60s to cold-start. The total time the client
  // is willing to wait is `timeout × (1 + retries)`; we keep the per-attempt
  // timeout high enough to ride out a single cold start without false negatives.
  timeout: 90000,
});

// Attach bearer token from localStorage if present (fallback for cookie issues)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("yk_token");
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Cold-start resilience ────────────────────────────────────────────────
// Render's free-tier proxy returns 502 / 503 / 504 (or aborts the connection
// entirely) while the worker spins back up after 15 min of inactivity. The
// real backend is fine — we just need to wait it out. Strategy:
//   • 5 retries with exponential backoff capped at 8 s
//   • Treat NETWORK errors + 502 / 503 / 504 / 520-524 as "still waking up"
//   • Only surface the error after every retry has been used
//
// Worst case the user waits ~28 s for the very first login of the day. After
// that the dyno stays warm for ~15 min so subsequent calls are instant.
const RETRY_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524]);
const MAX_RETRIES = 5;

function shouldRetry(error) {
  if (!error) return false;
  if (!error.response) return true; // network / timeout / DNS — likely cold start
  return RETRY_STATUSES.has(error.response.status);
}

function backoffDelay(attempt) {
  // 1.5s, 3s, 5s, 8s, 8s — gives Render ~25s to come up, plus our own timeout.
  return Math.min(8000, 1500 * Math.pow(1.7, attempt));
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const cfg = error?.config;
    if (!cfg) return Promise.reject(error);
    cfg.__yk_attempt = (cfg.__yk_attempt || 0) + 1;
    if (cfg.__yk_attempt > MAX_RETRIES || !shouldRetry(error)) {
      return Promise.reject(error);
    }
    const wait = backoffDelay(cfg.__yk_attempt - 1);
    // eslint-disable-next-line no-console
    console.info(`[api] cold-start retry ${cfg.__yk_attempt}/${MAX_RETRIES} in ${wait}ms`);
    await new Promise((res) => setTimeout(res, wait));
    return api.request(cfg);
  }
);

export function formatApiError(err) {
  const detail = err?.response?.data?.detail;
  if (!detail) {
    if (err?.code === "ECONNABORTED") return "Server is taking too long to wake up. Please try again in a few seconds.";
    if (!err?.response) return "Could not reach the dojo server. It may be waking up — please try again.";
    if (RETRY_STATUSES.has(err?.response?.status)) {
      return "The dojo server is still waking up. Please try again in 30 seconds.";
    }
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
