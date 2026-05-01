import { useState } from "react";
import RichTextEditor from "@/components/RichTextEditor";
import { Plus, Trash2, GripVertical } from "lucide-react";

/**
 * Per-page structured CMS editors. Each editor receives initial { title, content }
 * and exposes onChange({ title, content }) calls so the parent can save when ready.
 */

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">{label}</label>
      {children}
      {hint && <div className="text-xs text-[var(--dojo-ink-soft)] mt-1.5">{hint}</div>}
    </div>
  );
}

function ArrayHeader({ label, onAdd, count }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{label} · {count}</div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 px-3 py-1 border border-[var(--dojo-ink)] text-xs uppercase tracking-widest hover:bg-[var(--dojo-ink)] hover:text-white transition-colors"
        data-testid={`rte-add-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <Plus size={12} /> Add
      </button>
    </div>
  );
}

function RowShell({ index, onRemove, onMoveUp, onMoveDown, children }) {
  return (
    <div className="border border-[var(--dojo-border)] bg-[var(--dojo-input-bg)] p-4 relative">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center text-[var(--dojo-ink-soft)] pt-1">
          <GripVertical size={14} />
          <span className="text-[10px] mt-1">{index + 1}</span>
        </div>
        <div className="flex-1 space-y-3">{children}</div>
        <div className="flex flex-col gap-1">
          <button type="button" onClick={onMoveUp} className="text-[10px] text-[var(--dojo-ink-soft)] hover:text-[var(--dojo-ink)]" data-testid={`row-up-${index}`}>↑</button>
          <button type="button" onClick={onMoveDown} className="text-[10px] text-[var(--dojo-ink-soft)] hover:text-[var(--dojo-ink)]" data-testid={`row-down-${index}`}>↓</button>
          <button type="button" onClick={onRemove} className="text-[var(--dojo-hinomaru)] hover:text-[var(--dojo-hinomaru-dark)]" data-testid={`row-remove-${index}`}><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  );
}

function move(arr, from, to) {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

// -------------------------------------------------------------------- HOME --
export function HomeEditor({ value, onChange, title, onTitleChange }) {
  const c = value || {};
  const set = (k, v) => onChange({ ...c, [k]: v });
  return (
    <div className="space-y-5">
      <Field label="Page Title (admin label)">
        <input className="input" value={title} onChange={(e) => onTitleChange(e.target.value)} data-testid="cms-title" />
      </Field>
      <Field label="Tagline">
        <input className="input" value={c.tagline || ""} onChange={(e) => set("tagline", e.target.value)} data-testid="cms-tagline" />
      </Field>
      <Field label="Hero Headline">
        <input className="input" value={c.hero_headline || ""} onChange={(e) => set("hero_headline", e.target.value)} data-testid="cms-hero-headline" />
      </Field>
      <Field label="Kanji (right of hero)">
        <input className="input" value={c.kanji || ""} onChange={(e) => set("kanji", e.target.value)} data-testid="cms-kanji" />
      </Field>
      <Field label="Hero Sub-headline" hint="Plain text under the headline.">
        <textarea className="input" rows={3} value={c.hero_sub || ""} onChange={(e) => set("hero_sub", e.target.value)} data-testid="cms-hero-sub" />
      </Field>
      <Field label="Intro paragraph (rich text)">
        <RichTextEditor value={c.intro || ""} onChange={(v) => set("intro", v)} testid="cms-intro" />
      </Field>
    </div>
  );
}

// ------------------------------------------------------------------- ABOUT --
export function AboutEditor({ value, onChange, title, onTitleChange }) {
  const c = value || {};
  const set = (k, v) => onChange({ ...c, [k]: v });
  return (
    <div className="space-y-5">
      <Field label="Page Title">
        <input className="input" value={title} onChange={(e) => onTitleChange(e.target.value)} data-testid="cms-title" />
      </Field>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Sensei Name">
          <input className="input" value={c.sensei_name || ""} onChange={(e) => set("sensei_name", e.target.value)} data-testid="cms-sensei-name" />
        </Field>
        <Field label="Rank">
          <input className="input" value={c.rank || ""} onChange={(e) => set("rank", e.target.value)} data-testid="cms-sensei-rank" />
        </Field>
      </div>
      <Field label="Biography (rich text)">
        <RichTextEditor value={c.sensei_bio || ""} onChange={(v) => set("sensei_bio", v)} minHeight={220} testid="cms-sensei-bio" />
      </Field>
      <Field label="Philosophy (single quote)">
        <textarea className="input" rows={2} value={c.philosophy || ""} onChange={(e) => set("philosophy", e.target.value)} data-testid="cms-philosophy" />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------- PROGRAMS --
export function ProgramsEditor({ value, onChange, title, onTitleChange }) {
  const programs = value?.programs || [];
  const setPrograms = (next) => onChange({ ...value, programs: next });
  const update = (i, patch) => setPrograms(programs.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const add = () => setPrograms([...programs, { name: "New Program", desc: "" }]);
  const remove = (i) => setPrograms(programs.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-5">
      <Field label="Page Title">
        <input className="input" value={title} onChange={(e) => onTitleChange(e.target.value)} data-testid="cms-title" />
      </Field>
      <ArrayHeader label="Programs" count={programs.length} onAdd={add} />
      <div className="space-y-3">
        {programs.map((p, i) => (
          <RowShell
            key={i}
            index={i}
            onRemove={() => remove(i)}
            onMoveUp={() => setPrograms(move(programs, i, i - 1))}
            onMoveDown={() => setPrograms(move(programs, i, i + 1))}
          >
            <input className="input" value={p.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Program name" data-testid={`cms-program-name-${i}`} />
            <RichTextEditor value={p.desc || ""} onChange={(v) => update(i, { desc: v })} testid={`cms-program-desc-${i}`} minHeight={120} />
          </RowShell>
        ))}
        {programs.length === 0 && <div className="text-sm text-[var(--dojo-ink-soft)]">No programs yet. Click Add.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- SCHEDULE --
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function ScheduleEditor({ value, onChange, title, onTitleChange }) {
  const classes = value?.classes || [];
  const setClasses = (next) => onChange({ ...value, classes: next });
  const update = (i, patch) => setClasses(classes.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const add = () => setClasses([...classes, { day: "Monday", time: "6:00 PM – 7:00 PM", class: "New Class" }]);
  const remove = (i) => setClasses(classes.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-5">
      <Field label="Page Title">
        <input className="input" value={title} onChange={(e) => onTitleChange(e.target.value)} data-testid="cms-title" />
      </Field>
      <ArrayHeader label="Classes" count={classes.length} onAdd={add} />
      <div className="space-y-3">
        {classes.map((c, i) => (
          <RowShell
            key={i}
            index={i}
            onRemove={() => remove(i)}
            onMoveUp={() => setClasses(move(classes, i, i - 1))}
            onMoveDown={() => setClasses(move(classes, i, i + 1))}
          >
            <div className="grid md:grid-cols-3 gap-3">
              <select className="input" value={c.day} onChange={(e) => update(i, { day: e.target.value })} data-testid={`cms-sch-day-${i}`}>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <input className="input" value={c.time} onChange={(e) => update(i, { time: e.target.value })} placeholder="6:00 PM – 7:00 PM" data-testid={`cms-sch-time-${i}`} />
              <input className="input" value={c.class} onChange={(e) => update(i, { class: e.target.value })} placeholder="Class name" data-testid={`cms-sch-class-${i}`} />
            </div>
          </RowShell>
        ))}
        {classes.length === 0 && <div className="text-sm text-[var(--dojo-ink-soft)]">No classes yet. Click Add.</div>}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- NEWS --
export function NewsEditor({ value, onChange, title, onTitleChange }) {
  const posts = value?.posts || [];
  const setPosts = (next) => onChange({ ...value, posts: next });
  const update = (i, patch) => setPosts(posts.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const add = () => setPosts([{ date: new Date().toISOString().slice(0, 10), title: "New Post", body: "" }, ...posts]);
  const remove = (i) => setPosts(posts.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-5">
      <Field label="Page Title">
        <input className="input" value={title} onChange={(e) => onTitleChange(e.target.value)} data-testid="cms-title" />
      </Field>
      <ArrayHeader label="Posts" count={posts.length} onAdd={add} />
      <div className="space-y-3">
        {posts.map((p, i) => (
          <RowShell
            key={i}
            index={i}
            onRemove={() => remove(i)}
            onMoveUp={() => setPosts(move(posts, i, i - 1))}
            onMoveDown={() => setPosts(move(posts, i, i + 1))}
          >
            <div className="grid md:grid-cols-[160px_1fr] gap-3">
              <input type="date" className="input" value={p.date || ""} onChange={(e) => update(i, { date: e.target.value })} data-testid={`cms-news-date-${i}`} />
              <input className="input" value={p.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="Post title" data-testid={`cms-news-title-${i}`} />
            </div>
            <RichTextEditor value={p.body || ""} onChange={(v) => update(i, { body: v })} testid={`cms-news-body-${i}`} minHeight={140} />
          </RowShell>
        ))}
        {posts.length === 0 && <div className="text-sm text-[var(--dojo-ink-soft)]">No posts yet. Click Add.</div>}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- CONTACT --
export function ContactEditor({ value, onChange, title, onTitleChange }) {
  const c = value || {};
  const set = (k, v) => onChange({ ...c, [k]: v });
  return (
    <div className="space-y-5">
      <Field label="Page Title">
        <input className="input" value={title} onChange={(e) => onTitleChange(e.target.value)} data-testid="cms-title" />
      </Field>
      <Field label="Address"><input className="input" value={c.address || ""} onChange={(e) => set("address", e.target.value)} data-testid="cms-contact-address" /></Field>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Phone"><input className="input" value={c.phone || ""} onChange={(e) => set("phone", e.target.value)} data-testid="cms-contact-phone" /></Field>
        <Field label="Email"><input className="input" value={c.email || ""} onChange={(e) => set("email", e.target.value)} data-testid="cms-contact-email" /></Field>
      </div>
      <Field label="Hours"><input className="input" value={c.hours || ""} onChange={(e) => set("hours", e.target.value)} data-testid="cms-contact-hours" /></Field>
    </div>
  );
}

const EDITORS = {
  home: HomeEditor,
  about: AboutEditor,
  programs: ProgramsEditor,
  schedule: ScheduleEditor,
  news: NewsEditor,
  contact: ContactEditor,
};

export function getEditorForSlug(slug) {
  return EDITORS[slug] || null;
}
