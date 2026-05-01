import { useState } from "react";
import { Link } from "react-router-dom";
import PublicLayout from "@/components/PublicLayout";
import api, { formatApiError } from "@/lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <section className="max-w-md mx-auto px-6 py-20" data-testid="forgot-page">
        <div className="text-center mb-10">
          <span className="hinomaru-dot inline-block mb-4" />
          <h1 className="font-serif text-5xl tracking-tight">Reset Password</h1>
          <p className="text-[#4A4A4A] mt-2 text-sm">We will issue a reset link.</p>
        </div>

        {sent ? (
          <div className="border border-[#DCD9CF] bg-[#FBFAF6] p-8 text-center" data-testid="forgot-success">
            <div className="font-kanji text-3xl text-[#1A7A3D] mb-4">押忍</div>
            <p className="text-sm text-[#0F0F0F] mb-2">If that email is registered, a reset link has been issued.</p>
            <p className="text-xs text-[#4A4A4A]">
              Email delivery is not yet configured — your dojo administrator will share the reset link with you, or check the backend console.
            </p>
            <Link to="/login" className="btn-outline inline-block mt-6">Back to Login</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 border border-[#DCD9CF] bg-[#FBFAF6] p-8">
            <div>
              <label className="text-[10px] uppercase tracking-[0.24em] text-[#4A4A4A] block mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="forgot-email-input"
                className="input"
              />
            </div>
            {err && <div className="text-[#D7263D] text-sm" data-testid="forgot-error">{err}</div>}
            <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="forgot-submit-btn">
              {loading ? "Issuing…" : "Issue Reset Link"}
            </button>
            <div className="text-sm text-[#4A4A4A] text-center pt-2">
              Remember it? <Link to="/login" className="ink-underline text-[#0F0F0F]">Login</Link>
            </div>
          </form>
        )}
      </section>
    </PublicLayout>
  );
}
