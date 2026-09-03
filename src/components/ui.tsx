import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { TaskStatus } from "../types";
import { FlameFill, XIcon } from "./icons";

/* ------------------------------------------------------------------ */
/* shared class recipes                                                */
/* ------------------------------------------------------------------ */

export const btnSolid =
  "inline-flex items-center justify-center gap-2 rounded-[10px] bg-ember-500 px-4 py-3 text-sm font-bold text-ink-950 transition-all duration-200 hover:bg-ember-400 hover:shadow-[0_8px_28px_-8px_rgba(255,122,51,0.55)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-[10px] border border-ink-500 bg-transparent px-4 py-3 text-sm font-semibold text-bone-300 transition-all duration-200 hover:border-ember-400/70 hover:text-ember-300 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

export const btnGold =
  "inline-flex items-center justify-center gap-2 rounded-[10px] border border-gold-500/60 bg-gold-400/10 px-4 py-3 text-sm font-bold text-gold-300 transition-all duration-200 hover:bg-gold-400/20 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

export const inputCls =
  "w-full rounded-[10px] border border-ink-500 bg-ink-900 px-3.5 py-2.5 text-sm text-bone-100 placeholder:text-bone-600 outline-none transition focus:border-ember-400 focus:ring-2 focus:ring-ember-500/20";

export const cardCls = "rounded-[16px] border border-ink-600 bg-ink-850";

/* ------------------------------------------------------------------ */
/* motion hooks                                                        */
/* ------------------------------------------------------------------ */

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fn = () => setReduced(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduced;
}

/** scramble-decode text effect — the quote "types itself in" */
export function useScramble(text: string) {
  const reduced = usePrefersReducedMotion();
  const [out, setOut] = useState(reduced ? text : "");
  useEffect(() => {
    if (reduced) {
      setOut(text);
      return;
    }
    const glyphs = "▓▒░#%*+=~";
    let frame = 0;
    let raf = 0;
    const step = () => {
      frame++;
      const lock = Math.floor(frame / 1.7);
      let s = "";
      for (let i = 0; i < text.length; i++) {
        s +=
          i < lock
            ? text[i]
            : text[i] === " "
              ? " "
              : glyphs[Math.floor(Math.random() * glyphs.length)];
      }
      setOut(s);
      if (lock < text.length) raf = requestAnimationFrame(step);
      else setOut(text);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, reduced]);
  return out;
}

export function useCountUp(target: number, duration = 850) {
  const reduced = usePrefersReducedMotion();
  const [val, setVal] = useState(reduced ? target : 0);
  const prev = useRef(0);
  useEffect(() => {
    if (reduced) {
      setVal(target);
      prev.current = target;
      return;
    }
    const from = prev.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);
  return val;
}

/** scroll reveal wrapper */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            el.classList.add("is-in");
            io.disconnect();
          }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`rv ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* primitives                                                          */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div className="modal-fade absolute inset-0 bg-ink-950/75 backdrop-blur-[3px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="sheet-rise relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[22px] border border-ink-600 bg-ink-850 shadow-[0_-20px_80px_-20px_rgba(0,0,0,0.9)] sm:max-w-md sm:rounded-[18px]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-ink-700 bg-ink-850/95 px-5 py-4 backdrop-blur">
          <div className="font-display text-lg font-bold text-bone-100">{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-ink-600 p-1.5 text-bone-500 transition hover:border-coral-400/60 hover:text-coral-300"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

const STATUS_META: Record<TaskStatus, { label: string; cls: string; dot: string }> = {
  PENDING: { label: "Pending", cls: "border-bone-600/40 bg-ink-800 text-bone-300", dot: "bg-bone-500" },
  DONE: { label: "Done", cls: "border-leaf-500/45 bg-leaf-500/10 text-leaf-300", dot: "bg-leaf-400" },
  MISSED: { label: "Missed", cls: "border-coral-500/45 bg-coral-500/10 text-coral-300", dot: "bg-coral-400" },
  VACATION: { label: "Vacation", cls: "border-gold-500/45 bg-gold-400/10 text-gold-300", dot: "bg-gold-400" },
};

export function StatusChip({ status, label }: { status: TaskStatus; label?: string }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.12em] ${m.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {label ?? m.label}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-bone-500">
        {label}
        {hint && <span className="normal-case tracking-normal text-bone-600">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** animated flame + streak number */
export function StreakFlame({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const counted = useCountUp(value);
  const dims = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-4 w-4" : "h-6 w-6";
  const text = size === "lg" ? "text-5xl" : size === "sm" ? "text-sm" : "text-xl";
  return (
    <span className="inline-flex items-end gap-1.5">
      <span className="relative inline-flex">
        <span className="anim-glow absolute inset-0 rounded-full bg-ember-500/30 blur-md" />
        <FlameFill className={`anim-flicker relative ${dims} ${value > 0 ? "text-ember-400" : "text-ink-500"}`} />
      </span>
      <span className={`font-display font-extrabold leading-none text-bone-100 ${text}`}>{counted}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* confetti                                                            */
/* ------------------------------------------------------------------ */

const CONFETTI_COLORS = ["#FF7A33", "#EAC26B", "#6FD394", "#F2EDDD", "#EE5F1B", "#F58374"];

export function ConfettiLayer({ fireKey }: { fireKey: number }) {
  const reduced = usePrefersReducedMotion();
  const [bits, setBits] = useState<{ id: number; style: CSSProperties }[]>([]);
  useEffect(() => {
    if (!fireKey || reduced) return;
    const arr = Array.from({ length: 30 }, (_, i) => ({
      id: fireKey * 100 + i,
      style: {
        left: "50%",
        top: "42%",
        background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        "--dx": `${(Math.random() - 0.5) * 340}px`,
        "--dy": `${-90 - Math.random() * 240}px`,
        "--rot": `${(Math.random() - 0.5) * 760}deg`,
        animationDelay: `${Math.random() * 90}ms`,
      } as CSSProperties,
    }));
    setBits(arr);
    const t = setTimeout(() => setBits([]), 1250);
    return () => clearTimeout(t);
  }, [fireKey, reduced]);
  return (
    <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden" aria-hidden>
      {bits.map((b) => (
        <span key={b.id} className="confetti-bit" style={b.style} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* toasts                                                              */
/* ------------------------------------------------------------------ */

interface ToastMsg {
  id: number;
  text: string;
  tone: "success" | "info" | "warn";
}
const ToastCtx = createContext<{ push: (text: string, tone?: ToastMsg["tone"]) => void }>({
  push: () => undefined,
});
export const useToast = () => useContext(ToastCtx);

let toastSeq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, tone: ToastMsg["tone"] = "success") => {
    const id = toastSeq++;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);
  const toneCls: Record<ToastMsg["tone"], string> = {
    success: "border-leaf-500/50 text-leaf-300",
    info: "border-ember-400/50 text-ember-300",
    warn: "border-gold-500/50 text-gold-300",
  };
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[95] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in max-w-[400px] rounded-[12px] border bg-ink-900/95 px-4 py-2.5 text-sm font-semibold shadow-[0_16px_44px_-12px_rgba(0,0,0,0.85)] backdrop-blur ${toneCls[t.tone]}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
