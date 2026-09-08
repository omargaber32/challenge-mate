import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type ChallengeCardData, type InviteView } from "../services/api";
import type { Challenge, ChallengeIcon, User, Weekday } from "../types";
import { Field, Modal, Reveal, btnGhost, btnSolid, cardCls, inputCls, useToast } from "../components/ui";
import { CHALLENGE_ICONS, CheckIcon, LockIcon, PlusIcon, UmbrellaIcon, UsersIcon, XIcon } from "../components/icons";
import { WEEKDAY_FULL, fmtRange, keyShift, todayKey } from "../utils/dates";

const ICON_TINT: Record<string, string> = {
  book: "border-ember-500/35 bg-ember-500/12 text-ember-400",
  code: "border-leaf-500/35 bg-leaf-500/12 text-leaf-400",
  language: "border-gold-500/35 bg-gold-400/12 text-gold-400",
  run: "border-coral-500/35 bg-coral-500/12 text-coral-400",
  study: "border-leaf-500/35 bg-leaf-500/12 text-leaf-300",
  write: "border-bone-500/30 bg-ink-700 text-bone-300",
  goal: "border-ember-500/35 bg-ember-500/12 text-ember-300",
};

type Filter = "all" | "joined" | "discover" | "ended";

export default function ChallengesPage({ user, onOpen }: { user: User; onOpen: (id: string) => void }) {
  const toast = useToast();
  const [data, setData] = useState<ChallengeCardData[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [enrollFor, setEnrollFor] = useState<ChallengeCardData | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [anonConfirm, setAnonConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [invites, setInvites] = useState<InviteView[]>([]);

  const load = useCallback(() => {
    api.getChallenges(user.user_id).then(setData);
    api.myInvites(user.user_id).then(setInvites).catch(() => setInvites([]));
  }, [user.user_id]);
  useEffect(load, [load]);

  const answerInvite = async (inv: InviteView, accept: boolean) => {
    setBusy(true);
    try {
      await api.respondInvite(user.user_id, inv.invite_id, accept);
      toast.push(accept ? `Joined ${inv.challenge_name} — see you on Home!` : "Invite declined.", accept ? "success" : "info");
      load();
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : "Could not answer invite.", "warn");
    } finally {
      setBusy(false);
    }
  };

  const doEnroll = async (anonymous: boolean) => {
    if (!enrollFor) return;
    setBusy(true);
    try {
      await api.enroll(enrollFor.challenge.challenge_id, user.user_id, anonymous);
      toast.push(
        anonymous
          ? "Joined anonymously — good luck! 🎭"
          : `Enrolled in ${enrollFor.challenge.name} — see you on Home!`,
      );
      setEnrollFor(null);
      setAnonConfirm(false);
      setAccepted(false);
      load();
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : "Could not enroll.", "warn");
    } finally {
      setBusy(false);
    }
  };

  const counts: Record<Filter, number> = {
    all: data?.length ?? 0,
    joined: data?.filter((d) => d.state === "joined").length ?? 0,
    discover: data?.filter((d) => d.state === "discover").length ?? 0,
    ended: data?.filter((d) => d.state === "ended").length ?? 0,
  };
  const visible = data?.filter((d) => filter === "all" || d.state === filter) ?? [];

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3 pt-1">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-bone-600">Discover · enroll · manage</p>
          <h1 className="font-display mt-1 text-[26px] font-extrabold tracking-tight text-bone-100 md:text-[32px]">Challenges</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className={btnSolid} style={{ paddingInline: 14 }}>
          <PlusIcon className="h-4 w-4" /> Create
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        {(["all", "joined", "discover", "ended"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-bold capitalize transition ${
              filter === f
                ? "border-ember-400 bg-ember-500/15 text-ember-300"
                : "border-ink-500 text-bone-500 hover:border-ember-400/50 hover:text-ember-300"
            }`}
          >
            {f} <span className="opacity-60">{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* pending invites (hidden-challenge flow) */}
      {invites.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="font-display flex items-center gap-2 text-lg font-extrabold text-bone-100">
            <UsersIcon className="h-5 w-5 text-ember-400" /> Invites for you
          </h2>
          {invites.map((inv, i) => (
            <Reveal key={inv.invite_id} delay={i * 60}>
              <div className={`${cardCls} flex items-center justify-between gap-3 border-ember-500/35 p-4`}>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-bone-100">
                    <span className="capitalize text-ember-300">{inv.from_name}</span> invited you to{" "}
                    <span className="text-ember-300">{inv.challenge_name}</span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] font-semibold text-bone-600">Accept to join — or decline, no hard feelings.</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => answerInvite(inv, true)}
                    disabled={busy}
                    aria-label="Accept invite"
                    className="rounded-[10px] bg-leaf-500 p-2 text-onaccent transition hover:bg-leaf-400 active:scale-95 disabled:opacity-40"
                  >
                    <CheckIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => answerInvite(inv, false)}
                    disabled={busy}
                    aria-label="Decline invite"
                    className="rounded-[10px] border border-ink-500 p-2 text-bone-400 transition hover:border-coral-400/60 hover:text-coral-300 active:scale-95 disabled:opacity-40"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Reveal>
          ))}
        </section>
      )}

      <section className="space-y-4 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0">
        {!data && (
          <div className={`${cardCls} animate-pulse p-5`}>
            <div className="h-11 w-2/3 rounded-lg bg-ink-700" />
            <div className="mt-4 h-4 w-1/2 rounded bg-ink-700" />
          </div>
        )}
        {visible.map((d, i) => (
          <Reveal key={d.challenge.challenge_id} delay={i * 70}>
            <article className={`${cardCls} card-lift overflow-hidden ${d.state === "ended" ? "opacity-80" : ""}`}>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border ${ICON_TINT[d.challenge.icon]}`}>
                      {(() => {
                        const Icon = CHALLENGE_ICONS[d.challenge.icon];
                        return <Icon className="h-[22px] w-[22px]" />;
                      })()}
                    </span>
                    <div>
                      <h3 className="font-display text-[17px] font-bold leading-tight text-bone-100">{d.challenge.name}</h3>
                      <p className="mt-0.5 text-xs font-semibold text-bone-600">
                        {fmtRange(d.challenge.start_date, d.challenge.end_date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 text-[11px] font-bold text-bone-300">
                      <UsersIcon className="h-3.5 w-3.5" />
                      {d.participants} participant{d.participants === 1 ? "" : "s"}
                    </span>
                    {d.challenge.hidden && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/45 bg-gold-400/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-gold-300">
                        <LockIcon className="h-3 w-3" /> Hidden · invite-only
                      </span>
                    )}
                  </div>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-bone-500">{d.challenge.description}</p>

                <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] font-semibold text-bone-600">
                  <span>Deadline {d.challenge.deadline}</span>
                  <span>Penalty {d.challenge.penalty_points} pt{d.challenge.penalty_points > 1 ? "s" : ""}</span>
                  <span className="inline-flex items-center gap-1 text-gold-300/90">
                    <UmbrellaIcon className="h-3.5 w-3.5" /> {WEEKDAY_FULL[d.challenge.main_vacation_day]} off
                  </span>
                  {d.challenge.optional_vacations_per_week > 0 && (
                    <span>{d.challenge.optional_vacations_per_week} optional vac./week</span>
                  )}
                </div>
              </div>

              <div className="border-t border-ink-700 bg-ink-900/50 px-5 py-3.5">
                {d.state === "joined" && (
                  <button onClick={() => onOpen(d.challenge.challenge_id)} className={`${btnGhost} w-full`}>
                    Open
                  </button>
                )}
                {d.state === "discover" && (
                  <button
                    onClick={() => {
                      setEnrollFor(d);
                      setAccepted(false);
                    }}
                    className={`${btnSolid} w-full`}
                  >
                    Enroll
                  </button>
                )}
                {d.state === "ended" && (
                  <button
                    onClick={() => onOpen(d.challenge.challenge_id)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-leaf-500/40 bg-leaf-500/8 px-4 py-3 text-sm font-bold text-leaf-300 transition hover:bg-leaf-500/15"
                  >
                    <CheckIcon className="h-4 w-4" /> Completed — view results
                  </button>
                )}
              </div>
            </article>
          </Reveal>
        ))}
        {data && visible.length === 0 && (
          <p className="py-10 text-center text-sm font-semibold text-bone-600 md:col-span-2">Nothing in this view yet.</p>
        )}
      </section>

      {/* enrollment modal (README §5) */}
      <Modal open={!!enrollFor && !anonConfirm} onClose={() => !busy && setEnrollFor(null)} title={enrollFor?.challenge.name}>
        {enrollFor && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-bone-300">{enrollFor.challenge.description}</p>
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-bone-500">Rules</p>
              <ol className="space-y-2">
                {enrollFor.challenge.rules.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-bone-300">
                    <span className="font-display mt-px shrink-0 text-ember-400 font-extrabold">{i + 1}.</span>
                    {r}
                  </li>
                ))}
              </ol>
            </div>
            <div className="border-t border-dashed border-ink-500 pt-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5 h-4.5 w-4.5 accent-(--color-ember-500)"
                  style={{ width: 18, height: 18 }}
                />
                <span className="text-[13.5px] font-semibold leading-relaxed text-bone-300">
                  I have read and accept the rules.
                </span>
              </label>
            </div>
            <div className="grid gap-2.5">
              <button className={btnSolid} disabled={!accepted || busy} onClick={() => doEnroll(false)}>
                Enroll as {user.username}
              </button>
              <button className={btnGhost} disabled={!accepted || busy} onClick={() => setAnonConfirm(true)}>
                Join anonymously…
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* anonymous confirm (README §6) */}
      <Modal open={anonConfirm} onClose={() => !busy && setAnonConfirm(false)} title="Join anonymously">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-bone-300">
            You will participate in <strong className="text-bone-100">{enrollFor?.challenge.name}</strong>, but:
          </p>
          <ul className="space-y-2.5">
            {[
              "Your username will not appear on the leaderboard.",
              "Other participants will not see you in friend progress.",
              "Your personal progress remains fully visible to you.",
            ].map((t) => (
              <li key={t} className="flex gap-2.5 text-[13.5px] leading-relaxed text-bone-300">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                {t}
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] leading-relaxed text-bone-600">
            Tasks, streaks, vacations, penalties, statistics and achievements are still tracked — anonymity only
            affects visibility.
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button className={btnGhost} onClick={() => setAnonConfirm(false)} disabled={busy}>
              Exit
            </button>
            <button className={btnSolid} onClick={() => doEnroll(true)} disabled={busy}>
              Confirm
            </button>
          </div>
        </div>
      </Modal>

      {showCreate && <CreateModal user={user} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* challenge creation (README §7)                                      */
/* ------------------------------------------------------------------ */

const ICON_KEYS: ChallengeIcon[] = ["book", "code", "language", "run", "study", "write", "goal"];

function CreateModal({ user, onClose, onCreated }: { user: User; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<ChallengeIcon>("book");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("Mark the task done before the deadline.\nMissing a task adds one penalty point.");
  const [start, setStart] = useState(todayKey());
  const [end, setEnd] = useState(keyShift(todayKey(), 30));
  const [deadline, setDeadline] = useState("23:00");
  const [penalty, setPenalty] = useState("1");
  const [mainDay, setMainDay] = useState<Weekday>(5);
  const [optPerWeek, setOptPerWeek] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!name.trim()) return setErr("Give the challenge a name.");
    if (end <= start) return setErr("End date must be after the start date.");
    setBusy(true);
    try {
      await api.createChallenge(user.user_id, {
        name,
        icon,
        description: description || "A brand new daily challenge.",
        rules: rules.split("\n").map((r) => r.trim()).filter(Boolean),
        start_date: start,
        end_date: end,
        deadline,
        penalty_points: Math.max(0, Number(penalty) || 0),
        main_vacation_day: mainDay,
        optional_vacations_per_week: optPerWeek,
        hidden,
      });
      toast.push(hidden ? `“${name.trim()}” created (hidden) — invite people from its page.` : `“${name.trim()}” created — you are enrolled as owner.`);
      onCreated();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not create challenge.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Create challenge">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Writing November" />
        </Field>

        <Field label="Type">
          <div className="flex flex-wrap gap-2">
            {ICON_KEYS.map((k) => {
              const Icon = CHALLENGE_ICONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setIcon(k)}
                  aria-label={k}
                  className={`flex h-10 w-10 items-center justify-center rounded-[10px] border transition ${
                    icon === k ? "border-ember-400 bg-ember-500/15 text-ember-300" : "border-ink-500 text-bone-500 hover:text-bone-300"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Description">
          <textarea className={`${inputCls} min-h-[64px]`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this challenge about?" />
        </Field>

        <Field label="Rules" hint="one per line">
          <textarea className={`${inputCls} min-h-[88px]`} value={rules} onChange={(e) => setRules(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End date">
            <input type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Daily deadline">
            <input type="time" className={inputCls} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
          <Field label="Penalty points">
            <input type="number" min={0} max={10} className={inputCls} value={penalty} onChange={(e) => setPenalty(e.target.value)} />
          </Field>
          <Field label="Main vacation day">
            <select className={inputCls} value={mainDay} onChange={(e) => setMainDay(Number(e.target.value) as Weekday)}>
              {WEEKDAY_FULL.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Optional vacations / week">
            <select className={inputCls} value={optPerWeek} onChange={(e) => setOptPerWeek(Number(e.target.value))}>
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "0 — hardcore" : n}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <label className={`flex cursor-pointer items-start gap-3 rounded-[12px] border p-3.5 transition ${hidden ? "border-gold-500/50 bg-gold-400/10" : "border-ink-600 bg-ink-900 hover:border-ink-500"}`}>
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-(--color-gold-400)"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
          />
          <span>
            <span className={`flex items-center gap-1.5 text-sm font-bold ${hidden ? "text-gold-300" : "text-bone-100"}`}>
              <LockIcon className="h-3.5 w-3.5" /> Hidden challenge
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-bone-500">
              Only you see it. Nobody can self-enroll — you invite chosen people and they accept or decline.
            </span>
          </span>
        </label>

        <p className="text-[11.5px] leading-relaxed text-bone-600">
          No participants are added at creation. Public challenges are discovered on the Challenges tab; hidden ones are joined by invite only.
        </p>

        {err && <p className="rounded-[10px] border border-coral-500/40 bg-coral-500/10 px-3 py-2 text-[13px] font-semibold text-coral-300">{err}</p>}

        <button type="submit" disabled={busy} className={`${btnSolid} w-full`}>
          {busy ? "Creating…" : "Create challenge"}
        </button>
      </form>
    </Modal>
  );
}
