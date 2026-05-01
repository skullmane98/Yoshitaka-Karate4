import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import PublicLayout from "@/components/PublicLayout";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const u = await login(email, password);
      const dest =
        u.role === "super_admin" ? "/dashboard/super-admin" :
        u.role === "admin" ? "/dashboard/admin" :
        "/dashboard/student";
      nav(loc.state?.from || dest, { replace: true });
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
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
            <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="login-email-input"
              className="w-full border border-[var(--dojo-border)] bg-[var(--dojo-input-bg)] px-4 py-3 focus:outline-none focus:border-[var(--dojo-ink)] transition-colors"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="login-password-input"
              className="w-full border border-[var(--dojo-border)] bg-[var(--dojo-input-bg)] px-4 py-3 focus:outline-none focus:border-[var(--dojo-ink)] transition-colors"
            />
          </div>
          {err && <div className="text-[var(--dojo-hinomaru)] text-sm" data-testid="login-error">{err}</div>}
          <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="login-submit-btn">
            {loading ? "Entering…" : "Enter Dojo"}
          </button>
          <div className="flex justify-between text-sm text-[var(--dojo-ink-soft)] pt-2">
            <Link to="/forgot-password" className="ink-underline" data-testid="login-forgot-link">Forgot password?</Link>
            <Link to="/register" className="ink-underline">Enroll</Link>
          </div>
        </form>
      </section>
    </PublicLayout>
  );
}
