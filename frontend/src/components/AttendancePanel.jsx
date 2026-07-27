import { useEffect, useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { ScanLine, Loader2, X, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/context/LanguageContext";

/**
 * USB scanner sign-in flow.
 * Most consumer USB barcode/QR scanners type the scanned text + Enter (HID keyboard mode).
 * This panel keeps a hidden auto-focused input that captures those keystrokes globally.
 */
export default function AttendancePanel() {
  const { t } = useT();
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [popup, setPopup] = useState(null); // { user, attendance, error }
  const [manual, setManual] = useState("");
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  const reload = async () => {
    try {
      const { data } = await api.get("/attendance?days=7&limit=50");
      setRecent(data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  // Keep the hidden input focused so scanners always reach it.
  useEffect(() => {
    const focus = () => {
      // don't steal focus when a modal is open or user clicked into another input
      const ae = document.activeElement;
      if (popup) return;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
      inputRef.current?.focus();
    };
    focus();
    const id = window.setInterval(focus, 600);
    document.addEventListener("click", focus);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("click", focus);
    };
  }, [popup]);

  const submitScan = async (raw) => {
    const code = (raw || "").trim();
    if (!code) return;
    setScanning(true);
    try {
      const { data } = await api.post("/attendance/scan", { code });
      setPopup({ attendance: data });
      // auto-dismiss after 4s
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setPopup(null), 4000);
      reload();
    } catch (e) {
      const msg = formatApiError(e);
      setPopup({ error: msg, code });
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setPopup(null), 3500);
    } finally {
      setScanning(false);
    }
  };

  const onHiddenKeyDown = async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = inputRef.current?.value || "";
      if (inputRef.current) inputRef.current.value = "";
      await submitScan(v);
    }
  };

  const submitManual = async (e) => {
    e.preventDefault();
    if (!manual.trim()) return;
    await submitScan(manual);
    setManual("");
  };

  const removeRow = async (id) => {
    if (!window.confirm("Delete this attendance record?")) return;
    try {
      await api.delete(`/attendance/${id}`);
      toast.success("Removed");
      reload();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6" data-testid="attendance-panel">
      {/* Hidden listener input — captures USB scanner HID input */}
      <input
        ref={inputRef}
        type="text"
        autoFocus
        aria-hidden
        tabIndex={-1}
        onKeyDown={onHiddenKeyDown}
        data-testid="attendance-hidden-input"
        style={{ position: "fixed", top: -100, left: -100, width: 1, height: 1, opacity: 0 }}
      />

      {/* Scanner card */}
      <div className="border border-[var(--dojo-border)] bg-[var(--dojo-card)] p-8">
        <div className="grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <ScanLine className="text-[var(--dojo-green)] scan-pulse" size={22} />
              <span className="text-[10px] uppercase tracking-[0.28em] text-[var(--dojo-ink-soft)]">{t("att.usb_scanner_active")}</span>
            </div>
            <h3 className="font-serif text-3xl tracking-tight mb-2">{t("att.sign_in_members")}</h3>
            <p className="text-sm text-[var(--dojo-ink-soft)] leading-relaxed max-w-lg">
              Aim the USB scanner at the member's QR code or barcode on their ID. The scan will appear here automatically and a profile pop-up will confirm the sign-in.
            </p>
            <form onSubmit={submitManual} className="mt-5 flex gap-3 max-w-md" data-testid="manual-scan-form">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Or type member number (e.g. YK12345678)"
                className="input font-mono-accent"
                data-testid="manual-scan-input"
              />
              <button type="submit" className="btn-primary whitespace-nowrap" disabled={!manual.trim() || scanning} data-testid="manual-scan-btn">
                {scanning ? <Loader2 size={14} className="animate-spin" /> : t("att.scan")}
              </button>
            </form>
          </div>
          <ScannerVisual />
        </div>
      </div>

      {/* Recent log — with search + pagination */}
      <AttendanceLog recent={recent} loading={loading} onDelete={removeRow} t={t} />

      {popup && <ScannedProfileModal data={popup} onClose={() => setPopup(null)} />}
    </div>
  );
}

function AttendanceLog({ recent, loading, onDelete, t }) {
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // Client-side filter — cheap for the ~thousand-record limit the backend
  // returns. Move to the server if the log ever grows past that.
  const filtered = recent.filter((r) => {
    const ql = q.trim().toLowerCase();
    if (ql) {
      const hay = `${r.user_name || ""} ${r.member_number || ""} ${r.belt_rank || ""} ${r.role || ""}`.toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    if (dateFrom) {
      if (new Date(r.scanned_at) < new Date(dateFrom + "T00:00:00")) return false;
    }
    if (dateTo) {
      if (new Date(r.scanned_at) > new Date(dateTo + "T23:59:59")) return false;
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const paged = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  // Reset to page 1 whenever the filter changes so we don't land on an
  // empty page.
  const resetPage = () => setPage(1);

  return (
    <div className="border border-[var(--dojo-border)] bg-[var(--dojo-card)]" data-testid="attendance-log">
      <div className="px-6 py-4 border-b border-[var(--dojo-border)] flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="font-serif text-2xl">{t("att.recent_signins")}</h2>
          <div className="text-xs text-[var(--dojo-ink-soft)]">{filtered.length} / {recent.length}</div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); resetPage(); }}
            placeholder={t("att.search_placeholder")}
            className="input h-9 text-sm"
            data-testid="attendance-search-input"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
            className="input h-9 text-sm"
            data-testid="attendance-date-from"
          />
          <span className="text-xs text-[var(--dojo-ink-soft)]">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
            className="input h-9 text-sm"
            data-testid="attendance-date-to"
          />
          {(q || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setQ(""); setDateFrom(""); setDateTo(""); resetPage(); }}
              className="text-[10px] uppercase tracking-[0.2em] px-2 py-1 border border-[var(--dojo-border)] hover:border-[var(--dojo-ink)]"
              data-testid="attendance-clear-filters"
            >{t("att.clear_filters")}</button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--dojo-paper-alt)] text-[10px] uppercase tracking-[0.2em] text-[var(--dojo-ink-soft)]">
            <tr>
              <th className="text-left px-6 py-3">{t("att.col_time")}</th>
              <th className="text-left px-6 py-3">{t("att.col_member")}</th>
              <th className="text-left px-6 py-3">{t("att.col_member_no")}</th>
              <th className="text-left px-6 py-3">{t("att.col_belt")}</th>
              <th className="text-left px-6 py-3">{t("att.col_method")}</th>
              <th className="text-right px-6 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-[var(--dojo-ink-soft)]"><Loader2 className="inline animate-spin" /></td></tr>
            )}
            {!loading && paged.map((r) => (
              <tr key={r.id} className="border-t border-[var(--dojo-border)]" data-testid={`attendance-row-${r.id}`}>
                <td className="px-6 py-3 text-[var(--dojo-ink-soft)]">{new Date(r.scanned_at).toLocaleString()}</td>
                <td className="px-6 py-3 font-medium">{r.user_name}</td>
                <td className="px-6 py-3 font-mono-accent text-xs">{r.member_number}</td>
                <td className="px-6 py-3 text-[var(--dojo-ink-soft)]">{r.belt_rank || "—"}</td>
                <td className="px-6 py-3">
                  <span className="text-[10px] uppercase tracking-[0.2em] px-2 py-1 border border-[var(--dojo-green)] text-[var(--dojo-green)]">
                    {r.method}
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <button onClick={() => onDelete(r.id)} className="text-[var(--dojo-hinomaru)] hover:text-[var(--dojo-hinomaru-dark)]" title="Delete record" data-testid={`attendance-delete-${r.id}`}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-[var(--dojo-ink-soft)]">{t("att.no_signins")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-[var(--dojo-border)] flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-[var(--dojo-ink-soft)]" data-testid="attendance-pagination">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={clampedPage <= 1}
            className="px-3 py-1.5 border border-[var(--dojo-border)] hover:border-[var(--dojo-ink)] disabled:opacity-40"
            data-testid="attendance-page-prev"
          >← {t("att.prev")}</button>
          <span data-testid="attendance-page-indicator">{clampedPage} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={clampedPage >= totalPages}
            className="px-3 py-1.5 border border-[var(--dojo-border)] hover:border-[var(--dojo-ink)] disabled:opacity-40"
            data-testid="attendance-page-next"
          >{t("att.next")} →</button>
        </div>
      )}
    </div>
  );
}

function ScannerVisual() {
  return (
    <div className="hidden md:flex flex-col items-center gap-3">
      <div className="w-44 h-44 border border-[var(--dojo-border)] bg-[var(--dojo-paper)] flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-x-3 top-0 bottom-0 flex flex-col justify-center gap-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-1.5 bg-[var(--dojo-ink)] opacity-80" style={{ width: `${(i * 47) % 100}%`, marginLeft: `${(i * 11) % 30}%` }} />
          ))}
        </div>
        <div className="absolute inset-x-0 h-px bg-[var(--dojo-hinomaru)] scan-pulse" style={{ top: "50%" }} />
      </div>
      <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--dojo-ink-soft)]">Listening…</div>
    </div>
  );
}

function ScannedProfileModal({ data, onClose }) {
  const isError = !!data.error;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55" onClick={onClose} data-testid="scan-popup">
      <div
        className="bg-[var(--dojo-card)] border border-[var(--dojo-border)] w-full max-w-md fade-up shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex justify-between items-center px-6 py-4 border-b border-[var(--dojo-border)] ${isError ? "bg-[var(--dojo-hinomaru)]/5" : "bg-[var(--dojo-green-soft)]"}`}>
          <div className="flex items-center gap-3">
            {isError ? (
              <AlertCircle className="text-[var(--dojo-hinomaru)]" size={20} />
            ) : (
              <CheckCircle2 className="text-[var(--dojo-green)]" size={20} />
            )}
            <h3 className="font-serif text-2xl tracking-tight">
              {isError ? "Scan Failed" : "Signed In"}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 hover:text-[var(--dojo-hinomaru)]" data-testid="scan-popup-close"><X size={18} /></button>
        </div>
        <div className="p-8">
          {isError ? (
            <div data-testid="scan-popup-error">
              <p className="text-sm text-[var(--dojo-ink)] mb-2">We couldn't find a member for that scan.</p>
              <p className="text-xs text-[var(--dojo-ink-soft)]">Detail: {data.error}</p>
              <p className="text-xs text-[var(--dojo-ink-soft)] mt-2 font-mono-accent">Code: {data.code}</p>
            </div>
          ) : (
            <ProfileBody attendance={data.attendance} />
          )}
        </div>
        {!isError && (
          <div className="px-6 py-3 border-t border-[var(--dojo-border)] text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] text-center">
            Auto-closing in a few seconds — click anywhere to dismiss
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileBody({ attendance }) {
  const initials = (attendance.user_name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="space-y-5" data-testid="scan-popup-profile">
      <div className="flex items-center gap-5">
        <div className="w-20 h-20 flex items-center justify-center bg-[var(--dojo-paper-alt)] border border-[var(--dojo-border)] font-serif text-3xl text-[var(--dojo-ink)]">
          {initials}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--dojo-ink-soft)] mb-1">Member</div>
          <div className="font-serif text-2xl tracking-tight" data-testid="scan-popup-name">{attendance.user_name}</div>
          <div className="text-xs text-[var(--dojo-ink-soft)] capitalize mt-0.5">{attendance.role.replace("_", " ")}</div>
        </div>
      </div>
      <div className="brush-divider" />
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mb-1">Member No.</div>
          <div className="font-mono-accent tracking-widest">{attendance.member_number}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mb-1">Belt</div>
          <div>{attendance.belt_rank || "—"}</div>
        </div>
        <div className="col-span-2">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mb-1">Signed in</div>
          <div className="text-[var(--dojo-ink)]">{new Date(attendance.scanned_at).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
