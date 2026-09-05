import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ChallengeCardData, type ProgressData } from "../services/api";
import type { TaskStatus, User } from "../types";
import { Reveal, StreakFlame, cardCls, useCountUp } from "../components/ui";
import { ChevronLeft, FlameFill } from "../components/icons";
import { fmtDay, fmtMinutes, fmtMonthYear, monthGrid, parseKey, todayKey } from "../utils/dates";

function StatTile({
  label,
  value,
  suffix,
  tone,
  delay,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: string;
  delay: number;
}) {
  const v = useCountUp(value, 700 + delay);
  return (
    <Reveal delay={delay}>
      <div className="rounded-[14px] border border-ink-600 bg-ink-850 p-4">
        <p className={`font-display text-[24px] font-extrabold leading-none ${tone ?? "text-bone-100"}`}>
          {v}
          {suffix && <span className="ml-0.5 text-[13px] font-bold text-bone-500">{suffix}</span>}
        </p>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-bone-600">{label}</p>
      </div>
    </Reveal>
  );
}

const CELL: Record<TaskStatus, string> = {
  DONE: "border-leaf-400/50 bg-leaf-500/75 hover:bg-leaf-400",
  MISSED: "border-coral-400/50 bg-coral-500/70 hover:bg-coral-400",
  VACATION: "border-gold-300/50 bg-gold-400/70 hover:bg-gold-300",
  PENDING: "border-ink-600 bg-ink-800",
};

export default function ProgressPage({ user }: { user: User }) {
  const [joined, setJoined] = useState<ChallengeCardData[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<ProgressData | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  });

  useEffect(() => {
    api.getChallenges(user.user_id).then((all) => {
      const mine = all.filter((c) => c.member);
      setJoined(mine);
      if (mine.length && !selected) setSelected(mine[0].challenge.challenge_id);
    });
  }, [user.user_id, selected]);

  const load = useCallback(() => {
    if (selected) api.getProgress(user.user_id, selected).then(setData);
  }, [user.user_id, selected]);
  useEffect(load, [load]);

  useEffect(() => {
    if (data) {
      const end = data.challenge.end_date < todayKey() ? data.challenge.end_date : todayKey();
      const e = parseKey(end);
      setMonthCursor({ y: e.getFullYear(), m: e.getMonth() });
    }
  }, [data?.challenge.challenge_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = useMemo(
    () => monthGrid(monthCursor.y, monthCursor.m),
    [monthCursor],
  );

  const monthBounds = useMemo(() => {
    if (!data) return null;
    const s = parseKey(data.challenge.start_date);
    const end = data.challenge.end_date < todayKey() ? data.challenge.end_date : todayKey();
    const e = parseKey(end);
    return { min: s.getFullYear() * 12 + s.getMonth(), max: e.getFullYear() * 12 + e.getMonth() };
  }, [data]);

  const cursorIdx = monthCursor.y * 12 + monthCursor.m;
  const shiftMonth = (n: number) => {
    if (!monthBounds) return;
    const next = Math.min(monthBounds.max, Math.max(monthBounds.min, cursorIdx + n));
    setMonthCursor({ y: Math.floor(next / 12), m: next % 12 });
  };

  const today = todayKey();
  const s = data?.stats;

  return (
    <div className="space-y-5 md:grid md:grid-cols-[290px_minmax(0,1fr)] md:items-start md:gap-6 md:space-y-0">
      <header className="pt-1 md:col-span-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-bone-600">How am I doing?</p>
        <h1 className="font-display mt-1 text-[26px] font-extrabold tracking-tight text-bone-100 md:text-[32px]">Progress</h1>
      </header>

      {/* challenge selector */}
      <div className="flex gap-2 overflow-x-auto pb-1 md:col-span-2" style={{ scrollbarWidth: "none" }}>
        {joined?.map((c) => (
          <button
            key={c.challenge.challenge_id}
            onClick={() => setSelected(c.challenge.challenge_id)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
              selected === c.challenge.challenge_id
                ? "border-ember-400 bg-ember-500/15 text-ember-300"
                : "border-ink-500 text-bone-500 hover:border-ember-400/50 hover:text-ember-300"
            }`}
          >
            {c.challenge.name}
          </button>
        ))}
        {joined && joined.length === 0 && (
          <p className="text-sm font-semibold text-bone-600">Join a challenge to see progress here.</p>
        )}
      </div>

      {!data && joined && joined.length > 0 && (
        <div className={`${cardCls} animate-pulse p-5`}>
          <div className="h-24 rounded-xl bg-ink-700" />
        </div>
      )}

      {data && s && (
        <>
          {/* streak hero */}
          <Reveal className="md:col-start-1 md:row-start-2">
            <div className={`${cardCls} relative overflow-hidden p-5`}>
              <span className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(26rem 14rem at 8% -30%, rgba(255,122,51,0.16), transparent 60%)" }} />
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-bone-600">{data.challenge.name}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <StreakFlame value={s.currentStreak} size="lg" />
                    <span className="text-[12px] font-bold uppercase tracking-wider text-bone-500">
                      current
                      <br />
                      streak
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-display text-3xl font-extrabold text-gold-300">{s.bestStreak}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-bone-600">🏆 best streak</p>
                </div>
              </div>
            </div>
          </Reveal>

          {/* stat tiles */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:col-start-1 md:row-start-3">
            <StatTile label="Completion" value={s.applicableDays > 0 ? s.completionPct : 0} suffix={s.applicableDays > 0 ? "%" : ""} tone="text-leaf-300" delay={0} />
            <StatTile label="Tasks done" value={s.done} delay={50} />
            <StatTile label="Missed" value={s.missed} tone={s.missed > 0 ? "text-coral-300" : undefined} delay={100} />
            <StatTile label="Vacations" value={s.vacations} tone="text-gold-300" delay={150} />
            <StatTile label="Time logged" value={Math.round(s.totalMinutes / 60)} suffix="h" delay={200} />
            <StatTile label="Minutes" value={s.totalMinutes % 60} suffix="m" delay={230} />
            <StatTile label="Penalty points" value={s.penalties} tone={s.penalties > 0 ? "text-coral-300" : "text-leaf-300"} delay={260} />
            <StatTile label="Perfect weeks" value={s.perfectWeeks} tone="text-gold-300" delay={290} />
          </div>

          {/* calendar (README §15) */}
          <Reveal delay={80} className="md:col-start-2 md:row-span-2 md:row-start-2">
            <section className={`${cardCls} p-5`}>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-extrabold text-bone-100">{fmtMonthYear(monthCursor.y, monthCursor.m)}</h2>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => shiftMonth(-1)}
                    disabled={monthBounds !== null && cursorIdx <= monthBounds.min}
                    aria-label="Previous month"
                    className="rounded-lg border border-ink-600 p-1.5 text-bone-400 transition hover:border-ember-400/60 hover:text-ember-300 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => shiftMonth(1)}
                    disabled={monthBounds !== null && cursorIdx >= monthBounds.max}
                    aria-label="Next month"
                    className="rounded-lg border border-ink-600 p-1.5 text-bone-400 transition hover:border-ember-400/60 hover:text-ember-300 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4 rotate-180" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <span key={i} className="text-[10px] font-bold uppercase tracking-wider text-bone-600">
                    {d}
                  </span>
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-7 gap-1.5">
                {cells.map((k, i) =>
                  k ? (
                    <div
                      key={k}
                      title={`${fmtDay(k)} — ${data.statuses[k] ?? (k > today ? "Upcoming" : "Not enrolled")}`}
                      className={`flex aspect-square items-center justify-center rounded-[8px] border text-[11px] font-bold transition-all duration-150 hover:scale-110 ${
                        data.statuses[k]
                          ? CELL[data.statuses[k]]
                          : "border-ink-700 bg-ink-900/60 text-bone-600"
                      } ${k === today ? "ring-2 ring-ember-400/80" : ""} ${data.statuses[k] ? "text-onaccent" : ""}`}
                      style={{ animation: "fade-in 0.45s ease both", animationDelay: `${i * 9}ms` }}
                    >
                      {Number(k.slice(8))}
                    </div>
                  ) : (
                    <div key={`x${i}`} />
                  ),
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-bold text-bone-500">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px] bg-leaf-500/75" /> Done</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px] bg-coral-500/70" /> Missed</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px] bg-gold-400/70" /> Vacation</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[4px] border border-ink-500 bg-ink-800" /> Pending</span>
              </div>
            </section>
          </Reveal>

          {/* friend progress (README §15) */}
          <Reveal delay={140} className="md:col-span-2">
            <section className={`${cardCls} p-5`}>
              <h2 className="font-display text-lg font-extrabold text-bone-100">Friend progress</h2>
              <p className="mt-0.5 text-[12px] font-semibold text-bone-600">Anonymous participants stay hidden</p>
              {data.friends.length <= 1 ? (
                <p className="mt-4 text-sm font-semibold text-bone-600">No visible friends in this challenge yet.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_3.2rem_3rem_3rem_2.6rem] items-center gap-2 px-3 text-[9.5px] font-bold uppercase tracking-[0.14em] text-bone-600">
                    <span>Friend</span>
                    <span className="text-right">Done</span>
                    <span className="text-right">Streak</span>
                    <span className="text-right">Best</span>
                    <span className="text-right">Pen.</span>
                  </div>
                  {data.friends.map((f, i) => (
                    <div
                      key={f.user_id}
                      className={`grid grid-cols-[minmax(0,1fr)_3.2rem_3rem_3rem_2.6rem] items-center gap-2 rounded-[13px] border px-3 py-2.5 transition-all duration-200 hover:-translate-y-px ${
                        f.isYou ? "border-ember-400/50 bg-ember-500/8" : "border-ink-600 bg-ink-900 hover:border-ink-500"
                      }`}
                      style={{ animation: "fade-in 0.45s ease both", animationDelay: `${i * 60}ms` }}
                    >
                      <div className="min-w-0">
                        <p className={`flex items-center gap-2 truncate text-sm font-bold capitalize ${f.isYou ? "text-ember-300" : "text-bone-100"}`}>
                          <span
                            className={`font-display flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-extrabold uppercase ${
                              f.isYou ? "border-ember-400/60 bg-ember-500/15 text-ember-300" : "border-ink-500 bg-ink-800 text-bone-400"
                            }`}
                          >
                            {f.username.slice(0, 1)}
                          </span>
                          <span className="truncate">{f.username}</span>
                          {f.isYou && (
                            <span className="shrink-0 rounded-full bg-ember-500/15 px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-ember-300">
                              you
                            </span>
                          )}
                        </p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-leaf-600 to-leaf-400 transition-all duration-700"
                            style={{ width: `${f.completionPct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-right font-display text-[14px] font-extrabold text-leaf-300">{f.completionPct}%</span>
                      <span className="text-right font-display text-[14px] font-extrabold text-ember-300">{f.streak}</span>
                      <span className="text-right font-display text-[14px] font-extrabold text-gold-300">{f.best}</span>
                      <span className={`text-right font-display text-[14px] font-extrabold ${f.penalties > 0 ? "text-coral-300" : "text-bone-500"}`}>
                        {f.penalties}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </Reveal>

          <Reveal delay={180}>
            <p className="flex items-center gap-2 px-1 text-[12px] font-semibold text-bone-600">
              <FlameFill className="h-3.5 w-3.5 text-ember-500" />
              Total effort across this challenge: {fmtMinutes(s.totalMinutes)} of deliberate practice.
            </p>
          </Reveal>
        </>
      )}
    </div>
  );
}
