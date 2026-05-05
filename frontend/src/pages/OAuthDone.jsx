import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Loader2 } from "lucide-react";

/**
 * Lands here after a successful Google/Microsoft OAuth for an EXISTING user.
 * Stores the JWT and routes to the right dashboard.
 */
export default function OAuthDone() {
  const [search] = useSearchParams();
  const token = search.get("token");
  const { setUser } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      if (!token) {
        nav("/login?oauth_error=missing_token", { replace: true });
        return;
      }
      localStorage.setItem("yk_token", token);
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
        const dest =
          data.role === "super_admin" ? "/dashboard/super-admin" :
          data.role === "admin" ? "/dashboard/admin" :
          "/dashboard/student";
        nav(dest, { replace: true });
      } catch {
        nav("/login?oauth_error=token_invalid", { replace: true });
      }
    })();
  }, [token, nav, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-[var(--dojo-ink-soft)]">
        <Loader2 className="animate-spin" />
        <span className="font-serif text-xl">Signing you in…</span>
      </div>
    </div>
  );
}
