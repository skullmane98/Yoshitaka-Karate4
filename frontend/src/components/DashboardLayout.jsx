import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LogOut, Home } from "lucide-react";

export default function DashboardLayout({ title, subtitle, nav, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen paper-texture flex flex-col">
      <header className="border-b border-[#DCD9CF]" style={{ background: "rgba(247, 245, 240, 0.9)" }}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="hinomaru-dot" />
            <div>
              <div className="font-serif text-xl leading-none">Yoshitaka <span className="font-kanji text-[#1A7A3D]">空手道</span></div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[#4A4A4A] mt-1">{title}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:flex items-center gap-2 text-xs text-[#4A4A4A]">
              <span>{user?.name}</span>
              <span className="text-[#DCD9CF]">/</span>
              <span className="uppercase tracking-widest">{user?.role?.replace("_", " ")}</span>
            </span>
            <button
              onClick={() => navigate("/")}
              className="p-2 border border-[#DCD9CF] hover:border-[#0F0F0F] transition-colors"
              data-testid="dashboard-public-btn"
              title="Public site"
            >
              <Home size={16} />
            </button>
            <button
              onClick={async () => { await logout(); navigate("/"); }}
              className="p-2 border border-[#DCD9CF] hover:border-[#1A7A3D] hover:text-[#1A7A3D] transition-colors"
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
                    isActive ? "border-[#1A7A3D] text-[#0F0F0F]" : "border-transparent text-[#4A4A4A] hover:text-[#0F0F0F]"
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
