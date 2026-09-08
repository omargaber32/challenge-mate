import { useCallback, useEffect, useState } from "react";
import { api, type DetailData } from "../services/api";
import type { User } from "../types";
import { Field, Modal, Reveal, StatusChip, StreakFlame, btnGhost, btnSolid, cardCls, inputCls, useCountUp, useToast } from "../components/ui";
import { BellIcon, CHALLENGE_ICONS, CheckIcon, ChevronLeft, LockIcon, UmbrellaIcon, UsersIcon, XIcon } from "../components/icons";
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

  // owner tools
  const [confirmKind, setConfirmKind] = useState<"end" | "delete" | null>(null);
  const [typedName, setTypedName] = useState("");
  const [showNotify, setShowNotify] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState("");
  const [notifyMode, setNotifyMode] = useState<"all" | "select">("all");
  const [notifySel, setNotifySel] = useState<string[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteSel, setInviteSel] = useState<string[]>([]);
  // member tools
  const [showLeave, setShowLeave] = useState(false);

  const load = useCallback(() => {
    api.getChallengeDetail(user.user_id, challengeId).then(setData);
  }, [user.user_id, challengeId]);
  useEffect(load, [load]);

  const runConfirm = async () => {
    if (!data) return;
    setBusy(true);
    try {
      if (confirmKind === "end") {
        await api.endChallenge(user.user_id, challengeId, typedName);
        toast.push(`“${data.challenge.name}” ended — results are preserved.`, "info");
      } else {
        await api.deleteChallenge(user.user_id, challengeId, typedName);
        toast.push(`“${data.challenge.name}” deleted permanently.`, "info");
      }
      setConfirmKind(null);
      setTypedName("");
      onBack();
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : "Action failed.", "warn");
    } finally {
      setBusy(false);
    }
  };

  const runNotify = async () => {
    setBusy(true);
    try {
      const targets = notifyMode === "all" ? "all" : notifySel;
      await api.notifyParticipants(user.user_id, challengeId, notifyMsg, targets);
      toast.push(notifyMode === "all" ? "Broadcast sent to all participants 📣" : `Sent to ${notifySel.length} participant${notifySel.length === 1 ? "" : "s"} 📣`);
      setShowNotify(false);
      setNotifyMsg("");
      setNotifySel([]);
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : "Could not send.", "warn");
    } finally {
      setBusy(false);
    }
  };

  const runInvite = async () => {
    setBusy(true);
    try {
      const res = await api.sendInvite(user.user_id, challengeId, inviteSel);
      toast.push(`${res.sent} invite${res.sent === 1 ? "" : "s"} sent — they'll see it on the Challenges tab.`);
      setShowInvite(false);
      setInviteSel([]);
      load();
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : "Could not send invites.", "warn");
    } finally {
      setBusy(false);
    }
  };

  const runRemove = async (targetId: string, name: string) => {
    setBusy(true);
    try {
      await api.removeParticipant(user.user_id, challengeId, targetId);
      toast.push(`${name} removed from the challenge.`, "info");
      load();
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : "Could not remove.", "warn");
    } finally {
      setBusy(false);
    }
  };

  const runLeave = async () => {
    setBusy(true);
    try {
      await api.leaveChallenge(user.user_id, challengeId);
      toast.push(`You left ${data?.challenge.name ?? "the challenge"}.`, "info");
      setShowLeave(false);
      onBack();
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : "Could not leave.", "warn");
    } finally {
      setBusy(false);
    }
  };

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

  const decrease = async () => {
    setBusy(true);
    try {
      await api.decreasePenalty(user.user_id, challengeId);
      toast.push(`Penalty decreased by ${data?.challenge.penalty_points ?? 1} pt — history updated`);
      load();
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : "Could not decrease penalty.", "warn");
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
                <h1 className="font-display text-[22px] font-extrabold leading-tight text-bone-100 md:text-[27px]">{ch.name}</h1>
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
            {ch.hidden && (
              <span className="inline-flex items-center gap-1 text-gold-300">
                <LockIcon className="h-3.5 w-3.5" /> Hidden · invite-only
              </span>
            )}
          </div>
        </header>
      </Reveal>

      {/* owner management panel */}
      {data.owner && (
        <Reveal delay={40}>
          <section className={`${cardCls} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-ink-700 bg-ink-800/60 px-5 py-3">
              <h2 className="font-display flex items-center gap-2 text-[15px] font-extrabold text-bone-100">
                <LockIcon className="h-4 w-4 text-ember-400" /> Owner tools
              </h2>
              <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-bone-600">you own this challenge</span>
            </div>
            <div className="grid gap-2.5 p-5 sm:grid-cols-2">
              <button className={btnSolid} onClick={() => { setShowNotify(true); setNotifyMode("all"); }}>
                <BellIcon className="h-4 w-4" /> Notify participants
              </button>
              <button className={btnGhost} onClick={() => { setShowInvite(true); setInviteSel(data.pendingInvites.map((u) => u.user_id)); }}>
                <UsersIcon className="h-4 w-4" /> Invite people
              </button>
              <button className={btnGhost} disabled={ended} onClick={() => { setConfirmKind("end"); setTypedName(""); }}>
                End challenge now
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-coral-500/50 bg-coral-500/10 px-4 py-3 text-sm font-bold text-coral-300 transition hover:bg-coral-500/20 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
                onClick={() => { setConfirmKind("delete"); setTypedName(""); }}
              >
                <XIcon className="h-4 w-4" /> Delete challenge
              </button>
            </div>
            <p className="border-t border-ink-700 px-5 py-2.5 text-[11px] font-semibold leading-relaxed text-bone-600">
              Broadcasts have a 12-hour slow mode. Ending keeps all history; deleting wipes every row this challenge wrote.
            </p>
          </section>
        </Reveal>
      )}

      {/* member → leave */}
      {data.member && !data.owner && (
        <Reveal delay={40}>
          <button
            onClick={() => setShowLeave(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] border border-coral-500/40 bg-coral-500/8 px-4 py-3 text-sm font-bold text-coral-300 transition hover:bg-coral-500/15 active:scale-[0.98]"
          >
            Leave this challenge
          </button>
        </Reveal>
      )}

      {/* not a member → enroll inline */}
      {!data.member && !ended && (
        <Reveal delay={60}>
          <div className={`${cardCls} p-5`}>
            <p className="font-display text-lg font-bold text-bone-100">You’re not in this one yet</p>
            <p className="mt-1 text-sm text-bone-500">Read the rules above, accept them, and jump in.</p>
            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 accent-(--color-ember-500)" />
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
              <span key={p.user_id} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold capitalize ${p.isYou ? "border-ember-400/50 text-ember-300" : "border-ink-500 text-bone-300"}`}>
                {p.username}
                {p.role === "owner" && <span className="text-[9.5px] uppercase tracking-wider text-bone-600">owner</span>}
                {data.owner && !p.isYou && (
                  <button
                    onClick={() => runRemove(p.user_id, p.username)}
                    disabled={busy}
                    aria-label={`Remove ${p.username}`}
                    title={`Remove ${p.username} from this challenge`}
                    className="rounded-full border border-ink-500 p-0.5 text-bone-500 transition hover:border-coral-400/70 hover:text-coral-300 active:scale-90 disabled:opacity-40"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                )}
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
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-extrabold text-bone-100">Penalty history</h2>
              <div className="flex items-center gap-2.5">
                <span className={`font-display text-2xl font-extrabold ${data.penalties.balance > 0 ? "text-coral-300" : "text-leaf-300"}`}>
                  {data.penalties.balance} pt{data.penalties.balance === 1 ? "" : "s"}
                </span>
                <button
                  onClick={decrease}
                  disabled={busy || data.penalties.balance === 0}
                  title="Decrease your penalty balance by one step"
                  className="rounded-[10px] border border-coral-500/45 bg-coral-500/10 px-3 py-1.5 text-[11.5px] font-extrabold text-coral-300 transition hover:border-coral-400/70 hover:bg-coral-500/20 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
                >
                  − Decrease
                </button>
              </div>
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
              Use <strong className="text-coral-300/90">− Decrease</strong> to lower your balance, or forgive a specific
              missed day. Every reduction is kept as a −point event so the history stays honest (README §14).
            </p>
          </section>
        </Reveal>
      )}

      {/* end / delete confirmation — type the challenge name (README-style safety) */}
      <Modal
        open={confirmKind !== null}
        onClose={() => !busy && setConfirmKind(null)}
        title={confirmKind === "delete" ? "Delete challenge" : "End challenge now"}
      >
        {data && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-bone-300">
              {confirmKind === "delete" ? (
                <>This permanently deletes <strong className="text-bone-100">{data.challenge.name}</strong> and every
                task, vacation, penalty and invite it ever wrote to the sheet. There is no undo.</>
              ) : (
                <>This sets the end date of <strong className="text-bone-100">{data.challenge.name}</strong> to
                yesterday. Everything already recorded stays — leaderboards and penalties freeze as final results.</>
              )}
            </p>
            <Field label={`Type “${data.challenge.name}” to confirm`}>
              <input
                className={inputCls}
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={data.challenge.name}
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <button className={btnGhost} onClick={() => setConfirmKind(null)} disabled={busy}>
                Cancel
              </button>
              <button
                className={`inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-sm font-bold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${
                  confirmKind === "delete"
                    ? "bg-coral-500 text-onaccent hover:bg-coral-400"
                    : "bg-gold-400 text-onaccent hover:bg-gold-300"
                }`}
                onClick={runConfirm}
                disabled={busy || typedName !== data.challenge.name}
              >
                {busy ? "Working…" : confirmKind === "delete" ? "Delete forever" : "End now"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* notify participants (12h slow mode) */}
      <Modal open={showNotify} onClose={() => !busy && setShowNotify(false)} title="Notify participants">
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["all", "select"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setNotifyMode(m)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                  notifyMode === m
                    ? "border-ember-400 bg-ember-500/15 text-ember-300"
                    : "border-ink-500 text-bone-500 hover:text-bone-300"
                }`}
              >
                {m === "all" ? "Everyone" : "Pick participants"}
              </button>
            ))}
          </div>
          {notifyMode === "select" && (
            <div className="max-h-44 space-y-2 overflow-y-auto rounded-[12px] border border-ink-600 bg-ink-900 p-3">
              {data.participants.filter((p) => !p.isYou).length === 0 && (
                <p className="text-xs font-semibold text-bone-600">No other participants yet.</p>
              )}
              {data.participants.filter((p) => !p.isYou).map((p) => (
                <label key={p.user_id} className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-(--color-ember-500)"
                    checked={notifySel.includes(p.user_id)}
                    onChange={(e) =>
                      setNotifySel((v) => (e.target.checked ? [...v, p.user_id] : v.filter((x) => x !== p.user_id)))
                    }
                  />
                  <span className="text-sm font-semibold capitalize text-bone-300">{p.username}</span>
                </label>
              ))}
            </div>
          )}
          <Field label="Message">
            <textarea
              className={`${inputCls} min-h-[88px]`}
              value={notifyMsg}
              onChange={(e) => setNotifyMsg(e.target.value)}
              placeholder="e.g. New book starts Monday — 30 pages minimum this week!"
            />
          </Field>
          <p className="text-[11.5px] leading-relaxed text-bone-600">
            Recipients see this in their Home feed and get an OS notification (when enabled).
            <strong className="text-gold-300/90"> Slow mode:</strong> one broadcast per challenge every 12 hours.
          </p>
          <button
            className={`${btnSolid} w-full`}
            onClick={runNotify}
            disabled={busy || !notifyMsg.trim() || (notifyMode === "select" && notifySel.length === 0)}
          >
            <BellIcon className="h-4 w-4" /> {busy ? "Sending…" : "Send broadcast"}
          </button>
        </div>
      </Modal>

      {/* invite people (hidden-challenge flow) */}
      <Modal open={showInvite} onClose={() => !busy && setShowInvite(false)} title="Invite people">
        <div className="space-y-4">
          {data.pendingInvites.length === 0 ? (
            <p className="text-sm font-semibold text-bone-600">
              Everyone is already a participant or has a pending invite. 🎉
            </p>
          ) : (
            <>
              <div className="max-h-52 space-y-2 overflow-y-auto rounded-[12px] border border-ink-600 bg-ink-900 p-3">
                {data.pendingInvites.map((u) => (
                  <label key={u.user_id} className="flex cursor-pointer items-center gap-3">
                    <input
                    type="checkbox"
                    className="h-4 w-4 accent-(--color-ember-500)"
                    checked={inviteSel.includes(u.user_id)}                      onChange={(e) =>
                        setInviteSel((v) => (e.target.checked ? [...v, u.user_id] : v.filter((x) => x !== u.user_id)))
                      }
                    />
                    <span className="text-sm font-semibold capitalize text-bone-300">{u.username}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11.5px] leading-relaxed text-bone-600">
                Invited people see your invite on their Challenges tab and can accept or decline.
                {data.challenge.hidden && " This challenge stays hidden — invites are the only way in."}
              </p>
              <button className={`${btnSolid} w-full`} onClick={runInvite} disabled={busy || inviteSel.length === 0}>
                <UsersIcon className="h-4 w-4" /> Send {inviteSel.length || ""} invite{inviteSel.length === 1 ? "" : "s"}
              </button>
            </>
          )}
        </div>
      </Modal>

      {/* leave confirmation */}
      <Modal open={showLeave} onClose={() => !busy && setShowLeave(false)} title="Leave challenge">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-bone-300">
            Leave <strong className="text-bone-100">{data?.challenge.name}</strong>? Your recorded history stays in the
            sheet, but the challenge disappears from your Home and your streak no longer updates. You can re-enroll
            later{data?.challenge.hidden ? " if the owner invites you again" : ""}.
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button className={btnGhost} onClick={() => setShowLeave(false)} disabled={busy}>
              Stay
            </button>
            <button
              className="inline-flex items-center justify-center rounded-[10px] bg-coral-500 px-4 py-3 text-sm font-bold text-onaccent transition hover:bg-coral-400 active:scale-[0.97] disabled:opacity-40"
              onClick={runLeave}
              disabled={busy}
            >
              Leave
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
