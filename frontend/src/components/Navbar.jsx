import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Menu, X } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/about", label: "Sensei" },
  { to: "/programs", label: "Programs" },
  { to: "/schedule", label: "Schedule" },
  { to: "/news", label: "News" },
  { to: "/contact", label: "Contact" },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const dashHref =
    user?.role === "super_admin" ? "/dashboard/super-admin" :
    user?.role === "admin" ? "/dashboard/admin" :
    user?.role === "student" ? "/dashboard/student" : "/login";

  return (
    <header
      data-testid="site-navbar"
      className="sticky top-0 z-50 border-b border-[#DCD9CF] backdrop-blur-xl"
      style={{ background: "rgba(251, 250, 246, 0.88)" }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group" data-testid="nav-home-link">
          <img src={LOGO_URL} alt="Yoshitaka Karate-Do" className="h-12 w-12 object-contain" />
          <span className="font-serif text-2xl font-medium tracking-tight leading-none hidden sm:inline">
            Yoshitaka
            <span className="font-kanji text-[#1A7A3D] ml-2 text-xl">空手道</span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-10">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-testid={`nav-${n.label.toLowerCase()}-link`}
              className={({ isActive }) =>
                `text-xs uppercase tracking-[0.18em] font-medium transition-colors ${
                  isActive ? "text-[#1A7A3D]" : "text-[#0F0F0F] hover:text-[#1A7A3D]"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-4">
          {user ? (
            <>
              <Link to={dashHref} className="btn-outline" data-testid="nav-dashboard-btn">
                Dashboard
              </Link>
              <button
                onClick={async () => { await logout(); nav("/"); }}
                className="btn-primary"
                data-testid="nav-logout-btn"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-outline" data-testid="nav-login-btn">Login</Link>
              <Link to="/register" className="btn-primary" data-testid="nav-register-btn">Enroll</Link>
            </>
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
        <div className="lg:hidden border-t border-[#DCD9CF] bg-[#FBFAF6]" data-testid="nav-mobile-menu">
          <div className="px-6 py-6 flex flex-col gap-5">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="text-sm uppercase tracking-[0.18em] font-medium"
                data-testid={`nav-m-${n.label.toLowerCase()}`}
              >
                {n.label}
              </NavLink>
            ))}
            <div className="flex gap-3 pt-3">
              {user ? (
                <>
                  <Link to={dashHref} className="btn-outline flex-1 text-center" onClick={() => setOpen(false)}>
                    Dashboard
                  </Link>
                  <button
                    onClick={async () => { await logout(); setOpen(false); nav("/"); }}
                    className="btn-primary flex-1"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-outline flex-1 text-center" onClick={() => setOpen(false)}>Login</Link>
                  <Link to="/register" className="btn-primary flex-1 text-center" onClick={() => setOpen(false)}>Enroll</Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
