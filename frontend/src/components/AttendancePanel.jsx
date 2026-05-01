import { useEffect, useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { ScanLine, Loader2, X, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

/**
 * USB scanner sign-in flow.
 * Most consumer USB barcode/QR scanners type the scanned text + Enter (HID keyboard mode).
 * This panel keeps a hidden auto-focused input that captures those keystrokes globally.
 */
export default function AttendancePanel() {
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
              <span className="text-[10px] uppercase tracking-[0.28em] text-[var(--dojo-ink-soft)]">USB Scanner Active</span>
            </div>
            <h3 className="font-serif text-3xl tracking-tight mb-2">Sign In Members</h3>
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
                {scanning ? <Loader2 size={14} className="animate-spin" /> : "Scan"}
              </button>
            </form>
          </div>
          <ScannerVisual />
        </div>
      </div>

      {/* Recent log */}
      <div className="border border-[var(--dojo-border)] bg-[var(--dojo-card)]">
        <div className="px-6 py-4 border-b border-[var(--dojo-border)] flex justify-between items-center">
          <h2 className="font-serif text-2xl">Recent Sign-Ins</h2>
          <span className="text-xs text-[var(--dojo-ink-soft)]">last 7 days · {recent.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--dojo-paper-alt)] text-[10px] uppercase tracking-[0.2em] text-[var(--dojo-ink-soft)]">
              <tr>
                <th className="text-left px-6 py-3">Time</th>
                <th className="text-left px-6 py-3">Member</th>
                <th className="text-left px-6 py-3">Member No.</th>
                <th className="text-left px-6 py-3">Belt</th>
                <th className="text-left px-6 py-3">Method</th>
                <th className="text-right px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-[var(--dojo-ink-soft)]"><Loader2 className="inline animate-spin" /></td></tr>
              )}
              {!loading && recent.map((r) => (
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
                    <button onClick={() => removeRow(r.id)} className="text-[var(--dojo-hinomaru)] hover:text-[var(--dojo-hinomaru-dark)]" title="Delete record" data-testid={`attendance-delete-${r.id}`}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && recent.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-[var(--dojo-ink-soft)]">No sign-ins yet today. Scan a member's ID to begin.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {popup && <ScannedProfileModal data={popup} onClose={() => setPopup(null)} />}
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
