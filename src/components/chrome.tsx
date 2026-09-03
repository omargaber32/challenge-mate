import { useMemo, type CSSProperties, type ReactElement, type SVGProps } from "react";
import { ChartIcon, FlameFill, HomeIcon, TrophyIcon, UserIcon } from "./icons";

/* ------------------------------------------------------------------ */
/* ambient layered background                                          */
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
          op: 0.2 + r(5) * 0.4,
          sway: (r(6) - 0.5) * 90,
        };
      }),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(52rem 36rem at 85% -8%, rgba(255,122,51,0.14), transparent 62%)," +
            "radial-gradient(46rem 34rem at -12% 108%, rgba(71,184,116,0.12), transparent 60%)," +
            "radial-gradient(30rem 22rem at 12% 18%, rgba(234,194,107,0.07), transparent 65%)," +
            "linear-gradient(180deg, #0a110d 0%, #070d0a 55%, #060b08 100%)",
        }}
      />
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
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120rem 60rem at 50% 120%, transparent 55%, rgba(0,0,0,0.5))" }}
      />
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
/* bottom navigation (README §1)                                       */
/* ------------------------------------------------------------------ */

export type TabId = "home" | "challenges" | "progress" | "profile";

const TABS: { id: TabId; label: string; Icon: (p: SVGProps<SVGSVGElement>) => ReactElement }[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "challenges", label: "Challenges", Icon: TrophyIcon },
  { id: "progress", label: "Progress", Icon: ChartIcon },
  { id: "profile", label: "Profile", Icon: UserIcon },
];

export function BottomNav({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  const idx = TABS.findIndex((t) => t.id === tab);
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center">
      <nav
        aria-label="Main"
        className="relative m-3 w-[calc(100%-1.5rem)] max-w-[404px] rounded-[18px] border border-ink-600 bg-ink-900/95 shadow-[0_22px_60px_-16px_rgba(0,0,0,0.95)] backdrop-blur-md"
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
