import { Link } from "react-router-dom";
import { LOGO_URL } from "@/lib/brand";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-[var(--dojo-border)] bg-[var(--dojo-paper-alt)]" data-testid="site-footer">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 grid md:grid-cols-3 gap-10">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <img src={LOGO_URL} alt="Yoshitaka Karate-Do" className="h-12 w-12 object-contain" />
            <span className="font-serif text-2xl font-medium">Yoshitaka <span className="font-kanji text-[var(--dojo-green)]">空手道</span></span>
          </div>
          <p className="text-sm text-[var(--dojo-ink-soft)] max-w-sm leading-relaxed">
            A traditional Shotokan karate dojo devoted to the quiet discipline of kihon, kata, and kumite.
          </p>
        </div>
        <div>
          <h4 className="font-serif text-lg mb-3">Connect</h4>
          <ul className="space-y-2 text-sm text-[var(--dojo-ink-soft)]">
            <li><Link to="/login" className="ink-underline">Student Login</Link></li>
            <li><Link to="/login" className="ink-underline">Member Login</Link></li>
          </ul>
        </div>
      </div>
      <div className="brush-divider mx-6 lg:mx-10" />
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-6 flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-[var(--dojo-ink-soft)]">
        <span>© {new Date().getFullYear()} Yoshitaka Karate-Do · All rights reserved</span>
        <span className="font-mono-accent">義孝 · 空手道</span>
      </div>
    </footer>
  );
}
