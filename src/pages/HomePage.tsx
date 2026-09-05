import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type HomeData, type TaskView } from "../services/api";
import type { User } from "../types";
import {
  ConfettiLayer,
  Field,
  Modal,
  Reveal,
  StatusChip,
  StreakFlame,
  btnGhost,
  btnGold,
  btnSolid,
  cardCls,
  inputCls,
  useScramble,
  useToast,
} from "../components/ui";
import {
  BellIcon,
  CheckIcon,
  CHALLENGE_ICONS,
  ClockIcon,
  FlameFill,
  ShuffleIcon,
  UmbrellaIcon,
  XIcon,
} from "../components/icons";
import { dismissAnnouncement, dismissedAnnouncements, notifyPermission, requestNotifyPermission } from "../utils/notify";
import {
  WEEKDAY_FULL,
  fmtDay,
  fmtDayLong,
  fmtMinutes,
  greeting,
  minutesUntilDeadline,
  todayKey,
  weekdayOf,
} from "../utils/dates";

const ICON_TINT: Record<string, string> = {
  book: "border-ember-500/35 bg-ember-500/12 text-ember-400",
  code: "border-leaf-500/35 bg-leaf-500/12 text-leaf-400",
  language: "border-gold-500/35 bg-gold-400/12 text-gold-400",
  run: "border-coral-500/35 bg-coral-500/12 text-coral-400",
  study: "border-leaf-500/35 bg-leaf-500/12 text-leaf-300",
  write: "border-bone-500/30 bg-ink-700 text-bone-300",
  goal: "border-ember-500/35 bg-ember-500/12 text-ember-300",
};

function timeLeft(deadline: string) {
  const m = minutesUntilDeadline(deadline);
  if (m <= 0) return null;
  return m < 60 ? `${m}m left` : `${Math.floor(m / 60)}h ${m % 60}m left`;
}

function QuoteCard({
  quote,
  onShuffle,
}: {
  quote: HomeData["quote"];
  onShuffle: () => void;
}) {
  const text = useScramble(quote.text);
  return (
    <div className={`${cardCls} relative overflow-hidden p-5`}>
      <span className="font-display pointer-events-none absolute -top-5 left-2 text-[92px] font-extrabold leading-none text-ember-500/15">
        “
      </span>
      <p className="font-display relative min-h-[3.4rem] text-[19px] font-bold leading-snug text-bone-100">
        {text || "\u00A0"}
      </p>
      <div className="relative mt-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-bone-600">— {quote.author}</span>
        <button
          onClick={onShuffle}
          aria-label="Shuffle quote"
          className="rounded-lg border border-ink-600 p-2 text-bone-500 transition hover:rotate-180 hover:border-ember-400/60 hover:text-ember-300"
          style={{ transitionDuration: "450ms" }}
        >
          <ShuffleIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function TaskCard({
  view,
  onDone,
  onVacation,
  delay,
}: {
  view: TaskView;
  onDone: (v: TaskView) => void;
  onVacation: (v: TaskView) => void;
  delay: number;
}) {
  const ch = view.challenge;
  const Icon = CHALLENGE_ICONS[ch.icon];
  const isMainVacation = weekdayOf(todayKey()) === ch.main_vacation_day;
  const left = timeLeft(ch.deadline);

  return (
    <Reveal delay={delay}>
      <article
        className={`${cardCls} card-lift relative overflow-hidden p-5 ${
          view.status === "VACATION" ? "border-gold-500/35" : view.status === "DONE" ? "border-leaf-500/30" : ""
        }`}
      >
        {view.status === "DONE" && (
          <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-leaf-500/0 via-leaf-400 to-leaf-500/0" />
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border ${ICON_TINT[ch.icon]}`}>
              <Icon className="h-5.5 w-5.5" style={{ width: 22, height: 22 }} />
            </span>
            <div>
              <h3 className="font-display text-[17px] font-bold leading-tight text-bone-100">{ch.name}</h3>
              <p className="mt-0.5 text-xs font-semibold text-bone-600">
                {WEEKDAY_FULL[weekdayOf(todayKey())]} · daily deadline {ch.deadline}
              </p>
            </div>
          </div>
          <div className="text-right">
            <StreakFlame value={view.streak} />
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-bone-600">day streak</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusChip status={view.status} label={view.status === "VACATION" && isMainVacation ? "Main vacation" : undefined} />
          {view.status === "PENDING" && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${left ? "text-bone-500" : "text-coral-300"}`}>
              <ClockIcon className="h-3.5 w-3.5" />
              {left ? `${left} · deadline ${ch.deadline}` : `Deadline ${ch.deadline} passed`}
            </span>
          )}
          {view.status === "DONE" && view.completion?.duration != null && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-leaf-300">
              <ClockIcon className="h-3.5 w-3.5" /> {fmtMinutes(view.completion.duration)} logged
            </span>
          )}
          {view.penalties > 0 && (
            <span className="inline-flex items-center rounded-full border border-coral-500/40 bg-coral-500/10 px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.12em] text-coral-300">
              ⚠ {view.penalties} penalty{view.penalties > 1 ? " points" : " point"}
            </span>
          )}
        </div>

        {view.status === "PENDING" && (
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2.5">
            <button onClick={() => onDone(view)} className={btnSolid}>
              <CheckIcon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} /> Done
            </button>
            <button
              onClick={() => onVacation(view)}
              disabled={view.optLeft <= 0 || view.deadlineOver}
              title={view.optLeft <= 0 ? "No optional vacations left this week" : undefined}
              className={btnGold}
            >
              <UmbrellaIcon className="h-4 w-4" /> Vacation
              <span className="rounded-full bg-gold-400/15 px-1.5 py-0.5 text-[10px] font-extrabold">{view.optLeft} left</span>
            </button>
          </div>
        )}

        {view.status === "VACATION" && (
          <div className="mt-4 flex items-center gap-2.5 rounded-[12px] border border-gold-500/30 bg-gold-400/8 px-3.5 py-3 text-[13px] font-semibold text-gold-300">
            <UmbrellaIcon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
            {isMainVacation
              ? `Main vacation day (${WEEKDAY_FULL[ch.main_vacation_day]}) — your streak is protected automatically.`
              : "Optional vacation used — your streak is protected."}
          </div>
        )}

        {view.status === "DONE" && (
          <div className="mt-4 rounded-[12px] border border-leaf-500/25 bg-leaf-500/8 px-3.5 py-3">
            <p className="flex items-center gap-2 text-[13px] font-bold text-leaf-300">
              <CheckIcon className="h-4 w-4" /> Task completed{view.completion?.duration ? ` · ${fmtMinutes(view.completion.duration)}` : ""}
            </p>
            {view.completion?.summary && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-bone-300">“{view.completion.summary}”</p>
            )}
          </div>
        )}

        {view.status === "MISSED" && (
          <div className="mt-4 flex items-center gap-2.5 rounded-[12px] border border-coral-500/30 bg-coral-500/8 px-3.5 py-3 text-[13px] font-semibold text-coral-300">
            Missed the {ch.deadline} deadline — {ch.penalty_points} penalty point{ch.penalty_points > 1 ? "s" : ""} recorded.
          </div>
        )}
      </article>
    </Reveal>
  );
}

export default function HomePage({
  user,
  onOpenChallenge,
  onGoChallenges,
  onGoProfile,
}: {
  user: User;
  onOpenChallenge: (id: string) => void;
  onGoChallenges: () => void;
  onGoProfile: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<HomeData | null>(null);
  const [quote, setQuote] = useState<HomeData["quote"] | null>(null);
  const [completeFor, setCompleteFor] = useState<TaskView | null>(null);
  const [vacationFor, setVacationFor] = useState<TaskView | null>(null);
  const [duration, setDuration] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [hiddenAnns, setHiddenAnns] = useState<string[]>(() => dismissedAnnouncements());

  const bellTap = async () => {
    const perm = notifyPermission();
    if (perm === "unsupported") {
      toast.push("This browser doesn't support OS notifications.", "warn");
      return;
    }
    if (perm === "granted") {
      toast.push("OS notifications are already on.", "info");
      return;
    }
    if (perm === "denied") {
      toast.push("Notifications are blocked — allow them in your browser's site settings.", "warn");
      return;
    }
    const res = await requestNotifyPermission();
    toast.push(
      res === "granted"
        ? "OS notifications enabled — reminders, broadcasts and friend activity will pop up."
        : "Permission not granted — you can retry from Profile.",
      res === "granted" ? "success" : "warn",
    );
  };

  const hideAnn = (id: string) => {
    dismissAnnouncement(id);
    setHiddenAnns((v) => [...v, id]);
  };

  const load = useCallback(() => {
    api.getHome(user.user_id).then((d) => {
      setData(d);
      setQuote(d.quote);
    });
  }, [user.user_id]);

  useEffect(load, [load]);

  const saveCompletion = async (e: FormEvent) => {
    e.preventDefault();
    if (!completeFor) return;
    setBusy(true);
    try {
      const res = await api.completeTask(user.user_id, completeFor.challenge.challenge_id, {
        duration: duration ? Math.max(1, Number(duration)) : null,
        summary: summary.trim() || null,
      });
      setConfettiKey((k) => k + 1);
      toast.push("Task completed — streak updated! 🎉");
      if (res.newAchievements.length) {
        setTimeout(() => toast.push(`Achievement unlocked: ${res.newAchievements.join(", ")}`, "info"), 700);
      }
      setCompleteFor(null);
      setDuration("");
      setSummary("");
      load();
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : "Could not save.", "warn");
    } finally {
      setBusy(false);
    }
  };

  const confirmVacation = async () => {
    if (!vacationFor) return;
    setBusy(true);
    try {
      await api.takeVacation(user.user_id, vacationFor.challenge.challenge_id);
      toast.push("Vacation logged — your streak is protected 🏖️", "info");
      setVacationFor(null);
      load();
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : "Could not apply vacation.", "warn");
    } finally {
      setBusy(false);
    }
  };

  const pending = data?.tasks.filter((t) => t.status === "PENDING").length ?? 0;
  const missedToday = data?.tasks.filter((t) => t.status === "MISSED").length ?? 0;
  const allClear = data && data.tasks.length > 0 && pending === 0 && missedToday === 0;

  return (
    <div className="space-y-5 md:grid md:grid-cols-[minmax(0,1fr)_280px] md:items-start md:gap-6 md:space-y-0">
      <ConfettiLayer fireKey={confettiKey} />

      {/* header */}
      <header className="flex items-center justify-between gap-3 pt-1 md:col-span-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-bone-600">{fmtDayLong(todayKey())}</p>
          <h1 className="font-display mt-1 text-[26px] font-extrabold tracking-tight text-bone-100 md:text-[32px]">
            {greeting()}, <span className="text-ember-400">{user.username}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={bellTap}
            aria-label="Enable OS notifications"
            title={notifyPermission() === "granted" ? "OS notifications on" : "Enable OS notifications"}
            className="relative rounded-[12px] border border-ink-600 bg-ink-850 p-2.5 text-bone-400 transition hover:border-ember-400/60 hover:text-ember-300"
          >
            <BellIcon className="h-5 w-5" />
            {notifyPermission() !== "granted" && (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-ember-400" />
            )}
          </button>
          <button
            onClick={onGoProfile}
            aria-label="Profile"
            className="font-display flex h-10 w-10 items-center justify-center rounded-[12px] border border-ink-500 bg-ink-700 text-sm font-extrabold uppercase text-ember-300 transition hover:border-ember-400/70"
          >
            {user.username.slice(0, 2)}
          </button>
        </div>
      </header>

      {quote && (
        <Reveal className="md:sticky md:top-6 md:col-start-2 md:row-start-1">
          <QuoteCard
            quote={quote}
            onShuffle={() => api.getQuote().then(setQuote)}
          />
        </Reveal>
      )}

      {/* today strip */}
      {data && (
        <Reveal delay={60} className="md:col-start-1 md:row-start-1">
          <div className="flex items-center justify-between rounded-[14px] border border-ink-600 bg-ink-800/70 px-4 py-3">
            <span className="flex items-center gap-2 text-[13px] font-bold text-bone-300">
              <FlameFill className="h-4 w-4 text-ember-500" />
              {pending > 0
                ? `${pending} task${pending > 1 ? "s" : ""} pending today`
                : data.tasks.length > 0
                  ? missedToday > 0
                    ? "Deadline passed — tomorrow is a new day"
                    : "Nothing left to do today"
                  : "No live challenges yet"}
            </span>
            {data.totalPenalties > 0 && (
              <button
                onClick={() => {
                  const withPenalty = data.tasks.find((t) => t.penalties > 0);
                  if (withPenalty) onOpenChallenge(withPenalty.challenge.challenge_id);
                }}
                title="Open the challenge to decrease penalties"
                className="rounded-full border border-coral-500/40 bg-coral-500/10 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-coral-300 transition hover:border-coral-400/70 hover:bg-coral-500/20 active:scale-95"
              >
                {data.totalPenalties} penalty pts · manage
              </button>
            )}
          </div>
        </Reveal>
      )}

      {/* owner broadcasts (README-style announcements feed) */}
      {data && data.announcements.filter((a) => !hiddenAnns.includes(a.announcement_id)).length > 0 && (
        <Reveal delay={90} className="md:col-start-2 md:row-start-2">
          <section className="space-y-2.5">
            <h2 className="font-display flex items-center gap-2 text-[15px] font-extrabold text-bone-100">
              <BellIcon className="h-4 w-4 text-ember-400" /> From your owners
            </h2>
            {data.announcements
              .filter((a) => !hiddenAnns.includes(a.announcement_id))
              .map((a) => (
                <div
                  key={a.announcement_id}
                  className="relative overflow-hidden rounded-[14px] border border-ember-500/30 bg-gradient-to-br from-ember-500/10 via-ink-850 to-ink-850 p-4 pr-10"
                >
                  <span className="absolute inset-y-0 left-0 w-[3px] bg-ember-500/70" />
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ember-300/90">
                    {a.challengeName} · {a.fromName}
                  </p>
                  <p className="mt-1.5 text-[13.5px] font-semibold leading-relaxed text-bone-100">{a.message}</p>
                  <p className="mt-1 text-[10.5px] font-semibold text-bone-600">{fmtDay(a.createdAt)}</p>
                  <button
                    onClick={() => hideAnn(a.announcement_id)}
                    aria-label="Dismiss"
                    className="absolute right-2.5 top-2.5 rounded-lg border border-ink-600 p-1 text-bone-600 transition hover:border-coral-400/60 hover:text-coral-300"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
          </section>
        </Reveal>
      )}

      {/* loading skeleton */}
      {!data && (
        <div className="space-y-4 md:col-start-1 md:row-start-2">
          {[0, 1].map((i) => (
            <div key={i} className={`${cardCls} animate-pulse p-5`}>
              <div className="h-11 w-2/3 rounded-lg bg-ink-700" />
              <div className="mt-4 h-4 w-1/3 rounded bg-ink-700" />
              <div className="mt-4 h-10 rounded-[10px] bg-ink-700" />
            </div>
          ))}
        </div>
      )}

      {/* task cards */}
      <section className="space-y-4 md:col-start-1 md:row-start-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-extrabold text-bone-100">Today’s challenges</h2>
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-bone-600">
            {data ? `${data.tasks.length} live` : "…"}
          </span>
        </div>

        {data?.tasks.map((v, i) => (
          <div key={v.challenge.challenge_id} onClick={() => v.status !== "PENDING" && onOpenChallenge(v.challenge.challenge_id)} className={v.status !== "PENDING" ? "cursor-pointer" : ""}>
            <TaskCard view={v} onDone={setCompleteFor} onVacation={setVacationFor} delay={i * 80} />
          </div>
        ))}

        {data && data.tasks.length === 0 && (
          <Reveal>
            <div className={`${cardCls} p-6 text-center`}>
              <p className="font-display text-lg font-bold text-bone-100">No live challenges yet</p>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-bone-500">
                Join a challenge and it will show up here every morning with one simple question: done, or vacation?
              </p>
              <button onClick={onGoChallenges} className={`${btnSolid} mt-5`}>
                Browse challenges
              </button>
            </div>
          </Reveal>
        )}

        {allClear && (
          <Reveal>
            <div className="relative overflow-hidden rounded-[16px] border border-leaf-500/35 bg-gradient-to-br from-leaf-500/12 via-ink-850 to-ink-850 p-5">
              <p className="font-display text-lg font-extrabold text-leaf-300">All clear for today 🎉</p>
              <p className="mt-1 text-sm text-bone-500">Every applicable task is handled. See you tomorrow — same time, same streak.</p>
            </div>
          </Reveal>
        )}
      </section>

      {/* completion modal */}
      <Modal open={!!completeFor} onClose={() => !busy && setCompleteFor(null)} title="Task Completed! 🎉">
        <form onSubmit={saveCompletion} className="space-y-4">
          <Field label="How long did you spend?" hint="optional">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={600}
                className={inputCls}
                placeholder="45"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
              <span className="shrink-0 text-sm font-semibold text-bone-500">minutes</span>
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            {[15, 30, 45, 60, 90].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDuration(String(m))}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  duration === String(m)
                    ? "border-ember-400 bg-ember-500/15 text-ember-300"
                    : "border-ink-500 text-bone-500 hover:border-ember-400/50 hover:text-ember-300"
                }`}
              >
                {m}m
              </button>
            ))}
          </div>
          <Field label={completeFor?.challenge.icon === "book" ? "What did you read?" : "Anything to note?"} hint="optional">
            <textarea
              className={`${inputCls} min-h-[88px] resize-y`}
              placeholder="Optional summary…"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          <p className="text-[12px] leading-relaxed text-bone-600">
            Both fields are optional — the task counts as completed either way.
          </p>
          <button type="submit" disabled={busy} className={`${btnSolid} w-full`}>
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      </Modal>

      {/* vacation modal */}
      <Modal open={!!vacationFor} onClose={() => !busy && setVacationFor(null)} title="Mark as vacation">
        {vacationFor && (
          <div className="space-y-4">
            <div className="rounded-[12px] border border-gold-500/35 bg-gold-400/10 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold-300/80">This week</p>
              <p className="font-display mt-1 text-2xl font-extrabold text-gold-300">
                {vacationFor.optLeft} optional vacation{vacationFor.optLeft === 1 ? "" : "s"} remaining
              </p>
            </div>
            <p className="text-sm leading-relaxed text-bone-300">
              Mark today as vacation for <strong className="text-bone-100">{vacationFor.challenge.name}</strong>? No task
              required, no penalty, streak stays alive. It counts against your weekly allowance of{" "}
              {vacationFor.challenge.optional_vacations_per_week}.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button className={btnGhost} onClick={() => setVacationFor(null)}>
                Cancel
              </button>
              <button className={btnGold} onClick={confirmVacation} disabled={busy}>
                <UmbrellaIcon className="h-4 w-4" /> Confirm vacation
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
