import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sparkles, Play, ChevronLeft, ChevronRight, X, GraduationCap } from "lucide-react";

/**
 * Training overlay for the Add User modal.
 *
 *   ┌───── Add User Modal ─────┐  [TRAINING]  ← floating tab on the right edge
 *   │                          │
 *   └──────────────────────────┘
 *
 * Click TRAINING → opens a small side-panel with:
 *   1. "Watch a 60-second demo video" — embed area (swap DEMO_VIDEO_URL below)
 *   2. "Start guided walkthrough" — overlays highlighted tooltips on each
 *      critical Add-User field in sequence.
 *
 * The walkthrough finds each field by its `data-testid` (lookup happens in the
 * SAME modal that hosts this component, so portal positioning is straightforward).
 */

// 👉 Drop your dojo's demo video URL here (YouTube embed, Vimeo, or direct mp4).
// Example: "https://www.youtube.com/embed/dQw4w9WgXcQ"
// Until set, a friendly placeholder card is shown instead.
const DEMO_VIDEO_URL = "";

const STEPS = [
  {
    target: null,
    title: "Welcome 🥋",
    body:
      "This wizard adds a new dojo member in under a minute. Required fields are marked with a star; everything else can be filled in later from the user's profile.",
  },
  {
    target: "newuser-name",
    title: "1 · Full Name",
    body: "Their formal name as it should appear on the ID card and member roster.",
  },
  {
    target: "newuser-username",
    title: "2 · Username (required)",
    body:
      "This is what they'll type at login. Lowercase, no spaces — e.g. `johnsmith`. They can change it later from their own profile.",
  },
  {
    target: "newuser-email",
    title: "3 · Email (optional)",
    body:
      "Skip this for kids without their own email. Required only if you want password-reset links or email notifications to reach them.",
  },
  {
    target: "newuser-pw",
    title: "4 · Starter Password",
    body:
      "Set any 6+ character starter password. Share it with the member; they can change it from Security → Reset Password on their next login.",
  },
  {
    target: "newuser-role",
    title: "5 · Role & Belt Rank",
    body:
      "Pick Student for new members. Belt Rank can stay White for fresh enrollees and be updated as they progress through the curriculum.",
  },
  {
    target: "newuser-photo-capture-btn",
    title: "6 · Capture / Crop Photo",
    body:
      "Tap Capture / Crop to take a webcam shot or pick a file, then drag/zoom inside the 4:5 frame and set the photo size on the card — it'll sit pixel-perfect next to the QR code.",
  },
  {
    target: "newuser-submit",
    title: "7 · Create the Member",
    body:
      "Click Create User. The member is added, given a unique QR code, and assigned the default ID card template. You can refine everything from the Edit drawer afterwards.",
  },
  {
    target: null,
    title: "All set 🎉",
    body:
      "That's the full flow. Bookmark the Training tab — it's always one click away if you forget a step.",
  },
];

export default function AddUserTraining() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [tourStep, setTourStep] = useState(-1); // -1 = inactive
  const tourActive = tourStep >= 0;

  // Close everything if parent modal closes (component unmounts cleanly).
  useEffect(() => () => { setPanelOpen(false); setTourStep(-1); }, []);

  const startTour = () => {
    setPanelOpen(false);
    setTourStep(0);
  };

  // Auto-close the helper panel when the user dives into the video, so the
  // TRAINING tab re-opens it cleanly afterwards (panel is a toggle).
  const openVideo = () => {
    setPanelOpen(false);
    setVideoOpen(true);
  };

  const endTour = () => setTourStep(-1);
  const nextStep = () => setTourStep((s) => (s + 1 >= STEPS.length ? -1 : s + 1));
  const prevStep = () => setTourStep((s) => Math.max(0, s - 1));

  return (
    <>
      {/* Floating Training tab — right edge of the parent modal */}
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="absolute top-1/2 -right-10 -translate-y-1/2 rotate-90 origin-left bg-[var(--dojo-green)] text-white px-4 py-2 text-[11px] uppercase tracking-[0.24em] flex items-center gap-2 shadow-md hover:bg-[var(--dojo-ink)] transition-colors"
        data-testid="add-user-training-btn"
        aria-label="Open training"
      >
        <GraduationCap size={14} /> Training
      </button>

      {panelOpen && (
        <TrainingPanel
          onClose={() => setPanelOpen(false)}
          onStartTour={startTour}
          onWatchVideo={openVideo}
        />
      )}

      {videoOpen && <DemoVideoModal onClose={() => setVideoOpen(false)} />}

      {tourActive && (
        <TourOverlay
          step={STEPS[tourStep]}
          index={tourStep}
          total={STEPS.length}
          onPrev={prevStep}
          onNext={nextStep}
          onClose={endTour}
        />
      )}
    </>
  );
}

function TrainingPanel({ onClose, onStartTour, onWatchVideo }) {
  return (
    <div
      className="absolute top-1/2 -right-[24rem] -translate-y-1/2 w-[22rem] bg-[var(--dojo-paper)] border border-[var(--dojo-border)] shadow-xl p-5 z-10"
      data-testid="training-panel"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Help</div>
          <div className="font-serif text-xl flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--dojo-green)]" /> Training
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:text-[var(--dojo-hinomaru)]" data-testid="training-panel-close"><X size={16} /></button>
      </div>

      <button
        type="button"
        onClick={onWatchVideo}
        className="w-full border border-[var(--dojo-border)] hover:border-[var(--dojo-ink)] p-3 text-left flex items-center gap-3 mb-3 transition-colors"
        data-testid="training-watch-video"
      >
        <div className="w-10 h-10 rounded-full bg-[var(--dojo-green)] text-white flex items-center justify-center shrink-0"><Play size={16} fill="currentColor" /></div>
        <div className="text-sm">
          <div className="font-medium">Watch a 60-second demo video</div>
          <div className="text-[11px] text-[var(--dojo-ink-soft)]">Full walkthrough — visual learners start here.</div>
        </div>
      </button>

      <button
        type="button"
        onClick={onStartTour}
        className="w-full border border-[var(--dojo-border)] hover:border-[var(--dojo-ink)] p-3 text-left flex items-center gap-3 transition-colors"
        data-testid="training-start-tour"
      >
        <div className="w-10 h-10 rounded-full border-2 border-[var(--dojo-green)] text-[var(--dojo-green)] flex items-center justify-center shrink-0"><Sparkles size={16} /></div>
        <div className="text-sm">
          <div className="font-medium">Start guided walkthrough</div>
          <div className="text-[11px] text-[var(--dojo-ink-soft)]">7 steps, ~30s — highlighted tooltips on each field.</div>
        </div>
      </button>

      <div className="text-[10px] text-[var(--dojo-ink-soft)] mt-4 leading-snug">
        Tip: you can re-open this panel any time — your form input is preserved.
      </div>
    </div>
  );
}

function DemoVideoModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-6" onClick={onClose} data-testid="training-video-modal">
      <div className="bg-[var(--dojo-paper)] border border-[var(--dojo-border)] w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--dojo-border)]">
          <div className="font-serif text-lg">Add User — 60-second demo</div>
          <button onClick={onClose} className="p-1 hover:text-[var(--dojo-hinomaru)]" data-testid="training-video-close"><X size={16} /></button>
        </div>
        <div className="aspect-video bg-black">
          {DEMO_VIDEO_URL ? (
            <iframe
              src={DEMO_VIDEO_URL}
              title="Add User demo"
              className="w-full h-full"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              data-testid="training-video-iframe"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-white/80 text-sm text-center px-8 gap-3">
              <Play size={42} className="opacity-40" />
              <div className="max-w-md">
                Drop your demo video URL into <code className="text-white">DEMO_VIDEO_URL</code> in <code className="text-white">AddUserTraining.jsx</code> to display it here.
              </div>
              <div className="text-[11px] text-white/50">YouTube embed, Vimeo, or direct .mp4 all work.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TourOverlay({ step, index, total, onPrev, onNext, onClose }) {
  const [rect, setRect] = useState(null);
  const tooltipRef = useRef(null);

  // Locate the target element on every step, scroll it into view, then capture
  // its bounding box so we can draw the highlight ring + tooltip near it.
  useLayoutEffect(() => {
    if (!step.target) { setRect(null); return; }
    const el = document.querySelector(`[data-testid="${step.target}"]`);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // give scroll a beat, then measure
    const t = setTimeout(() => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }, 250);
    return () => clearTimeout(t);
  }, [step]);

  // Re-measure on resize so the highlight tracks the field.
  useEffect(() => {
    const onResize = () => {
      if (!step.target) return;
      const el = document.querySelector(`[data-testid="${step.target}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [step]);

  const isLast = index === total - 1;
  const PAD = 8;
  const ringStyle = rect && {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  };
  // Tooltip placement — under the field, falling back to centred if no target.
  const TOOLTIP_W = 320;
  const tooltipStyle = rect
    ? {
        top: Math.min(window.innerHeight - 200, rect.top + rect.height + 16),
        left: Math.max(12, Math.min(window.innerWidth - TOOLTIP_W - 12, rect.left + rect.width / 2 - TOOLTIP_W / 2)),
        width: TOOLTIP_W,
      }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: TOOLTIP_W };

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none" data-testid="training-tour-overlay">
      {/* Dimmer */}
      <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={onClose} />

      {/* Highlight ring around the targeted field */}
      {ringStyle && (
        <div
          className="absolute border-2 border-[var(--dojo-green)] rounded-sm pointer-events-none transition-all duration-200"
          style={{ ...ringStyle, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
          data-testid="training-tour-ring"
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute bg-[var(--dojo-paper)] border border-[var(--dojo-border)] shadow-2xl p-4 pointer-events-auto"
        style={tooltipStyle}
        data-testid="training-tour-tooltip"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="font-serif text-lg leading-tight">{step.title}</div>
          <button onClick={onClose} className="p-1 hover:text-[var(--dojo-hinomaru)]" data-testid="training-tour-close"><X size={14} /></button>
        </div>
        <div className="text-sm text-[var(--dojo-ink-soft)] leading-relaxed mb-4">{step.body}</div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] font-mono-accent" data-testid="training-tour-step-indicator">
            Step {index + 1} / {total}
          </div>
          <div className="flex gap-2">
            {index > 0 && (
              <button onClick={onPrev} className="btn-outline text-xs flex items-center gap-1 px-3 py-1.5" data-testid="training-tour-prev">
                <ChevronLeft size={12} /> Prev
              </button>
            )}
            <button onClick={isLast ? onClose : onNext} className="btn-primary text-xs flex items-center gap-1 px-3 py-1.5" data-testid="training-tour-next">
              {isLast ? "Finish" : <>Next <ChevronRight size={12} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
