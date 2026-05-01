import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PublicLayout from "@/components/PublicLayout";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";

export default function Register() {
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", access_code: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const nav = useNavigate();

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const u = await register({ ...form, access_code: form.access_code.toUpperCase().trim() });
      const dest =
        u.role === "super_admin" ? "/dashboard/super-admin" :
        u.role === "admin" ? "/dashboard/admin" :
        "/dashboard/student";
      nav(dest, { replace: true });
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout>
      <section className="max-w-lg mx-auto px-6 py-20" data-testid="register-page">
        <div className="text-center mb-10">
          <span className="hinomaru-dot inline-block mb-4" />
          <h1 className="font-serif text-5xl tracking-tight">Enroll</h1>
          <p className="text-[#4A4A4A] mt-2 text-sm">
            Complete registration with the access code issued by your dojo.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-5 border border-[#DCD9CF] bg-[#FBFAF6] p-8">
          <div>
            <label className="text-[10px] uppercase tracking-[0.24em] text-[#4A4A4A] block mb-2">Access Code</label>
            <input
              required
              value={form.access_code}
              onChange={set("access_code")}
              placeholder="XXXX-XXXX"
              data-testid="register-code-input"
              className="w-full border border-[#D7263D] bg-white px-4 py-3 font-mono-accent tracking-widest uppercase focus:outline-none"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="text-[10px] uppercase tracking-[0.24em] text-[#4A4A4A] block mb-2">Name</label>
              <input required value={form.name} onChange={set("name")} data-testid="register-name-input"
                className="w-full border border-[#DCD9CF] bg-white px-4 py-3 focus:outline-none focus:border-[#0F0F0F]" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.24em] text-[#4A4A4A] block mb-2">Phone</label>
              <input value={form.phone} onChange={set("phone")} data-testid="register-phone-input"
                className="w-full border border-[#DCD9CF] bg-white px-4 py-3 focus:outline-none focus:border-[#0F0F0F]" />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.24em] text-[#4A4A4A] block mb-2">Email</label>
            <input type="email" required value={form.email} onChange={set("email")} data-testid="register-email-input"
              className="w-full border border-[#DCD9CF] bg-white px-4 py-3 focus:outline-none focus:border-[#0F0F0F]" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.24em] text-[#4A4A4A] block mb-2">Password</label>
            <input type="password" minLength={6} required value={form.password} onChange={set("password")} data-testid="register-password-input"
              className="w-full border border-[#DCD9CF] bg-white px-4 py-3 focus:outline-none focus:border-[#0F0F0F]" />
          </div>
          {err && <div className="text-[#D7263D] text-sm" data-testid="register-error">{err}</div>}
          <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="register-submit-btn">
            {loading ? "Enrolling…" : "Begin Practice"}
          </button>
          <div className="text-sm text-[#4A4A4A] text-center pt-2">
            Already enrolled? <Link to="/login" className="ink-underline text-[#0F0F0F]">Login</Link>
          </div>
        </form>
      </section>
    </PublicLayout>
  );
}
