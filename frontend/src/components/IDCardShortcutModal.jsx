import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { X, Search, IdCard } from "lucide-react";
import { useT } from "@/context/LanguageContext";

/**
 * Modal that lists every user visible to the current admin, with a search
 * box. Picking a user triggers `onPick(user)` — the parent dashboard then
 * opens the User Drawer scrolled to the ID Card tab.
 */
export default function IDCardShortcutModal({ onClose, onPick }) {
  const { t } = useT();
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    api.get("/users").then((r) => { if (live) setUsers(r.data || []); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) =>
      (u.name || "").toLowerCase().includes(s)
      || (u.username || "").toLowerCase().includes(s)
      || (u.email || "").toLowerCase().includes(s)
      || (u.member_number || "").toLowerCase().includes(s),
    );
  }, [users, q]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-6 overflow-y-auto" onClick={onClose} data-testid="idcard-shortcut-modal">
      <div className="bg-[var(--dojo-paper)] border border-[var(--dojo-border)] w-full max-w-2xl my-8 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--dojo-border)]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">ID Card</div>
            <div className="font-serif text-xl flex items-center gap-2"><IdCard size={18} /> {t("shortcut.pick_user")}</div>
          </div>
          <button onClick={onClose} className="p-2 hover:text-[var(--dojo-hinomaru)]" data-testid="idcard-shortcut-close"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 border-b border-[var(--dojo-border)]">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dojo-ink-soft)]" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("shortcut.search_placeholder")}
              className="input pl-9"
              autoFocus
              data-testid="idcard-shortcut-search"
            />
          </div>
        </div>

        <div className="overflow-y-auto divide-y divide-[var(--dojo-border)]" data-testid="idcard-shortcut-list">
          {loading && <div className="px-6 py-6 text-sm text-[var(--dojo-ink-soft)]">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-[var(--dojo-ink-soft)]">{t("shortcut.no_match")}</div>
          )}
          {filtered.map((u) => (
            <button
              key={u.id}
              onClick={() => onPick(u)}
              className="w-full text-left px-6 py-3 flex items-center gap-4 hover:bg-[var(--dojo-paper-deep)]/50 transition-colors"
              data-testid={`idcard-shortcut-pick-${u.id}`}
            >
              {u.photo_url ? (
                <img src={u.photo_url} alt="" className="h-12 w-10 object-cover border border-[var(--dojo-border)] shrink-0" />
              ) : (
                <div className="h-12 w-10 border border-dashed border-[var(--dojo-border)] flex items-center justify-center text-[8px] uppercase tracking-[0.18em] text-[var(--dojo-ink-soft)] shrink-0">No pic</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{u.name}</div>
                <div className="text-[11px] text-[var(--dojo-ink-soft)] font-mono-accent truncate">
                  {u.username || u.email || "—"} · <span className="uppercase tracking-widest">{u.role?.replace("_", " ")}</span> · {u.member_number}
                </div>
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--dojo-green)] shrink-0">{t("btn.edit")}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
