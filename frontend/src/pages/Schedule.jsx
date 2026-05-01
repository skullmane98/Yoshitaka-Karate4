import { useEffect, useState } from "react";
import PublicLayout from "@/components/PublicLayout";
import api from "@/lib/api";

const ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Schedule() {
  const [page, setPage] = useState(null);
  useEffect(() => { api.get("/cms/pages/schedule").then((r) => setPage(r.data)).catch(() => {}); }, []);
  const classes = page?.content?.classes || [];
  const grouped = ORDER.map((day) => ({ day, items: classes.filter((c) => c.day === day) })).filter((g) => g.items.length);

  return (
    <PublicLayout>
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-20 md:py-28" data-testid="schedule-page">
        <div className="text-[10px] uppercase tracking-[0.32em] text-[var(--dojo-ink-soft)] mb-4">Weekly Schedule</div>
        <h1 className="font-serif text-5xl md:text-7xl tracking-tight leading-[0.95] mb-12">When we train.</h1>

        <div className="border border-[var(--dojo-border)]">
          {grouped.map((g, gi) => (
            <div key={g.day} className={`grid md:grid-cols-[160px_1fr] ${gi > 0 ? "border-t border-[var(--dojo-border)]" : ""}`}>
              <div className="p-6 md:p-8 md:border-r border-[var(--dojo-border)] bg-[var(--dojo-paper-alt)]">
                <div className="font-serif text-2xl">{g.day}</div>
                <div className="font-kanji text-[var(--dojo-green)] text-sm mt-1">
                  {["月", "火", "水", "木", "金", "土", "日"][ORDER.indexOf(g.day)]}
                </div>
              </div>
              <div className="divide-y divide-[var(--dojo-border)]">
                {g.items.map((it, i) => (
                  <div key={i} className="p-6 md:p-8 flex items-center justify-between gap-6">
                    <div>
                      <div className="font-serif text-xl md:text-2xl">{it.class}</div>
                    </div>
                    <div className="font-mono-accent text-sm tracking-widest text-[var(--dojo-ink)] whitespace-nowrap">{it.time}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}
