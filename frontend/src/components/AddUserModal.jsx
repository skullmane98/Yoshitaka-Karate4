import { useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { X, UserPlus } from "lucide-react";
import { BELT_NAMES } from "@/lib/belts";

/**
 * Manual user-create modal. Replaces access-code registration for staff:
 * admins fill in info, set a starter password, click Create.
 */
export default function AddUserModal({ currentUser, onClose, onCreated }) {
  const isSuper = currentUser?.role === "super_admin";
  const [draft, setDraft] = useState({
    name: "", email: "", username: "", password: "", role: "student",
    phone: "", belt_rank: "White",
    date_of_birth: "", address: "",
    emergency_contact_name: "", emergency_contact_phone: "",
    medical_notes: "", notes: "", photo_url: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const onPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1.2 * 1024 * 1024) { alert("Photo must be under 1.2 MB"); return; }
    const r = new FileReader();
    r.onload = () => set("photo_url", r.result);
    r.readAsDataURL(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      const payload = {
        ...draft,
        username: draft.username.trim().toLowerCase(),
        email: draft.email.trim() || null,
      };
      const { data } = await api.post("/users", payload);
      onCreated?.(data);
      onClose();
    } catch (err) {
      setMsg(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50" data-testid="add-user-modal">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-start justify-center p-6 overflow-y-auto">
        <form onSubmit={submit} className="bg-[var(--dojo-paper)] border border-[var(--dojo-border)] w-full max-w-3xl my-8">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--dojo-border)]">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Onboarding</div>
              <h2 className="font-serif text-2xl">Add New User</h2>
            </div>
            <button type="button" onClick={onClose} className="p-2 hover:text-[var(--dojo-hinomaru)]"><X size={18} /></button>
          </div>
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            <Section title="Account">
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Full Name *"><input className="input" required value={draft.name} onChange={(e) => set("name", e.target.value)} data-testid="newuser-name" /></Field>
                <Field label="Username *" hint="Required. The login they'll type at sign-in.">
                  <input className="input" required minLength={2} value={draft.username} onChange={(e) => set("username", e.target.value.replace(/\s/g, "").toLowerCase())} data-testid="newuser-username" placeholder="e.g. johnsmith" />
                </Field>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Email" hint="Optional. Useful for password resets and notifications.">
                  <input className="input" type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} data-testid="newuser-email" placeholder="(optional)" />
                </Field>
                <Field label="Starter Password *" hint="At least 6 chars. User can change later."><input className="input" type="text" required minLength={6} value={draft.password} onChange={(e) => set("password", e.target.value)} data-testid="newuser-pw" /></Field>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Role">
                  <select className="input" value={draft.role} onChange={(e) => set("role", e.target.value)} data-testid="newuser-role">
                    <option value="student">Student</option>
                    <option value="team_member">Team Member</option>
                    <option value="sensei">Sensei</option>
                    <option value="renshi">Renshi</option>
                    {isSuper && <option value="admin">Admin</option>}
                    {isSuper && <option value="super_admin">Super Admin</option>}
                  </select>
                </Field>
                <Field label="Phone"><input className="input" value={draft.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Belt Rank">
                  <select className="input" value={draft.belt_rank} onChange={(e) => set("belt_rank", e.target.value)}>
                    {BELT_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                <div />
              </div>
            </Section>

            <Section title="Information">
              <Field label="Date of Birth"><input className="input" type="date" value={draft.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>
              <Field label="Address"><textarea className="input min-h-[60px]" value={draft.address} onChange={(e) => set("address", e.target.value)} /></Field>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Emergency Contact Name"><input className="input" value={draft.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} /></Field>
                <Field label="Emergency Contact Phone"><input className="input" value={draft.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></Field>
              </div>
              <Field label="Medical Notes"><textarea className="input min-h-[60px]" value={draft.medical_notes} onChange={(e) => set("medical_notes", e.target.value)} placeholder="Allergies, injuries…" /></Field>
              <Field label="Internal Notes"><textarea className="input min-h-[60px]" value={draft.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
              <Field label="Photo" hint="Optional. JPG/PNG under 1.2 MB.">
                <div className="flex items-center gap-3">
                  {draft.photo_url && <img src={draft.photo_url} alt="" className="h-16 w-16 object-cover border border-[var(--dojo-border)]" />}
                  <input type="file" accept="image/*" onChange={onPhoto} className="text-sm" />
                </div>
              </Field>
            </Section>
          </div>
          {msg && <div className="px-6 pb-3 text-[var(--dojo-hinomaru)] text-sm" data-testid="newuser-error">{msg}</div>}
          <div className="px-6 py-4 border-t border-[var(--dojo-border)] flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
            <button type="submit" disabled={busy} className="btn-primary flex items-center gap-2" data-testid="newuser-submit">
              <UserPlus size={14} /> {busy ? "Creating…" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-4">
      <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] pb-2 border-b border-[var(--dojo-border)]">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-1.5">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-[var(--dojo-ink-soft)] mt-1">{hint}</div>}
    </div>
  );
}
