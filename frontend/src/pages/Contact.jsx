import { useEffect, useState } from "react";
import PublicLayout from "@/components/PublicLayout";
import api from "@/lib/api";
import { Phone, Mail, MapPin, Clock } from "lucide-react";

export default function Contact() {
  const [page, setPage] = useState(null);
  useEffect(() => { api.get("/cms/pages/contact").then((r) => setPage(r.data)).catch(() => {}); }, []);
  const c = page?.content || {};

  const rows = [
    { icon: MapPin, label: "Address", value: c.address },
    { icon: Phone, label: "Phone", value: c.phone },
    { icon: Mail, label: "Email", value: c.email },
    { icon: Clock, label: "Hours", value: c.hours },
  ];

  return (
    <PublicLayout>
      <section className="max-w-5xl mx-auto px-6 lg:px-10 py-20 md:py-28" data-testid="contact-page">
        <div className="text-[10px] uppercase tracking-[0.32em] text-[var(--dojo-ink-soft)] mb-4">Contact</div>
        <h1 className="font-serif text-5xl md:text-7xl tracking-tight leading-[0.95] mb-12">Visit the dojo.</h1>
        <div className="grid md:grid-cols-2 gap-8 md:gap-16">
          <div className="space-y-8">
            {rows.map((r) => (
              <div key={r.label} className="flex gap-5 items-start">
                <div className="p-3 border border-[var(--dojo-border)]"><r.icon size={16} /></div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mb-1">{r.label}</div>
                  <div className="text-lg font-serif">{r.value}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-[var(--dojo-paper-alt)] border border-[var(--dojo-border)] p-8 md:p-10">
            <div className="font-kanji text-4xl text-[var(--dojo-green)] mb-4">押忍</div>
            <p className="text-[var(--dojo-ink-soft)] leading-relaxed mb-6">
              New students are welcome to observe a class before enrolling. Please call or email ahead so we can greet you properly.
            </p>
            <p className="text-sm text-[var(--dojo-ink-soft)] leading-relaxed">
              Once you have received an access code from the dojo, you may complete enrollment through our online portal.
            </p>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
