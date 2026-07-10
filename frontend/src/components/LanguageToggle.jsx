import { useT } from "@/context/LanguageContext";
import { Languages } from "lucide-react";

/**
 * Compact EN/ES language switcher. Sits in public + dashboard headers.
 * Persists to localStorage via LanguageContext.
 */
export default function LanguageToggle({ variant = "default" }) {
  const { lang, setLang, t } = useT();
  const isEs = lang === "es";
  return (
    <button
      type="button"
      onClick={() => setLang(isEs ? "en" : "es")}
      className={`inline-flex items-center gap-2 border border-[var(--dojo-border)] hover:border-[var(--dojo-green)] hover:text-[var(--dojo-green)] transition-colors ${
        variant === "compact" ? "p-2 text-xs" : "px-3 py-2 text-[11px] uppercase tracking-[0.18em]"
      }`}
      title={t("lang.toggle_hint")}
      data-testid="language-toggle"
    >
      <Languages size={14} />
      <span className="font-mono-accent">{isEs ? "ES" : "EN"}</span>
    </button>
  );
}
