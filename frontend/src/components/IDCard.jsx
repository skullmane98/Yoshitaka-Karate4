import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Loader2, Download, RotateCw } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";
import { resolveIDCardDesign, mergeTemplates } from "@/lib/idcardTemplates";
import { useAuth } from "@/context/AuthContext";
import jsPDF from "jspdf";

// Convert px (UI font size) → pt (jsPDF font size). 1 pt = 1.333 px.
function pxToPt(px) { return px * 0.75; }

// Load a remote/inline image into an HTMLImageElement so jsPDF can embed it
// at exact mm coordinates without going through html2canvas.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // soft-fail — card just skips that image
    img.src = src;
  });
}

// Render the background image as a faded watermark on the PDF.
//
// Matches the DOM preview behaviour:
//   • 40% opacity (jsPDF GState — supported in PDF 1.4+)
//   • "cover" fit — image fills the card, cropping the overflowing axis
//   • Optional zoom override (`design.background_size`, default 1.0)
// The clipped area beyond the card bounds is intentionally drawn; the
// surrounding white rect drawn afterwards in horizontal/vertical paths is
// already there *before* this helper runs, so we rely on the page boundary
// to clip overflow. Acceptable for a 85.6 × 53.98 mm card.
function drawBackgroundWatermark(pdf, img, W, H, sizeOverride, offsetX = 0, offsetY = 0, opacity = 0.55) {
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  if (!naturalW || !naturalH) return;

  // "cover" fit — pick the larger scale so neither axis has gaps.
  const cover = Math.max(W / naturalW, H / naturalH);
  const zoom = Number(sizeOverride);
  const scale = cover * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  const drawW = naturalW * scale;
  const drawH = naturalH * scale;
  // Center on the card, then nudge by the admin-configured offset (mm).
  const x = (W - drawW) / 2 + Number(offsetX || 0);
  const y = (H - drawH) / 2 + Number(offsetY || 0);

  const clampedOpacity = Math.min(1, Math.max(0, Number(opacity) || 0.55));
  let restoreNeeded = false;
  try {
    const gs = new pdf.GState({ opacity: clampedOpacity });
    pdf.setGState(gs);
    restoreNeeded = true;
    pdf.addImage(img, "PNG", x, y, drawW, drawH);
  } catch (_) {
    try { pdf.addImage(img, "PNG", x, y, drawW, drawH); } catch (_) {}
  } finally {
    if (restoreNeeded) {
      try {
        const reset = new pdf.GState({ opacity: 1 });
        pdf.setGState(reset);
      } catch (_) {}
    }
  }
}

async function drawHorizontalCardOnPdf(pdf, ctx) {
  const { W, H, user, design, data } = ctx;
  const MARGIN = 4;            // mm
  // Vertical offset for the top text block — keeps a healthy safe-zone from
  // the card's top edge so cheap card printers don't clip ascenders.
  const TOP_PAD = 2;           // mm

  // White background w/ subtle border
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, W, H, "F");
  pdf.setDrawColor(229, 225, 213);
  pdf.setLineWidth(0.2);
  pdf.rect(0.5, 0.5, W - 1, H - 1, "S");

  // Logo top-left
  const logoSrc = design.logo_url || LOGO_URL;
  const [logoImg, photoImg, qrImg, bgImg] = await Promise.all([
    loadImage(logoSrc),
    loadImage(user.photo_url),
    loadImage(data?.qr_png),
    loadImage(design.background_url),
  ]);

  // Background watermark (drawn first so everything else sits on top).
  // Matches the on-screen preview: opacity / offsets / "cover" fit / zoom.
  if (bgImg) {
    drawBackgroundWatermark(pdf, bgImg, W, H, design.background_size, design.bg_offset_x, design.bg_offset_y, design.background_opacity);
  }

  if (logoImg) {
    try { pdf.addImage(logoImg, "PNG", MARGIN, MARGIN + TOP_PAD, 9, 9); } catch (_) {}
  }

  // Top text block (right of logo)
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(74, 74, 74);
  pdf.setFontSize(6);
  pdf.text(String(design.dojo_name).toUpperCase(), MARGIN + 11, MARGIN + TOP_PAD + 3.2);

  drawTitleWithPill(pdf, design.certificate_title, MARGIN + 11 + Number(design.title_offset_x || 0), MARGIN + TOP_PAD + 8 + Number(design.title_offset_y || 0), {
    fontSize: 12,
    color: hexToRgb(design.title_text_color || "#0F0F0F"),
    bgColor: design.title_bg_color,
  });

  // Top-right kanji (in accent color)
  const accent = hexToRgb(design.accent_color || "#D7263D");
  pdf.setTextColor(accent.r, accent.g, accent.b);
  pdf.setFont("times", "normal");
  pdf.setFontSize(14);
  pdf.text(String(design.kanji_top), W - MARGIN, MARGIN + TOP_PAD + 6, { align: "right" });

  // Divider line
  pdf.setDrawColor(229, 225, 213);
  pdf.setLineWidth(0.15);
  pdf.line(MARGIN, MARGIN + TOP_PAD + 11, W - MARGIN, MARGIN + TOP_PAD + 11);

  // Photo (left col), info (middle), QR (right) — sized in mm
  const PHOTO_W = 13 * (design.photo_size || 1);
  const PHOTO_H = 17 * (design.photo_size || 1);
  const QR_SIDE = 16 * (design.qr_size || 1);
  const contentY = MARGIN + TOP_PAD + 13;
  const photoY = Math.min(H - MARGIN - PHOTO_H, contentY);

  // Photo
  if (photoImg) {
    try { pdf.addImage(photoImg, "PNG", MARGIN, photoY, PHOTO_W, PHOTO_H); } catch (_) {}
    pdf.setDrawColor(229, 225, 213);
    pdf.rect(MARGIN, photoY, PHOTO_W, PHOTO_H, "S");
  } else {
    pdf.setDrawColor(229, 225, 213);
    pdf.setLineDashPattern([0.6, 0.6], 0);
    pdf.rect(MARGIN, photoY, PHOTO_W, PHOTO_H, "S");
    pdf.setLineDashPattern([], 0);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5);
    pdf.setTextColor(74, 74, 74);
    pdf.text("NO PHOTO", MARGIN + PHOTO_W / 2, photoY + PHOTO_H / 2, { align: "center", baseline: "middle" });
  }

  // Info block — stacked rows so Rank can't drift into the QR column
  let infoX = MARGIN + PHOTO_W + 4;
  let infoY = contentY + 2;
  drawLabel(pdf, design.name_label, infoX, infoY);
  pdf.setFont("times", "normal"); pdf.setFontSize(11); pdf.setTextColor(15, 15, 15);
  pdf.text(String(user.name || "—"), infoX, infoY + 3.8);
  infoY += 7;
  drawLabel(pdf, design.role_label, infoX, infoY);
  drawValue(pdf, prettyRole(user.role), infoX, infoY + 3.2);
  infoY += 6;
  drawLabel(pdf, design.footer_label, infoX, infoY);
  pdf.setFont("courier", "normal"); pdf.setFontSize(9); pdf.setTextColor(15, 15, 15);
  pdf.text(String(user.member_number || "—"), infoX, infoY + 3.4);

  // QR (right)
  const qrX = W - MARGIN - QR_SIDE;
  const qrY = contentY + 1;
  if (qrImg) {
    try { pdf.addImage(qrImg, "PNG", qrX, qrY, QR_SIDE, QR_SIDE); } catch (_) {}
  }
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(5); pdf.setTextColor(74, 74, 74);
  pdf.text(String(design.scan_text).toUpperCase(), qrX + QR_SIDE / 2, qrY + QR_SIDE + 2, { align: "center" });

  // Bottom divider + footer
  const footerY = H - MARGIN - 2;
  pdf.setDrawColor(229, 225, 213); pdf.setLineWidth(0.15);
  pdf.line(MARGIN, footerY - 3, W - MARGIN, footerY - 3);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(5); pdf.setTextColor(74, 74, 74);
  pdf.text(String(design.issued_text).toUpperCase(), MARGIN, footerY);
  pdf.setFont("times", "normal"); pdf.setFontSize(9);
  pdf.setTextColor(accent.r, accent.g, accent.b);
  pdf.text(String(design.kanji_bottom), W - MARGIN, footerY, { align: "right" });
}

async function drawVerticalCardOnPdf(pdf, ctx) {
  const { W, H, user, design, data } = ctx;
  const MARGIN = 3;

  pdf.setFillColor(255, 255, 255); pdf.rect(0, 0, W, H, "F");
  pdf.setDrawColor(229, 225, 213); pdf.setLineWidth(0.2);
  pdf.rect(0.5, 0.5, W - 1, H - 1, "S");

  const logoSrc = design.logo_url || LOGO_URL;
  const [logoImg, photoImg, qrImg, bgImg] = await Promise.all([
    loadImage(logoSrc),
    loadImage(user.photo_url),
    loadImage(data?.qr_png),
    loadImage(design.background_url),
  ]);

  // Background watermark first, so logo/photo/QR sit on top.
  if (bgImg) {
    drawBackgroundWatermark(pdf, bgImg, W, H, design.background_size, design.bg_offset_x, design.bg_offset_y, design.background_opacity);
  }

  // Top: logo centered
  if (logoImg) {
    try { pdf.addImage(logoImg, "PNG", (W - 10) / 2, MARGIN + 2, 10, 10); } catch (_) {}
  }
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(5); pdf.setTextColor(74, 74, 74);
  pdf.text(String(design.dojo_name).toUpperCase(), W / 2, MARGIN + 15.5, { align: "center" });
  // Vertical layout — same pill helper, but centred so we measure the text
  // first then offset x by half the width.
  {
    const fontSize = 10;
    pdf.setFont("times", "normal");
    pdf.setFontSize(fontSize);
    const tw = pdf.getTextWidth(String(design.certificate_title || ""));
    drawTitleWithPill(pdf, design.certificate_title, W / 2 - tw / 2 + Number(design.title_offset_x || 0), MARGIN + 19 + Number(design.title_offset_y || 0), {
      fontSize,
      color: hexToRgb(design.title_text_color || "#0F0F0F"),
      bgColor: design.title_bg_color,
    });
  }

  // Photo + QR row
  const PHOTO_W = 14 * (design.photo_size || 1);
  const PHOTO_H = 18 * (design.photo_size || 1);
  const QR_SIDE = 18 * (design.qr_size || 1);
  const rowY = MARGIN + 22;
  const rowGap = 2;
  const rowW = PHOTO_W + rowGap + QR_SIDE;
  const startX = (W - rowW) / 2;

  if (photoImg) {
    try { pdf.addImage(photoImg, "PNG", startX, rowY, PHOTO_W, PHOTO_H); } catch (_) {}
    pdf.setDrawColor(229, 225, 213); pdf.rect(startX, rowY, PHOTO_W, PHOTO_H, "S");
  } else {
    pdf.setDrawColor(229, 225, 213); pdf.setLineDashPattern([0.6, 0.6], 0);
    pdf.rect(startX, rowY, PHOTO_W, PHOTO_H, "S");
    pdf.setLineDashPattern([], 0);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(5); pdf.setTextColor(74, 74, 74);
    pdf.text("NO PHOTO", startX + PHOTO_W / 2, rowY + PHOTO_H / 2, { align: "center", baseline: "middle" });
  }
  const qrX = startX + PHOTO_W + rowGap;
  if (qrImg) {
    try { pdf.addImage(qrImg, "PNG", qrX, rowY, QR_SIDE, QR_SIDE); } catch (_) {}
  }

  // Member info bottom block
  let y = rowY + Math.max(PHOTO_H, QR_SIDE) + 4;
  drawLabel(pdf, design.name_label, MARGIN, y);
  pdf.setFont("times", "normal"); pdf.setFontSize(9); pdf.setTextColor(15, 15, 15);
  pdf.text(String(user.name || "—"), MARGIN, y + 3.4);
  y += 7;
  drawLabel(pdf, design.footer_label, MARGIN, y);
  pdf.setFont("courier", "normal"); pdf.setFontSize(7); pdf.setTextColor(15, 15, 15);
  pdf.text(String(user.member_number || "—"), MARGIN, y + 3.2);

  // Bottom footer
  const accent = hexToRgb(design.accent_color || "#D7263D");
  const footerY = H - MARGIN - 1;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(5); pdf.setTextColor(74, 74, 74);
  pdf.text(String(design.issued_text).toUpperCase(), MARGIN, footerY);
  pdf.setFont("times", "normal"); pdf.setFontSize(8); pdf.setTextColor(accent.r, accent.g, accent.b);
  pdf.text(String(design.kanji_bottom), W - MARGIN, footerY, { align: "right" });
}

function drawLabel(pdf, txt, x, y) {
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(5); pdf.setTextColor(74, 74, 74);
  pdf.text(String(txt || "").toUpperCase(), x, y);
}
function drawValue(pdf, txt, x, y) {
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(15, 15, 15);
  pdf.text(String(txt || "—"), x, y);
}
function prettyRole(role) {
  return String(role || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return { r: 215, g: 38, b: 61 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

// Small DOM helper that wraps the certificate title in a colored pill when
// `bg` is set. Falls back to plain text when bg is empty / missing so the
// existing layout doesn't change unless a template/user opts in.
function TitlePill({ bg, children }) {
  if (!bg) return <>{children}</>;
  return (
    <span
      style={{
        backgroundColor: bg,
        padding: "0.06em 0.45em",
        borderRadius: "0.18em",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
      }}
    >
      {children}
    </span>
  );
}

// Draws the certificate title on the PDF, with an optional colored pill
// behind it sized to hug the text. Returns where the title baseline was.
function drawTitleWithPill(pdf, text, x, y, opts) {
  const { font = "times", style = "normal", fontSize, color, bgColor } = opts;
  pdf.setFont(font, style);
  pdf.setFontSize(fontSize);
  const txt = String(text || "");
  const textW = pdf.getTextWidth(txt);
  // jsPDF font size is in pt → mm conversion (1 pt = 0.3528 mm).
  const fontMM = fontSize * 0.3528;
  // Generous horizontal pad; tight vertical pad — looks like a tab badge.
  const padX = fontMM * 0.35;
  const padY = fontMM * 0.18;
  if (bgColor) {
    const rgb = hexToRgb(bgColor);
    pdf.setFillColor(rgb.r, rgb.g, rgb.b);
    // Text baseline is at y. Approximate cap-height as 0.72 of font size.
    const capHeight = fontMM * 0.72;
    pdf.rect(
      x - padX,
      y - capHeight - padY * 0.4,
      textW + padX * 2,
      capHeight + padY * 1.4,
      "F"
    );
  }
  pdf.setTextColor(color.r, color.g, color.b);
  pdf.text(txt, x, y);
}

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
  // Soft colored pill drawn behind the certificate title so it stays
  // readable against busy background images. Empty string = no pill.
  title_bg_color: "",
  // Position offsets (in mm) so admins can nudge elements on cards where the
  // template's default position fights with a custom background image.
  title_offset_x: 0,
  title_offset_y: 0,
  bg_offset_x: 0,
  bg_offset_y: 0,
  // Watermark opacity (0–1). Default raised from 0.4 → 0.55 so backgrounds
  // are visible without overpowering the foreground content.
  background_opacity: 0.55,
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
export default function IDCard({ user, defaultOrientation = "horizontal", previewMode = false }) {
  const { user: currentUser } = useAuth();
  const canDownload = !previewMode && ["admin", "super_admin"].includes(currentUser?.role);
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
        // 1) Resolve design (CMS + template defaults + per-user overrides).
        //    Template list now comes from the dedicated `idcard_templates`
        //    table (Path B) instead of the legacy CMS page.
        const [idcardPage, templateList] = await Promise.all([
          api.get("/cms/pages/idcard").catch(() => null),
          api.get("/idcard-templates").catch(() => null),
        ]);
        const globalCMS = idcardPage?.data?.content || {};
        const cmsTemplates = {};
        for (const t of templateList?.data || []) {
          cmsTemplates[t.key] = { label: t.label, description: t.description, config: t.config || {} };
        }
        const merged = { ...DEFAULTS, ...resolveIDCardDesign(globalCMS, user, cmsTemplates) };
        if (!active) return;
        setDesign(merged);

        // 2) Fetch the QR PNG in the requested color. Skipped in preview mode
        //    so the editor doesn't hit a 404 for the fake preview user.
        if (previewMode) {
          if (active) setData(null);
          return;
        }
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
  }, [user?.id, user?.idcard_template, JSON.stringify(user?.idcard_overrides || {}), user?.qr_code, previewMode]);

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

  // Native-jsPDF export. Bypasses html2canvas entirely so font baselines
  // are computed by jsPDF (which embeds standard fonts and knows their exact
  // metrics) instead of by an HTML-rendering canvas pipeline that can drop
  // ascenders/descenders during font fallback. Result: zero text clipping,
  // works on every browser, no font-loading race condition.
  const exportPDF = async () => {
    setExporting(true);
    try {
      const isV = orientation === "vertical";
      const W = isV ? CR80_MM.h : CR80_MM.w; // mm
      const H = isV ? CR80_MM.w : CR80_MM.h;
      const pdf = new jsPDF({
        orientation: isV ? "portrait" : "landscape",
        unit: "mm",
        format: [W, H],
        compress: true,
      });
      if (isV) await drawVerticalCardOnPdf(pdf, { W, H, user, design, data });
      else await drawHorizontalCardOnPdf(pdf, { W, H, user, design, data });
      pdf.save(`yoshitaka-id-${user.member_number}-${orientation}.pdf`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[IDCard PDF] export failed:", err);
      alert("Couldn't generate the PDF.\n\n" + (err?.message || err));
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
            {/* Optional background watermark (with optional zoom override) */}
            {design.background_url && (
              <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${design.background_url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    opacity: Number(design.background_opacity ?? 0.55),
                    transform: `translate(${Number(design.bg_offset_x || 0)}mm, ${Number(design.bg_offset_y || 0)}mm) scale(${scaleOf(design, "background_size")})`,
                    transformOrigin: "center center",
                  }}
                />
              </div>
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
        disabled={exporting || loading || !canDownload}
        className="btn-outline w-full flex items-center justify-center gap-2"
        data-testid="idcard-pdf-btn"
        title={canDownload ? "" : "Only admins can download printable ID cards"}
      >
        <Download size={14} />
        {!canDownload
          ? "Download disabled — admin only"
          : exporting
            ? "Generating PDF…"
            : `Download CR80 ${orientation === "vertical" ? "Portrait" : "Landscape"} PDF`}
      </button>
      <div className="text-[10px] text-[var(--dojo-ink-soft)] flex items-center gap-1">
        <RotateCw size={10} /> Print at 100% scale on a CR80 blank card (85.6 × 53.98 mm).
      </div>
    </div>
  );
}

// Default font sizes (in px) per logical section. Admin overrides via
// `idcard_overrides.font_sizes.{key}`.
const DEFAULT_FONT_SIZES = {
  dojo_name: 10,
  certificate_title: 20,
  kanji_top: 24,
  member_name: 20,
  role_value: 12,
  rank_value: 12,
  member_number: 14,
  field_label: 10,
  scan_text: 9,
  issued_text: 10,
  kanji_bottom: 16,
};

// Curated font-size presets that overwrite all sizes at once.
export const FONT_SIZE_PRESETS = {
  compact: {
    label: "Compact",
    sizes: { dojo_name: 8, certificate_title: 16, kanji_top: 20, member_name: 16, role_value: 10, rank_value: 10, member_number: 12, field_label: 8, scan_text: 8, issued_text: 8, kanji_bottom: 12 },
  },
  standard: {
    label: "Standard",
    sizes: { ...DEFAULT_FONT_SIZES },
  },
  large_print: {
    label: "Large-print",
    sizes: { dojo_name: 12, certificate_title: 26, kanji_top: 32, member_name: 28, role_value: 16, rank_value: 16, member_number: 18, field_label: 12, scan_text: 11, issued_text: 12, kanji_bottom: 22 },
  },
};

function pxOf(design, key) {
  const sizes = design?.font_sizes || {};
  const raw = sizes[key];
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 6 && n <= 64) return `${n}px`;
  return `${DEFAULT_FONT_SIZES[key]}px`;
}

// Multiplier between 25% and 300% for photo / QR resize sliders.
function scaleOf(design, key, fallback = 1) {
  const raw = design?.[key];
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0.25 && n <= 3) return n;
  return fallback;
}

function HorizontalLayout({ user, design, data, loading, logoSrc }) {
  const photoScale = scaleOf(design, "photo_size");
  const qrScale = scaleOf(design, "qr_size");
  const photoW = Math.round(110 * photoScale);
  const photoH = Math.round(138 * photoScale);
  const qrSide = Math.round(128 * qrScale);
  return (
    <div className="relative h-full flex flex-col">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src={logoSrc} alt="" className="h-12 w-12 object-contain shrink-0" />
          <div className="min-w-0">
            <div className="uppercase tracking-[0.28em] text-[var(--dojo-ink-soft)] mb-1 truncate" style={{ fontSize: pxOf(design, "dojo_name"), lineHeight: 1.4 }}>
              {design.dojo_name}
            </div>
            <div
              className="font-serif font-medium tracking-tight truncate"
              style={{
                fontSize: pxOf(design, "certificate_title"),
                lineHeight: 1.25,
                color: design.title_text_color || undefined,
                transform: `translate(${Number(design.title_offset_x || 0)}mm, ${Number(design.title_offset_y || 0)}mm)`,
              }}
            >
              <TitlePill bg={design.title_bg_color}>{design.certificate_title}</TitlePill>
            </div>
          </div>
        </div>
        <span className="font-kanji shrink-0" style={{ color: design.accent_color, fontSize: pxOf(design, "kanji_top"), lineHeight: 1.2 }}>
          {design.kanji_top}
        </span>
      </div>

      <div className="brush-divider mb-3" />

      <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-center flex-1 min-h-0">
        {/* Member photo (left column) */}
        {user.photo_url ? (
          <div
            className="border border-[var(--dojo-border)] bg-white shrink-0 self-center"
            style={{ width: photoW, height: photoH }}
            data-testid="idcard-photo"
          >
            <img src={user.photo_url} alt="Member" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div
            className="border border-dashed border-[var(--dojo-border)] bg-white shrink-0 self-center flex items-center justify-center text-[8px] uppercase tracking-[0.2em] text-[var(--dojo-ink-soft)] text-center px-2"
            style={{ width: photoW, height: photoH }}
          >
            No Photo
          </div>
        )}

        {/* Member info (middle, fills) */}
        <div className="space-y-2 min-w-0 self-center">
          <div>
            <div className="uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]" style={{ fontSize: pxOf(design, "field_label"), lineHeight: 1.4 }}>{design.name_label}</div>
            <div className="font-serif font-medium truncate" data-testid="idcard-name" style={{ fontSize: pxOf(design, "member_name"), lineHeight: 1.25 }}>{user.name}</div>
          </div>
          <div>
            <div className="uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]" style={{ fontSize: pxOf(design, "field_label"), lineHeight: 1.4 }}>{design.role_label}</div>
            <div className="font-medium capitalize truncate" style={{ fontSize: pxOf(design, "role_value"), lineHeight: 1.3 }}>{user.role.replace("_", " ")}</div>
          </div>
          <div>
            <div className="uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]" style={{ fontSize: pxOf(design, "field_label"), lineHeight: 1.4 }}>{design.footer_label}</div>
            <div className="font-mono-accent tracking-widest" data-testid="idcard-member-number" style={{ fontSize: pxOf(design, "member_number"), lineHeight: 1.3 }}>
              {user.member_number}
            </div>
          </div>
        </div>

        {/* QR (right column) */}
        <div className="flex flex-col items-center gap-1 shrink-0 self-center">
          <div className="p-1.5 bg-white border border-[var(--dojo-border)]">
            {loading || !data ? (
              <div className="flex items-center justify-center" style={{ width: qrSide, height: qrSide }}>
                <Loader2 className="animate-spin text-[var(--dojo-ink-soft)]" />
              </div>
            ) : (
              <img src={data.qr_png} alt="QR" style={{ width: qrSide, height: qrSide }} data-testid="idcard-qr" />
            )}
          </div>
          <div className="uppercase tracking-[0.3em] text-[var(--dojo-ink-soft)]" style={{ fontSize: pxOf(design, "scan_text") }}>
            {design.scan_text}
          </div>
        </div>
      </div>

      <div className="brush-divider mt-3 mb-2" />
      <div className="brush-divider mt-3 mb-2" />
      <div className="flex justify-between items-end uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] pb-1" style={{ fontSize: pxOf(design, "issued_text"), lineHeight: 1.4 }}>
        <span className="truncate pr-2">{design.issued_text}</span>
        <span className="font-kanji shrink-0" style={{ color: design.accent_color, fontSize: pxOf(design, "kanji_bottom"), lineHeight: 1.4 }}>
          {design.kanji_bottom}
        </span>
      </div>
    </div>
  );
}

function VerticalLayout({ user, design, data, loading, logoSrc }) {
  const photoScale = scaleOf(design, "photo_size");
  const qrScale = scaleOf(design, "qr_size");
  const photoW = Math.round(90 * photoScale);
  const photoH = Math.round(110 * photoScale);
  const qrSide = Math.round(112 * qrScale);
  return (
    <div className="relative h-full flex flex-col items-center text-center">
      <img src={logoSrc} alt="" className="h-14 w-14 object-contain mb-1" />
      <div className="uppercase tracking-[0.28em] text-[var(--dojo-ink-soft)]" style={{ fontSize: pxOf(design, "dojo_name"), lineHeight: 1.4 }}>
        {design.dojo_name}
      </div>
      <div
        className="font-serif font-medium tracking-tight mt-1"
        style={{
          fontSize: pxOf(design, "certificate_title"),
          lineHeight: 1.25,
          color: design.title_text_color || undefined,
          transform: `translate(${Number(design.title_offset_x || 0)}mm, ${Number(design.title_offset_y || 0)}mm)`,
        }}
      >
        <TitlePill bg={design.title_bg_color}>{design.certificate_title}</TitlePill>
      </div>

      <div className="brush-divider w-full my-2" />

      <div className="flex items-center justify-center gap-3">
        {user.photo_url ? (
          <div
            className="border border-[var(--dojo-border)] bg-white shrink-0"
            style={{ width: photoW, height: photoH }}
            data-testid="idcard-photo"
          >
            <img src={user.photo_url} alt="Member" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div
            className="border border-dashed border-[var(--dojo-border)] bg-white shrink-0 flex items-center justify-center text-[8px] uppercase tracking-[0.2em] text-[var(--dojo-ink-soft)] text-center px-1"
            style={{ width: photoW, height: photoH }}
          >
            No Photo
          </div>
        )}
        <div className="p-1.5 bg-white border border-[var(--dojo-border)]">
          {loading || !data ? (
            <div className="flex items-center justify-center" style={{ width: qrSide, height: qrSide }}>
              <Loader2 className="animate-spin text-[var(--dojo-ink-soft)]" />
            </div>
          ) : (
            <img src={data.qr_png} alt="QR" style={{ width: qrSide, height: qrSide }} data-testid="idcard-qr" />
          )}
        </div>
      </div>
      <div className="uppercase tracking-[0.3em] text-[var(--dojo-ink-soft)] mt-1" style={{ fontSize: pxOf(design, "scan_text"), lineHeight: 1.4 }}>
        {design.scan_text}
      </div>

      <div className="brush-divider w-full my-2" />

      <div className="w-full">
        <div className="uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]" style={{ fontSize: pxOf(design, "field_label"), lineHeight: 1.4 }}>{design.name_label}</div>
        <div className="font-serif font-medium truncate" data-testid="idcard-name" style={{ fontSize: pxOf(design, "member_name"), lineHeight: 1.25 }}>{user.name}</div>
      </div>
      <div className="w-full mt-2">
        <div className="uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]" style={{ fontSize: pxOf(design, "field_label"), lineHeight: 1.4 }}>{design.footer_label}</div>
        <div className="font-mono-accent tracking-widest truncate" data-testid="idcard-member-number" style={{ fontSize: pxOf(design, "member_number"), lineHeight: 1.3 }}>
          {user.member_number}
        </div>
      </div>

      <div className="mt-auto pt-2 w-full uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] flex justify-between items-end" style={{ fontSize: pxOf(design, "issued_text"), lineHeight: 1.4 }}>
        <span className="truncate pr-2">{design.issued_text}</span>
        <span className="font-kanji shrink-0" style={{ color: design.accent_color, fontSize: pxOf(design, "kanji_bottom"), lineHeight: 1.2 }}>
          {design.kanji_bottom}
        </span>
      </div>
    </div>
  );
}
