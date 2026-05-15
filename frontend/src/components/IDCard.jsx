import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Loader2, Download, RotateCw } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";
import { resolveIDCardDesign } from "@/lib/idcardTemplates";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const DEFAULTS = {
  dojo_name: "Yoshitaka Karate-Do",
  certificate_title: "Member Certificate",
  kanji_top: "空手道",
  kanji_bottom: "義孝",
  issued_text: "Issued · Yoshitaka Dojo",
  scan_text: "Scan to verify",
  footer_label: "Member No.",
  rank_label: "Rank",
  role_label: "Role",
  name_label: "Member",
  accent_color: "#D7263D",
  qr_color: "#D7263D",
  logo_url: "",
  background_url: "",
};

// Real-world CR80 plastic-card dimensions (credit-card size).
const CR80_MM = { w: 85.6, h: 53.98 };
// Internal render size — rendered crisp, then CSS-scaled to fit container.
// 12.0 px/mm gives ~1027 × 648 logical pixels at landscape, more than enough
// resolution for screen + 600 dpi-ish printing once html2canvas takes scale: 4.
const PX_PER_MM = 12;

function cardPx(orientation) {
  const w = orientation === "vertical" ? CR80_MM.h : CR80_MM.w;
  const h = orientation === "vertical" ? CR80_MM.w : CR80_MM.h;
  return { w: Math.round(w * PX_PER_MM), h: Math.round(h * PX_PER_MM) };
}

/**
 * Plastic-card style ID with QR + Logo. Two orientations (horizontal /
 * vertical), both sized to CR80 (85.6 × 53.98 mm). PDF export targets exactly
 * those dimensions so prints come out flush on standard blank cards.
 */
export default function IDCard({ user, defaultOrientation = "horizontal" }) {
  const [data, setData] = useState(null);
  const [design, setDesign] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [orientation, setOrientation] = useState(defaultOrientation);
  const [scale, setScale] = useState(1);
  const cardRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        // 1) Resolve design (CMS + template + per-user overrides) so we know
        //    which QR color to ask the server for.
        const idcardPage = await api.get("/cms/pages/idcard").catch(() => null);
        const globalCMS = idcardPage?.data?.content || {};
        const merged = { ...DEFAULTS, ...resolveIDCardDesign(globalCMS, user) };
        if (!active) return;
        setDesign(merged);

        // 2) Fetch the QR PNG in the requested color.
        const qrColor = merged.qr_color || "#D7263D";
        const qr = await api.get(`/users/${user.id}/qrcode`, {
          params: { color: qrColor },
        }).catch(() => null);
        if (!active) return;
        if (qr) setData(qr.data);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.idcard_template, user?.idcard_overrides, user?.qr_code]);

  // Compute the scale factor whenever the wrapper resizes so the card always
  // fills the available width while keeping CR80 aspect ratio.
  useEffect(() => {
    const inner = cardPx(orientation);
    const update = () => {
      if (!wrapRef.current) return;
      const cw = wrapRef.current.clientWidth;
      setScale(Math.min(cw / inner.w, 1.4));
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [orientation]);

  const exportPDF = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 4,
        backgroundColor: "#FFFFFF",
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const isV = orientation === "vertical";
      const pdf = new jsPDF({
        orientation: isV ? "portrait" : "landscape",
        unit: "mm",
        format: isV ? [CR80_MM.h, CR80_MM.w] : [CR80_MM.w, CR80_MM.h],
      });
      pdf.addImage(
        imgData,
        "PNG",
        0,
        0,
        isV ? CR80_MM.h : CR80_MM.w,
        isV ? CR80_MM.w : CR80_MM.h,
      );
      pdf.save(`yoshitaka-id-${user.member_number}-${orientation}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  if (!user) return null;

  const logoSrc = design.logo_url || LOGO_URL;
  const isVertical = orientation === "vertical";
  const inner = cardPx(orientation);

  return (
    <div className="space-y-3" data-testid="id-card-wrapper">
      {/* Orientation toggle */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Layout</span>
        <div className="inline-flex border border-[var(--dojo-border)]">
          <button
            type="button"
            onClick={() => setOrientation("horizontal")}
            className={`px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${orientation === "horizontal" ? "bg-[var(--dojo-ink)] text-[var(--dojo-paper)]" : "text-[var(--dojo-ink)]"}`}
            data-testid="idcard-layout-horizontal"
          >Horizontal</button>
          <button
            type="button"
            onClick={() => setOrientation("vertical")}
            className={`px-3 py-1 text-[10px] uppercase tracking-[0.18em] border-l border-[var(--dojo-border)] ${orientation === "vertical" ? "bg-[var(--dojo-ink)] text-[var(--dojo-paper)]" : "text-[var(--dojo-ink)]"}`}
            data-testid="idcard-layout-vertical"
          >Vertical</button>
        </div>
        <span className="text-[9px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] ml-auto" title="Standard CR80 plastic-card size">
          CR80 · 85.6 × 53.98 mm
        </span>
      </div>

      {/* Scaled wrapper: keeps the card's outer bounding box at the scaled
          size so surrounding layout doesn't fight with the inner transform. */}
      <div
        ref={wrapRef}
        className="mx-auto"
        style={{
          width: "100%",
          maxWidth: inner.w,
          height: inner.h * scale,
        }}
      >
        <div
          style={{
            width: inner.w,
            height: inner.h,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <div
            ref={cardRef}
            className="id-card relative overflow-hidden"
            data-testid="id-card"
            style={{
              width: inner.w,
              height: inner.h,
              padding: isVertical ? 24 : 32,
            }}
          >
            {/* Optional background watermark */}
            {design.background_url && (
              <div
                className="absolute inset-0 opacity-40 pointer-events-none"
                style={{
                  backgroundImage: `url(${design.background_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
                aria-hidden
              />
            )}

            {isVertical ? (
              <VerticalLayout user={user} design={design} data={data} loading={loading} logoSrc={logoSrc} />
            ) : (
              <HorizontalLayout user={user} design={design} data={data} loading={loading} logoSrc={logoSrc} />
            )}
          </div>
        </div>
      </div>

      <button
        onClick={exportPDF}
        disabled={exporting || loading}
        className="btn-outline w-full flex items-center justify-center gap-2"
        data-testid="idcard-pdf-btn"
      >
        <Download size={14} />
        {exporting ? "Generating PDF…" : `Download CR80 ${orientation === "vertical" ? "Portrait" : "Landscape"} PDF`}
      </button>
      <div className="text-[10px] text-[var(--dojo-ink-soft)] flex items-center gap-1">
        <RotateCw size={10} /> Print at 100% scale on a CR80 blank card (85.6 × 53.98 mm).
      </div>
    </div>
  );
}

function HorizontalLayout({ user, design, data, loading, logoSrc }) {
  return (
    <div className="relative h-full flex flex-col">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src={logoSrc} alt="" className="h-12 w-12 object-contain shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--dojo-ink-soft)] mb-1 truncate">
              {design.dojo_name}
            </div>
            <div className="font-serif text-xl font-medium tracking-tight leading-none truncate">
              {design.certificate_title}
            </div>
          </div>
        </div>
        <span className="font-kanji text-2xl leading-none shrink-0" style={{ color: design.accent_color }}>
          {design.kanji_top}
        </span>
      </div>

      <div className="brush-divider mb-3" />

      <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-center flex-1 min-h-0">
        {/* Member photo (left column) */}
        {user.photo_url ? (
          <div
            className="border border-[var(--dojo-border)] bg-white shrink-0 self-center"
            style={{ width: 110, height: 138 }}
            data-testid="idcard-photo"
          >
            <img src={user.photo_url} alt="Member" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div
            className="border border-dashed border-[var(--dojo-border)] bg-white shrink-0 self-center flex items-center justify-center text-[8px] uppercase tracking-[0.2em] text-[var(--dojo-ink-soft)] text-center px-2"
            style={{ width: 110, height: 138 }}
          >
            No Photo
          </div>
        )}

        {/* Member info (middle, fills) */}
        <div className="space-y-2 min-w-0 self-center">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{design.name_label}</div>
            <div className="font-serif text-xl font-medium leading-tight truncate" data-testid="idcard-name">{user.name}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{design.role_label}</div>
              <div className="text-xs font-medium capitalize truncate">{user.role.replace("_", " ")}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{design.rank_label}</div>
              <div className="text-xs font-medium truncate">{user.belt_rank || "—"}</div>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{design.footer_label}</div>
            <div className="font-mono-accent text-sm tracking-widest" data-testid="idcard-member-number">
              {user.member_number}
            </div>
          </div>
        </div>

        {/* QR (right column) */}
        <div className="flex flex-col items-center gap-1 shrink-0 self-center">
          <div className="p-1.5 bg-white border border-[var(--dojo-border)]">
            {loading || !data ? (
              <div className="w-32 h-32 flex items-center justify-center">
                <Loader2 className="animate-spin text-[var(--dojo-ink-soft)]" />
              </div>
            ) : (
              <img src={data.qr_png} alt="QR" className="w-32 h-32" data-testid="idcard-qr" />
            )}
          </div>
          <div className="text-[9px] uppercase tracking-[0.3em] text-[var(--dojo-ink-soft)]">
            {design.scan_text}
          </div>
        </div>
      </div>

      <div className="brush-divider mt-3 mb-2" />
      <div className="flex justify-between items-end text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">
        <span className="truncate pr-2">{design.issued_text}</span>
        <span className="font-kanji text-base shrink-0" style={{ color: design.accent_color }}>
          {design.kanji_bottom}
        </span>
      </div>
    </div>
  );
}

function VerticalLayout({ user, design, data, loading, logoSrc }) {
  return (
    <div className="relative h-full flex flex-col items-center text-center">
      <img src={logoSrc} alt="" className="h-14 w-14 object-contain mb-1" />
      <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--dojo-ink-soft)]">
        {design.dojo_name}
      </div>
      <div className="font-serif text-lg font-medium tracking-tight leading-tight mt-1">
        {design.certificate_title}
      </div>

      <div className="brush-divider w-full my-2" />

      <div className="flex items-center justify-center gap-3">
        {user.photo_url ? (
          <div
            className="border border-[var(--dojo-border)] bg-white shrink-0"
            style={{ width: 90, height: 110 }}
            data-testid="idcard-photo"
          >
            <img src={user.photo_url} alt="Member" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div
            className="border border-dashed border-[var(--dojo-border)] bg-white shrink-0 flex items-center justify-center text-[8px] uppercase tracking-[0.2em] text-[var(--dojo-ink-soft)] text-center px-1"
            style={{ width: 90, height: 110 }}
          >
            No Photo
          </div>
        )}
        <div className="p-1.5 bg-white border border-[var(--dojo-border)]">
          {loading || !data ? (
            <div className="w-28 h-28 flex items-center justify-center">
              <Loader2 className="animate-spin text-[var(--dojo-ink-soft)]" />
            </div>
          ) : (
            <img src={data.qr_png} alt="QR" className="w-28 h-28" data-testid="idcard-qr" />
          )}
        </div>
      </div>
      <div className="text-[9px] uppercase tracking-[0.3em] text-[var(--dojo-ink-soft)] mt-1">
        {design.scan_text}
      </div>

      <div className="brush-divider w-full my-2" />

      <div className="w-full">
        <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{design.name_label}</div>
        <div className="font-serif text-base font-medium leading-tight truncate" data-testid="idcard-name">{user.name}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 w-full mt-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{design.rank_label}</div>
          <div className="text-xs font-medium truncate">{user.belt_rank || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{design.footer_label}</div>
          <div className="font-mono-accent text-xs tracking-widest truncate" data-testid="idcard-member-number">
            {user.member_number}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-2 w-full text-[9px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] flex justify-between items-end">
        <span className="truncate pr-2">{design.issued_text}</span>
        <span className="font-kanji text-sm shrink-0" style={{ color: design.accent_color }}>
          {design.kanji_bottom}
        </span>
      </div>
    </div>
  );
}
