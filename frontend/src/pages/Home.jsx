import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PublicLayout from "@/components/PublicLayout";
import RichContent from "@/components/RichContent";
import api from "@/lib/api";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const HERO_IMG = "https://images.unsplash.com/photo-1773017825177-25acaa271258?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHx0cmFkaXRpb25hbCUyMHNob3Rva2FuJTIwa2FyYXRlJTIwZG9qbyUyMGludGVyaW9yfGVufDB8fHx8MTc3NzYxMTM4NXww&ixlib=rb-4.1.0&q=85";
const DOJO_IMG = "https://images.unsplash.com/photo-1776090188738-148faec54948?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwzfHx0cmFkaXRpb25hbCUyMHNob3Rva2FuJTIwa2FyYXRlJTIwZG9qbyUyMGludGVyaW9yfGVufDB8fHx8MTc3NzYxMTM4NXww&ixlib=rb-4.1.0&q=85";

export default function Home() {
  const [page, setPage] = useState(null);

  useEffect(() => {
    api.get("/cms/pages/home").then((r) => setPage(r.data)).catch(() => {});
  }, []);

  const c = page?.content || {};

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative overflow-hidden" data-testid="home-hero">
        <div className="absolute inset-0">
          <img src={HERO_IMG} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/55" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 lg:px-10 py-32 md:py-44 grid md:grid-cols-12 gap-8 text-[#FBFAF6]">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="md:col-span-9"
          >
            <div className="flex items-center gap-4 mb-8">
              <span className="hinomaru-dot" />
              <span className="text-[10px] uppercase tracking-[0.32em]">{c.tagline || "Traditional Shotokan Karate"}</span>
            </div>
            <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight leading-[0.95] mb-8 max-w-4xl">
              {c.hero_headline || "Forge Character. Refine Spirit."}
            </h1>
            <p className="text-lg md:text-xl max-w-2xl text-[#FBFAF6]/80 font-light leading-relaxed">
              {c.hero_sub || "A dojo devoted to the enduring practice of Shotokan karate."}
            </p>
            <div className="flex flex-wrap gap-4 mt-10">
              <Link to="/programs" className="btn-primary" data-testid="home-cta-programs">
                Explore Programs <ArrowRight size={14} className="inline ml-2" />
              </Link>
              <Link
                to="/register"
                className="btn-outline"
                style={{ color: "#FBFAF6", borderColor: "#FBFAF6" }}
                data-testid="home-cta-enroll"
              >
                Enroll Now
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.3 }}
            className="md:col-span-3 flex md:justify-end items-start md:items-end"
          >
            <div className="font-kanji text-7xl md:text-8xl lg:text-9xl text-[var(--dojo-green)] leading-none" aria-hidden>
              {c.kanji || "空手道"}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Intro / Philosophy */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24 md:py-32 grid md:grid-cols-12 gap-10 items-start">
        <div className="md:col-span-5">
          <div className="text-[10px] uppercase tracking-[0.32em] text-[var(--dojo-ink-soft)] mb-6">義 · Righteousness</div>
          <h2 className="font-serif text-4xl md:text-5xl tracking-tight leading-tight mb-6">
            The dojo is a mirror.
          </h2>
          <div className="brush-divider mb-6 max-w-xs" />
          {/^\s*</.test(c.intro || "") ? (
            <RichContent html={c.intro} className="text-base md:text-lg text-[var(--dojo-ink-soft)] [&_p]:leading-relaxed [&_p]:font-light" />
          ) : (
            <p className="text-base md:text-lg text-[var(--dojo-ink-soft)] leading-relaxed font-light">
              {c.intro || "Every class is a return to fundamentals — stance, breath, and intent."}
            </p>
          )}
        </div>
        <div className="md:col-span-7">
          <img src={DOJO_IMG} alt="Dojo interior" className="w-full aspect-[4/3] object-cover" />
        </div>
      </section>

      {/* Three pillars bento */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-24 md:pb-32">
        <div className="grid md:grid-cols-3 gap-0 border border-[var(--dojo-border)]">
          {[
            { kanji: "基本", title: "Kihon", desc: "Fundamentals. Stance, strike, block — practiced until they become breath." },
            { kanji: "型", title: "Kata", desc: "Forms. Choreographed sequences encoding the wisdom of masters." },
            { kanji: "組手", title: "Kumite", desc: "Sparring. Where discipline meets distance, timing, and spirit." },
          ].map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className={`p-10 ${i < 2 ? "md:border-r border-[var(--dojo-border)]" : ""} ${i > 0 ? "border-t md:border-t-0 border-[var(--dojo-border)]" : ""}`}
            >
              <div className="font-kanji text-5xl text-[var(--dojo-green)] mb-4">{p.kanji}</div>
              <div className="text-[10px] uppercase tracking-[0.32em] text-[var(--dojo-ink-soft)] mb-2">Pillar · 0{i + 1}</div>
              <h3 className="font-serif text-3xl mb-3">{p.title}</h3>
              <p className="text-sm text-[var(--dojo-ink-soft)] leading-relaxed">{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA strip */}
      <section className="bg-[var(--dojo-ink)] text-[var(--dojo-paper)]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-20 md:py-24 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-[var(--dojo-paper)]/60 mb-3">Begin your practice</div>
            <h2 className="font-serif text-4xl md:text-5xl tracking-tight">Step onto the tatami.</h2>
          </div>
          <div className="flex gap-4">
            <Link to="/contact" className="btn-outline" style={{ color: "var(--dojo-paper)", borderColor: "var(--dojo-paper)" }} data-testid="home-cta-contact">
              Visit Dojo
            </Link>
            <Link to="/register" className="btn-primary" data-testid="home-cta-register2">
              Enroll
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
