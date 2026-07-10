import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useT } from "@/context/LanguageContext";
import { Menu, X } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import LanguageToggle from "@/components/LanguageToggle";

// Build the nav from translation keys so switching language swaps labels.
const NAV_ITEMS = [
  { to: "/", key: "nav.home" },
  { to: "/about", key: "nav.about" },
  { to: "/programs", key: "nav.programs" },
  { to: "/schedule", key: "nav.schedule" },
  { to: "/blog", key: "nav.blog" },
  { to: "/news", key: "nav.news" },
  { to: "/contact", key: "nav.contact" },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  // On the public homepage, hide all navbar elements except the logo so the
  // hero acts as a clean landing page that redirects to the external dojo site.
  const isHome = loc.pathname === "/";

  const dashHref =
    user?.role === "super_admin" ? "/dashboard/super-admin" :
    user?.role === "student" ? "/dashboard/student" :
    user ? "/dashboard/admin" : "/login";

  return (
    <header
      data-testid="site-navbar"
      className="sticky top-0 z-50 border-b border-[var(--dojo-border)] backdrop-blur-xl"
      style={{ background: "var(--dojo-nav-bg)" }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group" data-testid="nav-home-link">
          <img src={LOGO_URL} alt="Yoshitaka Karate-Do" className="h-12 w-12 object-contain" />
          <span className="font-serif text-2xl font-medium tracking-tight leading-none hidden sm:inline">
            Yoshitaka
            <span className="font-kanji text-[var(--dojo-green)] ml-2 text-xl">空手道</span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-10">
          {!isHome && NAV_ITEMS.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-testid={`nav-${n.key.split(".").pop()}-link`}
              className={({ isActive }) =>
                `text-xs uppercase tracking-[0.18em] font-medium transition-colors ${
                  isActive ? "text-[var(--dojo-green)]" : "text-[var(--dojo-ink)] hover:text-[var(--dojo-green)]"
                }`
              }
            >
              {t(n.key)}
            </NavLink>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          {!isHome && <LanguageToggle variant="compact" />}
          {!isHome && <ThemeToggle compact />}
          {user && <NotificationBell />}
          {user ? (
            <>
              <Link to={dashHref} className="btn-outline" data-testid="nav-dashboard-btn">
                {t("nav.dashboard")}
              </Link>
              <button
                onClick={async () => { await logout(); nav("/"); }}
                className="btn-primary"
                data-testid="nav-logout-btn"
              >
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <Link to="/login" className="btn-primary" data-testid="nav-login-btn">{t("nav.login")}</Link>
          )}
        </div>

        <button
          className="lg:hidden p-2"
          onClick={() => setOpen((o) => !o)}
          data-testid="nav-mobile-toggle"
          aria-label="toggle menu"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-[var(--dojo-border)] bg-[var(--dojo-paper)]" data-testid="nav-mobile-menu">
          <div className="px-6 py-6 flex flex-col gap-5">
            {!isHome && NAV_ITEMS.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="text-sm uppercase tracking-[0.18em] font-medium"
                data-testid={`nav-m-${n.key.split(".").pop()}`}
              >
                {t(n.key)}
              </NavLink>
            ))}
            <div className="pt-2"><LanguageToggle /></div>
            <div className="flex gap-3 pt-3">
              {user ? (
                <>
                  <Link to={dashHref} className="btn-outline flex-1 text-center" onClick={() => setOpen(false)}>
                    {t("nav.dashboard")}
                  </Link>
                  <button
                    onClick={async () => { await logout(); setOpen(false); nav("/"); }}
                    className="btn-primary flex-1"
                  >
                    {t("nav.logout")}
                  </button>
                </>
              ) : (
                <Link to="/login" className="btn-primary flex-1 text-center" onClick={() => setOpen(false)}>{t("nav.login")}</Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
