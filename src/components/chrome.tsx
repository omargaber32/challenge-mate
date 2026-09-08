import { useMemo, type CSSProperties, type ReactElement, type SVGProps } from "react";
import { ChartIcon, FlameFill, HomeIcon, TrophyIcon, UserIcon } from "./icons";

/* ------------------------------------------------------------------ */
/* themes                                                              */
/* ------------------------------------------------------------------ */

export interface ThemeDef {
  id: string;
  name: string;
  blurb: string;
  /** swatch preview: [page, accent] */
  swatch: [string, string];
}

export const THEMES: ThemeDef[] = [
  { id: "ember", name: "Ember", blurb: "The original dark flame", swatch: ["#0b120e", "#ff7a33"] },
  { id: "paper", name: "Paper", blurb: "Light & minimal", swatch: ["#f5f3ea", "#ef6a20"] },
  { id: "ocean", name: "Ocean", blurb: "Deep-water teal", swatch: ["#0a1420", "#1fa895"] },
  { id: "rose", name: "Rosé", blurb: "Warm plum dusk", swatch: ["#191017", "#e04e76"] },
  { id: "minimal-dark", name: "Minimal Dark", blurb: "Clean & neutral", swatch: ["#0a0a0a", "#737373"] },
  { id: "minimal-light", name: "Minimal Light", blurb: "Clean & neutral", swatch: ["#ffffff", "#737373"] },
];

export const THEME_KEY = "cm_theme";

export function applyTheme(id: string) {
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* private mode */
  }
  document.documentElement.setAttribute("data-theme", id);
}

/* ------------------------------------------------------------------ */
/* ambient layered background (theme-aware)                            */
/* ------------------------------------------------------------------ */

export function Ambient() {
  const dots = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const r = (n: number) => {
          const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
          return x - Math.floor(x);
        };
        return {
          left: `${r(1) * 100}%`,
          size: 2 + r(2) * 4,
          dur: 15 + r(3) * 20,
          delay: -r(4) * 32,
          op: 0.18 + r(5) * 0.36,
          sway: (r(6) - 0.5) * 90,
        };
      }),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="ambient-grad absolute inset-0" />
      {dots.map((d, i) => (
        <span
          key={i}
          className="ember-dot"
          style={
            {
              left: d.left,
              width: d.size,
              height: d.size,
              animationDuration: `${d.dur}s`,
              animationDelay: `${d.delay}s`,
              "--op": d.op,
              "--sway": `${d.sway}px`,
            } as CSSProperties
          }
        />
      ))}
      <div className="noise-layer absolute inset-0 opacity-[0.05]" />
      <div className="ambient-vig absolute inset-0" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* wordmark                                                            */
/* ------------------------------------------------------------------ */

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-flex">
        <span className="anim-glow absolute inset-0 rounded-full bg-ember-500/35 blur-lg" />
        <FlameFill className="anim-flicker relative h-6 w-6 text-ember-500" />
      </span>
      {!compact && (
        <span className="font-display text-lg font-extrabold tracking-tight text-bone-100">
          Challenge<span className="text-ember-400">Mate</span>
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* navigation (README §1) — mobile pill (in-flow) + desktop sidebar    */
/* ------------------------------------------------------------------ */

export type TabId = "home" | "challenges" | "progress" | "profile";

export const TABS: { id: TabId; label: string; Icon: (p: SVGProps<SVGSVGElement>) => ReactElement }[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "challenges", label: "Challenges", Icon: TrophyIcon },
  { id: "progress", label: "Progress", Icon: ChartIcon },
  { id: "profile", label: "Profile", Icon: UserIcon },
];

/**
 * Mobile bottom bar. It lives IN the page flow (sticky), not fixed —
 * so the last button on a page can never end up underneath it.
 */
export function BottomNav({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  const idx = TABS.findIndex((t) => t.id === tab);
  return (
    <div className="sticky bottom-0 z-[60] flex justify-center md:hidden" style={{ marginBottom: 0 }}>
      <nav
        aria-label="Main"
        className="relative m-3 w-[calc(100%-1.5rem)] max-w-[404px] rounded-[18px] border border-ink-600 bg-ink-900/95 shadow-[0_22px_60px_-16px_rgba(0,0,0,0.7)] backdrop-blur-md"
        style={{ marginBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="relative grid grid-cols-4 py-1.5">
          <span
            aria-hidden
            className="absolute inset-y-1.5 left-0 w-1/4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(${idx * 100}%)` }}
          >
            <span className="mx-1.5 block h-full rounded-[13px] border border-ink-500/70 bg-ink-700/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" />
          </span>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`relative z-10 flex flex-col items-center gap-[3px] py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors duration-200 ${
                tab === t.id ? "text-ember-400" : "text-bone-600 hover:text-bone-300"
              }`}
            >
              <t.Icon className="h-[21px] w-[21px]" />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Desktop (≥md) left rail — same tabs, app-frame layout. */
export function SideNav({
  tab,
  onChange,
  username,
  connected,
}: {
  tab: TabId;
  onChange: (t: TabId) => void;
  username: string;
  connected: boolean;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-[55] hidden w-60 flex-col border-r border-ink-700/70 bg-ink-900/85 backdrop-blur-md md:flex">
      <div className="px-6 pb-6 pt-7">
        <Wordmark />
        <p className="mt-2 text-[10.5px] font-bold uppercase tracking-[0.22em] text-bone-600">
          streaks &amp; accountability
        </p>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-1.5 px-3.5">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              aria-current={active ? "page" : undefined}
              className={`group relative flex w-full items-center gap-3.5 overflow-hidden rounded-[13px] border px-4 py-3 text-left text-sm font-bold transition-all duration-200 ${
                active
                  ? "border-ink-500 bg-ink-700/80 text-ember-300"
                  : "border-transparent text-bone-500 hover:border-ink-600 hover:bg-ink-800/60 hover:text-bone-100"
              }`}
            >
              {active && <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-ember-500" />}
              <t.Icon className={`h-5 w-5 shrink-0 transition-transform duration-200 ${active ? "" : "group-hover:scale-110"}`} />
              {t.label}
            </button>
          );
        })}
      </nav>
      <div className="space-y-3 px-5 pb-6">
        <div className="rounded-[13px] border border-ink-600 bg-ink-850 px-3.5 py-3">
          <p className="flex items-center gap-2 text-[12.5px] font-bold capitalize text-bone-100">
            <span className="font-display flex h-7 w-7 items-center justify-center rounded-full border border-ember-500/40 bg-ember-500/10 text-[11px] font-extrabold uppercase text-ember-300">
              {username.slice(0, 2)}
            </span>
            {username}
          </p>
        </div>
        <p className="flex items-center gap-2 px-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-bone-600">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-leaf-400" : "bg-gold-400"}`} />
          {connected ? "Sheet · live" : "Local demo"}
        </p>
      </div>
    </aside>
  );
}
