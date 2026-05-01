import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

export default function ThemeToggle({ compact = false }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="theme"
        className="p-2 border border-[var(--dojo-border)] opacity-50"
        data-testid="theme-toggle-loading"
      >
        <Sun size={16} />
      </button>
    );
  }

  const cycle = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  const Icon = theme === "system" ? Monitor : (resolvedTheme === "dark" ? Moon : Sun);

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${theme}`}
      title={`Theme: ${theme} (click to cycle)`}
      data-testid="theme-toggle-btn"
      className={`${compact ? "p-2" : "px-3 py-2"} border border-[var(--dojo-border)] hover:border-[var(--dojo-ink)] transition-colors text-[var(--dojo-ink)]`}
    >
      <Icon size={16} />
    </button>
  );
}
