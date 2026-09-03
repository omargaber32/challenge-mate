import { useCallback, useEffect, useState } from "react";
import { api, type DetailData } from "../services/api";
import type { User } from "../types";
import { Reveal, StatusChip, StreakFlame, btnGhost, btnSolid, cardCls, useCountUp, useToast } from "../components/ui";
import { CHALLENGE_ICONS, CheckIcon, ChevronLeft, UmbrellaIcon, UsersIcon } from "../components/icons";
import { fmtDay, fmtRange, WEEKDAY_FULL } from "../utils/dates";

function StatTile({ label, value, suffix, tone }: { label: string; value: number; suffix?: string; tone?: string }) {
  const v = useCountUp(value);
  return (
    <div className="rounded-[14px] border border-ink-600 bg-ink-850 p-3.5 text-center">
      <p className={`font-display text-[26px] font-extrabold leading-none ${tone ?? "text-bone-100"}`}>
        {v}
        {suffix && <span className="text-sm font-bold text-bone-500">{suffix}</span>}
      </p>
      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-bone-600">{label}</p>
    </div>
  );
}

const MEDALS = [
  "border-gold-400/60 bg-gold-400/15 text-gold-300",
  "border-bone-300/50 bg-bone-300/10 text-bone-300",
  "border-ember-600/60 bg-ember-600/15 text-ember-300",
];

export default function ChallengeDetailPage({
  user,
  challengeId,
  onBack,
}: {
  user: User;
  challengeId: string;
  onBack: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<DetailData | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.getChallengeDetail(user.user_id, challengeId).then(setData);
  }, [user.user_id, challengeId]);
  useEffect(load, [load]);

  const enroll = async (anonymous: boolean) => {
    setBusy(true);
    try {
      await api.enroll(challengeId, user.user_id, anonymous);
      toast.push(anonymous ? "Joined anonymously 🎭" : "Enrolled — rules accepted. Good luck!");
      load();
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : "Could not enroll.", "warn");
    } finally {
      setBusy(false);
    }
  };

  const forgive = async (date: string) => {
    setBusy(true);
    try {
      await api.removePenalty(user.user_id, challengeId, date);
      toast.push(`Penalty for ${fmtDay(date)} removed (−${data?.challenge.penalty_points ?? 1} pt)`);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className={`${cardCls} animate-pulse p-5`}>
        <div className="h-10 w-1/2 rounded-lg bg-ink-700" />
        <div className="mt-4 h-24 rounded-xl bg-ink-700" />
      </div>
    );
  }

  const ch = data.challenge;
  const Icon = CHALLENGE_ICONS[ch.icon];
  const today = new Date();
  const ended = ch.end_date < `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] font-bold text-bone-500 transition hover:text-ember-300">
        <ChevronLeft className="h-4 w-4" /> All challenges
      </button>

      {/* header */}
      <Reveal>
        <header className={`${cardCls} relative overflow-hidden p-5`}>
          <span
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(24rem 12rem at 90% -20%, rgba(255,122,51,0.12), transparent 60%)" }}
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-ember-500/35 bg-ember-500/12 text-ember-400">
                <Icon className="h-6 w-6" />
              </span>
              <div>
                <h1 className="font-display text-[22px] font-extrabold leading-tight text-bone-100">{ch.name}</h1>
                <p className="mt-0.5 text-xs font-semibold text-bone-600">{fmtRange(ch.start_date, ch.end_date)}</p>
              </div>
            </div>
            <StatusChip status={ended ? "DONE" : "PENDING"} label={ended ? "Ended" : "Live"} />
          </div>
          <p className="relative mt-4 text-sm leading-relaxed text-bone-300">{ch.description}</p>
          <div className="relative mt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-bone-500">Rules you agreed to</p>
            <ol className="space-y-1.5">
              {ch.rules.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-bone-500">
                  <span className="font-display shrink-0 font-extrabold text-ember-400/80">{i + 1}.</span>
                  {r}
                </li>
              ))}
            </ol>
          </div>
          <div className="relative mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] font-semibold text-bone-600">
            <span>Deadline {ch.deadline}</span>
            <span>Penalty {ch.penalty_points} pt{ch.penalty_points > 1 ? "s" : ""}</span>
            <span className="inline-flex items-center gap-1 text-gold-300/90">
              <UmbrellaIcon className="h-3.5 w-3.5" /> {WEEKDAY_FULL[ch.main_vacation_day]} off
            </span>
            <span>{ch.optional_vacations_per_week} optional vac./week</span>
          </div>
        </header>
      </Reveal>

      {/* not a member → enroll inline */}
      {!data.member && !ended && (
        <Reveal delay={60}>
          <div className={`${cardCls} p-5`}>
            <p className="font-display text-lg font-bold text-bone-100">You’re not in this one yet</p>
            <p className="mt-1 text-sm text-bone-500">Read the rules above, accept them, and jump in.</p>
            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#FF7A33]" />
              <span className="text-[13.5px] font-semibold text-bone-300">I have read and accept the rules.</span>
            </label>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button className={btnSolid} disabled={!accepted || busy} onClick={() => enroll(false)}>
                Enroll
              </button>
              <button className={btnGhost} disabled={!accepted || busy} onClick={() => enroll(true)}>
                Anonymously
              </button>
            </div>
          </div>
        </Reveal>
      )}

      {/* my stats */}
      {data.myStats && (
        <Reveal delay={80}>
          <section>
            <h2 className="font-display mb-2.5 text-lg font-extrabold text-bone-100">Your numbers</h2>
            <div className="grid grid-cols-4 gap-2.5">
              <div className="rounded-[14px] border border-ink-600 bg-ink-850 p-3.5 text-center">
                <div className="flex justify-center"><StreakFlame value={data.myStats.currentStreak} /></div>
                <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-bone-600">Streak</p>
              </div>
              <StatTile label="Best" value={data.myStats.bestStreak} tone="text-gold-300" />
              <StatTile label="Done" value={data.myStats.done} tone="text-leaf-300" />
              <StatTile label="Penalty" value={data.myStats.penalties} tone={data.myStats.penalties > 0 ? "text-coral-300" : "text-bone-100"} />
            </div>
          </section>
        </Reveal>
      )}

      {/* week strip (README §10) */}
      {data.member && (
        <Reveal delay={120}>
          <section className={`${cardCls} p-5`}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-extrabold text-bone-100">This week</h2>
              <span className="text-[11.5px] font-bold text-bone-600">
                Optional vacations left: <span className="text-gold-300">{data.optLeft}</span>
              </span>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1.5">
              {data.week.map((d) => (
                <div
                  key={d.key}
                  className={`flex flex-col items-center gap-1.5 rounded-[11px] border py-2.5 ${
                    d.isToday ? "border-ember-400/70 bg-ember-500/10" : d.isMain ? "border-gold-500/40 bg-gold-400/8" : "border-ink-600 bg-ink-900"
                  }`}
                >
                  <span className={`text-[9.5px] font-bold uppercase tracking-wider ${d.isToday ? "text-ember-300" : "text-bone-600"}`}>{d.label}</span>
                  <span className="font-display text-sm font-extrabold text-bone-100">{d.dayNum}</span>
                  {d.status === "DONE" && <CheckIcon className="h-3.5 w-3.5 text-leaf-400" />}
                  {d.status === "MISSED" && <span className="h-3.5 w-3.5 rounded-full border-2 border-coral-400" style={{ borderTop: 0, transform: "rotate(45deg) scale(0.72)", borderRadius: 2 }} />}
                  {d.status === "VACATION" && <UmbrellaIcon className="h-3.5 w-3.5 text-gold-400" />}
                  {d.status === "PENDING" && <span className={`h-1.5 w-1.5 rounded-full ${d.isToday ? "bg-ember-400" : "bg-ink-500"}`} />}
                </div>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* leaderboard (README §16) */}
      <Reveal delay={160}>
        <section className={`${cardCls} p-5`}>
          <h2 className="font-display text-lg font-extrabold text-bone-100">Leaderboard</h2>
          <p className="mt-0.5 text-[12px] font-semibold text-bone-600">Ranked by current streak · anonymous participants excluded</p>
          <div className="mt-4 space-y-2">
            {data.leaderboard.length === 0 && (
              <p className="py-6 text-center text-sm font-semibold text-bone-600">No visible participants yet — be the first.</p>
            )}
            {data.leaderboard.map((row, i) => (
              <div
                key={row.user_id}
                className={`flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5 transition ${
                  row.isYou ? "border-ember-400/50 bg-ember-500/8" : "border-ink-600 bg-ink-900 hover:border-ink-500"
                }`}
              >
                <span className={`font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[13px] font-extrabold ${MEDALS[i] ?? "border-ink-500 text-bone-500"}`}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold capitalize text-bone-100">
                  {row.username}
                  {row.isYou && <span className="ml-2 rounded-full bg-ember-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-ember-300">you</span>}
                </span>
                <span className="text-right">
                  <StreakFlame value={row.streak} size="sm" />
                  <span className="block text-[9.5px] font-bold uppercase tracking-wider text-bone-600">best {row.best}</span>
                </span>
              </div>
            ))}
          </div>
          {data.iAmAnonymous && (
            <div className="mt-3 rounded-[12px] border border-gold-500/35 bg-gold-400/8 px-3.5 py-3 text-[12.5px] font-semibold text-gold-300">
              You participate anonymously — your row is hidden from others, but everything is still tracked for you.
            </div>
          )}
        </section>
      </Reveal>

      {/* participants */}
      <Reveal delay={200}>
        <section className={`${cardCls} p-5`}>
          <h2 className="font-display flex items-center gap-2 text-lg font-extrabold text-bone-100">
            <UsersIcon className="h-5 w-5 text-bone-500" /> Participants
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.participants.map((p) => (
              <span key={p.user_id} className={`rounded-full border px-3 py-1.5 text-xs font-bold capitalize ${p.isYou ? "border-ember-400/50 text-ember-300" : "border-ink-500 text-bone-300"}`}>
                {p.username}
                {p.role === "owner" && <span className="ml-1.5 text-[9.5px] uppercase tracking-wider text-bone-600">owner</span>}
              </span>
            ))}
            {data.hiddenCount > 0 && (
              <span className="rounded-full border border-gold-500/40 bg-gold-400/8 px-3 py-1.5 text-xs font-bold text-gold-300">
                +{data.hiddenCount} anonymous
              </span>
            )}
            {data.participants.length === 0 && data.hiddenCount === 0 && (
              <p className="text-sm font-semibold text-bone-600">Nobody yet — challenges can start empty and be discovered.</p>
            )}
          </div>
        </section>
      </Reveal>

      {/* penalty history (README §14) */}
      {data.member && (
        <Reveal delay={240}>
          <section className={`${cardCls} p-5`}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold text-bone-100">Penalty history</h2>
              <span className={`font-display text-2xl font-extrabold ${data.penalties.balance > 0 ? "text-coral-300" : "text-leaf-300"}`}>
                {data.penalties.balance} pt{data.penalties.balance === 1 ? "" : "s"}
              </span>
            </div>
            {data.penalties.events.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-bone-600">Clean sheet — no penalties so far. 🎯</p>
            ) : (
              <div className="mt-3 divide-y divide-ink-700">
                {data.penalties.events.map((ev, i) => (
                  <div key={`${ev.date}-${i}`} className="flex items-center gap-3 py-2.5">
                    <span className="w-14 shrink-0 text-[12px] font-bold text-bone-500">{fmtDay(ev.date)}</span>
                    <span className="flex-1 text-[13px] font-semibold text-bone-300">{ev.reason}</span>
                    <span className={`font-display text-sm font-extrabold ${ev.points > 0 ? "text-coral-300" : "text-leaf-300"}`}>
                      {ev.points > 0 ? `+${ev.points}` : ev.points}
                    </span>
                    {ev.removable && (
                      <button
                        onClick={() => forgive(ev.date)}
                        disabled={busy}
                        className="rounded-lg border border-ink-500 px-2.5 py-1 text-[11px] font-bold text-bone-400 transition hover:border-leaf-500/60 hover:text-leaf-300"
                      >
                        Forgive
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11.5px] leading-relaxed text-bone-600">
              Removals are kept as −point events so the history stays honest (README §14).
            </p>
          </section>
        </Reveal>
      )}
    </div>
  );
}
