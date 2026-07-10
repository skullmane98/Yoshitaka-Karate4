import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { TRANSLATIONS } from "@/lib/i18n";

/**
 * Global language context. `lang` is persisted to localStorage under
 * `yk_lang`, defaulting to browser locale (Spanish for `es*`) then English.
 *
 *   const { t, lang, setLang } = useT();
 *   <h1>{t("home.eyebrow")}</h1>
 */
const LanguageContext = createContext({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
});

const STORAGE_KEY = "yk_lang";

function detectDefault() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch { /* ignore */ }
  try {
    const nav = (navigator.language || "en").toLowerCase();
    if (nav.startsWith("es")) return "es";
  } catch { /* ignore */ }
  return "en";
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(detectDefault);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    // Set <html lang="…"> so browser/SEO tools & password-manager heuristics
    // recognise the switch.
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next) => {
    if (next === "en" || next === "es") setLangState(next);
  }, []);

  const t = useCallback((key) => {
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    return dict[key] ?? TRANSLATIONS.en[key] ?? key;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  return useContext(LanguageContext);
}
