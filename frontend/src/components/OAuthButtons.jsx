import { useEffect, useState } from "react";
import api from "@/lib/api";

/**
 * Renders "Continue with Google" / "Continue with Microsoft" buttons.
 * Each button is just an anchor that goes to the backend's /api/auth/{provider}/start;
 * the backend handles the redirect to Google/Microsoft and the callback.
 *
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH.
 */
const BACKEND = process.env.REACT_APP_BACKEND_URL;

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="1" y="1" width="7.5" height="7.5" fill="#F25022" />
      <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00" />
      <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF" />
      <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900" />
    </svg>
  );
}

export default function OAuthButtons() {
  const [available, setAvailable] = useState({ google: false, microsoft: false });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get("/auth/oauth/providers")
      .then((r) => setAvailable(r.data || {}))
      .catch(() => setAvailable({ google: false, microsoft: false }))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;
  if (!available.google && !available.microsoft) return null;

  return (
    <div className="space-y-3 pt-2" data-testid="oauth-buttons">
      <div className="text-center text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] relative my-4">
        <span className="bg-[var(--dojo-paper)] px-3 relative z-10">or continue with</span>
        <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--dojo-border)] -z-0" />
      </div>
      {available.google && (
        <a
          href={`${BACKEND}/api/auth/google/start`}
          className="flex items-center justify-center gap-3 w-full border border-[var(--dojo-border)] bg-white text-[var(--dojo-ink)] px-4 py-3 hover:bg-[var(--dojo-input-bg)] transition-colors"
          data-testid="oauth-google-btn"
        >
          <GoogleIcon />
          <span className="text-sm font-medium">Continue with Google</span>
        </a>
      )}
      {available.microsoft && (
        <a
          href={`${BACKEND}/api/auth/microsoft/start`}
          className="flex items-center justify-center gap-3 w-full border border-[var(--dojo-border)] bg-white text-[var(--dojo-ink)] px-4 py-3 hover:bg-[var(--dojo-input-bg)] transition-colors"
          data-testid="oauth-microsoft-btn"
        >
          <MicrosoftIcon />
          <span className="text-sm font-medium">Continue with Microsoft</span>
        </a>
      )}
    </div>
  );
}
