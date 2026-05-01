import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import PublicLayout from "@/components/PublicLayout";
import api, { formatApiError } from "@/lib/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (password.length < 6) { setErr("Password must be at least 6 characters"); return; }
    if (password !== confirm) { setErr("Passwords do not match"); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token: token.trim(), new_password: password });
      setDone(true);
      setTimeout(() => nav("/login"), 1500);
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <section className="max-w-md mx-auto px-6 py-20" data-testid="reset-page">
        <div className="text-center mb-10">
          <span className="hinomaru-dot inline-block mb-4" />
          <h1 className="font-serif text-5xl tracking-tight">Set New Password</h1>
        </div>

        {done ? (
          <div className="border border-[var(--dojo-border)] bg-[var(--dojo-paper)] p-8 text-center" data-testid="reset-success">
            <div className="font-kanji text-3xl text-[var(--dojo-green)] mb-4">完</div>
            <p className="text-sm text-[var(--dojo-ink)]">Password updated. Redirecting to login…</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 border border-[var(--dojo-border)] bg-[var(--dojo-paper)] p-8">
            <div>
              <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">Reset Token</label>
              <input
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                data-testid="reset-token-input"
                className="input font-mono-accent text-xs"
                placeholder="Paste token from your reset link"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="reset-password-input"
                className="input"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">Confirm Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                data-testid="reset-confirm-input"
                className="input"
              />
            </div>
            {err && <div className="text-[var(--dojo-hinomaru)] text-sm" data-testid="reset-error">{err}</div>}
            <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="reset-submit-btn">
              {loading ? "Saving…" : "Set Password"}
            </button>
            <div className="text-sm text-[var(--dojo-ink-soft)] text-center pt-2">
              <Link to="/login" className="ink-underline text-[var(--dojo-ink)]">Back to Login</Link>
            </div>
          </form>
        )}
      </section>
    </PublicLayout>
  );
}
