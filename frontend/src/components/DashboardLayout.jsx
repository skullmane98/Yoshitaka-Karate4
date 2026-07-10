import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LogOut, Home, IdCard } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import LanguageToggle from "@/components/LanguageToggle";
import { useT } from "@/context/LanguageContext";

export default function DashboardLayout({ title, subtitle, nav, onEditIDCards, children }) {
  const { user, logout } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const canEditIDCards = ["admin", "super_admin"].includes(user?.role);

  return (
    <div className="min-h-screen paper-texture flex flex-col">
      <header className="border-b border-[var(--dojo-border)] backdrop-blur-xl" style={{ background: "var(--dojo-nav-bg)" }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="hinomaru-dot" />
            <div>
              <div className="font-serif text-xl leading-none">Yoshitaka <span className="font-kanji text-[var(--dojo-green)]">空手道</span></div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mt-1">{title}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:flex items-center gap-2 text-xs text-[var(--dojo-ink-soft)]">
              <span>{user?.name}</span>
              <span className="text-[var(--dojo-border)]">/</span>
              <span className="uppercase tracking-widest">{user?.role?.replace("_", " ")}</span>
            </span>
            <ThemeToggle compact />
            <LanguageToggle variant="compact" />
            <NotificationBell />
            {canEditIDCards && onEditIDCards && (
              <button
                onClick={onEditIDCards}
                className="hidden md:inline-flex items-center gap-2 px-3 py-2 border border-[var(--dojo-border)] hover:border-[var(--dojo-green)] hover:text-[var(--dojo-green)] transition-colors text-[11px] uppercase tracking-[0.18em]"
                data-testid="dashboard-edit-idcards-btn"
                title={t("dash.edit_idcards_shortcut")}
              >
                <IdCard size={14} /> {t("dash.edit_idcards_shortcut")}
              </button>
            )}
            <button
              onClick={() => navigate("/")}
              className="p-2 border border-[var(--dojo-border)] hover:border-[var(--dojo-green)] hover:text-[var(--dojo-green)] transition-colors"
              data-testid="dashboard-public-btn"
              title="Public site"
            >
              <Home size={16} />
            </button>
            <button
              onClick={async () => { await logout(); navigate("/"); }}
              className="p-2 border border-[var(--dojo-border)] hover:border-[var(--dojo-green)] hover:text-[var(--dojo-green)] transition-colors"
              data-testid="dashboard-logout-btn"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        {nav && (
          <nav className="max-w-[1400px] mx-auto px-6 lg:px-10 flex items-center gap-6 overflow-x-auto">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `text-[11px] uppercase tracking-[0.2em] py-3 border-b-2 transition-colors whitespace-nowrap ${
                    isActive ? "border-[var(--dojo-green)] text-[var(--dojo-ink)]" : "border-transparent text-[var(--dojo-ink-soft)] hover:text-[var(--dojo-ink)]"
                  }`
                }
                data-testid={`dashnav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-10">
          {subtitle && (
            <div className="mb-8">
              <h1 className="font-serif text-4xl md:text-5xl font-medium tracking-tight">{subtitle}</h1>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
