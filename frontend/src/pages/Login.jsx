import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import PublicLayout from "@/components/PublicLayout";
import { useAuth } from "@/context/AuthContext";
import { formatApiError, warmBackend } from "@/lib/api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [waking, setWaking] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [search] = useSearchParams();

  // Wake the (possibly sleeping) Render backend the moment the login page opens
  // so the actual submit doesn't pay the cold-start tax.
  useEffect(() => { warmBackend(); }, []);

  useEffect(() => {
    const oauthErr = search.get("oauth_error");
    if (oauthErr) {
      const map = {
        state_mismatch: "Sign-in session was invalid. Please try again.",
        token_exchange_failed: "Provider did not accept the sign-in. Please try again.",
        no_email: "Sign-in provider did not return an email address.",
        account_disabled: "This account has been disabled.",
        missing_token: "Sign-in completed but no token was received.",
        token_invalid: "Sign-in token was invalid. Please try again.",
      };
      setErr(map[oauthErr] || `Sign-in failed (${oauthErr}).`);
    }
  }, [search]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    // If the request is slow (cold-start), surface a friendly message.
    const wakeTimer = setTimeout(() => setWaking(true), 4000);
    try {
      const u = await login(username, password);
      const dest =
        u.role === "super_admin" ? "/dashboard/super-admin" :
        u.role === "student" ? "/dashboard/student" :
        "/dashboard/admin";
      nav(loc.state?.from || dest, { replace: true });
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      clearTimeout(wakeTimer);
      setWaking(false);
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <section className="max-w-md mx-auto px-6 py-20" data-testid="login-page">
        <div className="text-center mb-10">
          <span className="hinomaru-dot inline-block mb-4" />
          <h1 className="font-serif text-5xl tracking-tight">Login</h1>
          <p className="text-[var(--dojo-ink-soft)] mt-2 text-sm">Enter the dojo.</p>
        </div>
        <form onSubmit={submit} className="space-y-5 border border-[var(--dojo-border)] bg-[var(--dojo-paper)] p-8">
          <div>
            <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">Username or Email</label>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              data-testid="login-email-input"
              placeholder="e.g. johnsmith or john@example.com"
              className="w-full border border-[var(--dojo-border)] bg-[var(--dojo-input-bg)] px-4 py-3 focus:outline-none focus:border-[var(--dojo-ink)] transition-colors"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="login-password-input"
              className="w-full border border-[var(--dojo-border)] bg-[var(--dojo-input-bg)] px-4 py-3 focus:outline-none focus:border-[var(--dojo-ink)] transition-colors"
            />
          </div>
          {err && <div className="text-[var(--dojo-hinomaru)] text-sm" data-testid="login-error">{err}</div>}
          {waking && !err && (
            <div className="text-[var(--dojo-ink-soft)] text-xs flex items-center gap-2" data-testid="login-waking">
              <span className="inline-block w-3 h-3 border-2 border-[var(--dojo-green)] border-t-transparent rounded-full animate-spin" />
              Waking the dojo… first sign-in of the day can take ~30 seconds.
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="login-submit-btn">
            {loading ? "Entering…" : "Enter Dojo"}
          </button>
          <div className="text-center text-sm text-[var(--dojo-ink-soft)] pt-2">
            <Link to="/forgot-password" className="ink-underline" data-testid="login-forgot-link">Forgot password?</Link>
          </div>
        </form>
      </section>
    </PublicLayout>
  );
}
