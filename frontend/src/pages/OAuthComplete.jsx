import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import PublicLayout from "@/components/PublicLayout";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/**
 * Lands here after Google/Microsoft OAuth for a NEW user. We require an
 * access code before creating their account.
 */
export default function OAuthComplete() {
  const [search] = useSearchParams();
  const pending = search.get("pending");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!pending) {
      setErr("Missing sign-in token. Please start over from the login page.");
    }
  }, [pending]);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/oauth/complete", {
        pending,
        access_code: code,
      });
      if (data.token) localStorage.setItem("yk_token", data.token);
      setUser(data);
      const dest =
        data.role === "super_admin" ? "/dashboard/super-admin" :
        data.role === "admin" ? "/dashboard/admin" :
        "/dashboard/student";
      nav(dest, { replace: true });
    } catch (e2) {
      setErr(formatApiError(e2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <section className="max-w-md mx-auto px-6 py-20" data-testid="oauth-complete-page">
        <div className="text-center mb-10">
          <span className="hinomaru-dot inline-block mb-4" />
          <h1 className="font-serif text-4xl tracking-tight">Almost there</h1>
          <p className="text-[var(--dojo-ink-soft)] mt-2 text-sm">
            Enter your dojo access code to finish enrolling.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-5 border border-[var(--dojo-border)] bg-[var(--dojo-paper)] p-8">
          <div>
            <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">Access Code</label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              data-testid="oauth-access-code-input"
              placeholder="XXXX-XXXX"
              className="w-full border border-[var(--dojo-border)] bg-[var(--dojo-input-bg)] px-4 py-3 font-mono tracking-widest focus:outline-none focus:border-[var(--dojo-ink)] transition-colors"
            />
          </div>
          {err && <div className="text-[var(--dojo-hinomaru)] text-sm" data-testid="oauth-complete-error">{err}</div>}
          <button type="submit" className="btn-primary w-full" disabled={loading || !pending} data-testid="oauth-complete-submit">
            {loading ? "Enrolling…" : "Complete Enrollment"}
          </button>
          <div className="text-sm text-[var(--dojo-ink-soft)] pt-2 text-center">
            <Link to="/login" className="ink-underline">Back to login</Link>
          </div>
        </form>
      </section>
    </PublicLayout>
  );
}
