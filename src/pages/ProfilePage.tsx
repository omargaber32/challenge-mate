import { useEffect, useState } from "react";
import { api, type ProfileData } from "../services/api";
import type { User } from "../types";
import { Field, Reveal, btnGhost, btnSolid, cardCls, inputCls, useToast } from "../components/ui";
import { ACHIEVEMENT_ICONS, BellIcon, CheckIcon, FlameFill, LockIcon, LogoutIcon } from "../components/icons";
import { fmtDay, fmtMinutes } from "../utils/dates";

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-[26px] w-12 shrink-0 rounded-full border transition-colors duration-200 ${
        on ? "border-ember-400/70 bg-ember-500/30" : "border-ink-500 bg-ink-800"
      }`}
    >
      <span
        className={`absolute top-[2px] h-5 w-5 rounded-full shadow transition-all duration-200 ${
          on ? "left-[22px] bg-ember-400" : "left-[2px] bg-bone-600"
        }`}
      />
    </button>
  );
}

export default function ProfilePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<ProfileData | null>(null);
  const [remindersOn, setRemindersOn] = useState(false);
  const [freq, setFreq] = useState<1 | 2 | 3>(2);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("22:00");
  const [friendPrefs, setFriendPrefs] = useState<{ friend_id: string; enabled: boolean }[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getProfile(user.user_id).then((d) => {
      setData(d);
      setRemindersOn(d.settings.reminders_enabled);
      setFreq(d.settings.reminder_frequency);
      setStart(d.settings.reminder_start);
      setEnd(d.settings.reminder_end);
      setFriendPrefs(d.friendPrefs.map((f) => ({ friend_id: f.user.user_id, enabled: f.enabled })));
    });
  }, [user.user_id]);

  const saveSettings = async () => {
    setBusy(true);
    await api.saveSettings(user.user_id, {
      reminders_enabled: remindersOn,
      reminder_frequency: freq,
      reminder_start: start,
      reminder_end: end,
    });
    setBusy(false);
    toast.push("Reminder settings saved");
  };

  const saveFriends = async () => {
    setBusy(true);
    await api.saveFriendPrefs(user.user_id, friendPrefs);
    setBusy(false);
    toast.push("Friend notifications saved");
  };

  const testReminder = () => {
    const first = data?.challengeCount ? "your pending challenge" : "a challenge";
    toast.push(`⏰ Reminder: ${first} is still pending — every ${freq}h between ${start}–${end}.`, "info");
  };

  const earnedCount = data?.achievements.filter((a) => a.earned_at).length ?? 0;

  return (
    <div className="space-y-5">
      <header className="pt-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-bone-600">Who am I?</p>
        <h1 className="font-display mt-1 text-[26px] font-extrabold tracking-tight text-bone-100">Profile</h1>
      </header>

      {/* identity */}
      <Reveal>
        <section className={`${cardCls} relative overflow-hidden p-5`}>
          <span className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(22rem 12rem at 100% 0%, rgba(255,122,51,0.13), transparent 60%)" }} />
          <div className="relative flex items-center gap-4">
            <span className="font-display relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] border border-ember-500/40 bg-ember-500/12 text-2xl font-extrabold uppercase text-ember-300">
              <span className="anim-glow absolute inset-0 rounded-[18px] bg-ember-500/20 blur-xl" />
              <span className="relative">{user.username.slice(0, 2)}</span>
            </span>
            <div className="min-w-0">
              <h2 className="font-display truncate text-[22px] font-extrabold capitalize text-bone-100">{user.username}</h2>
              <p className="text-[12.5px] font-semibold text-bone-600">
                Member since {fmtDay(user.created_at)} · {data?.challengeCount ?? 0} challenge{(data?.challengeCount ?? 0) === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          {data && (
            <div className="relative mt-4 grid grid-cols-4 gap-2 text-center">
              {[
                { v: data.global.done, l: "tasks done", tone: "text-leaf-300" },
                { v: data.global.bestStreak, l: "best streak", tone: "text-ember-300" },
                { v: data.global.totalMinutes, l: "minutes", tone: "text-bone-100", fmt: true },
                { v: earnedCount, l: "badges", tone: "text-gold-300" },
              ].map((x) => (
                <div key={x.l} className="rounded-[12px] border border-ink-600 bg-ink-900/70 py-2.5">
                  <p className={`font-display text-lg font-extrabold leading-none ${x.tone}`}>
                    {x.fmt ? fmtMinutes(x.v) : x.v}
                  </p>
                  <p className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-bone-600">{x.l}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {/* achievements (README §21) */}
      <Reveal delay={70}>
        <section className={`${cardCls} p-5`}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-extrabold text-bone-100">Achievements</h2>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-bone-600">
              {earnedCount}/{data?.achievements.length ?? 8} earned
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {data?.achievements.map((a) => {
              const Icon = ACHIEVEMENT_ICONS[a.def.icon] ?? FlameFill;
              const earned = !!a.earned_at;
              return (
                <div
                  key={a.def.id}
                  className={`group rounded-[14px] border p-3.5 transition-all duration-300 ${
                    earned
                      ? "border-gold-500/45 bg-gradient-to-b from-gold-400/12 to-ink-850 hover:-translate-y-0.5"
                      : "border-ink-600 bg-ink-900/60 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-[12px] border transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110 ${
                        earned ? "border-gold-400/50 bg-gold-400/15 text-gold-300" : "border-ink-500 bg-ink-800 text-bone-600"
                      }`}
                    >
                      {earned ? <Icon className="h-5 w-5" /> : <LockIcon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />}
                    </span>
                    {earned && <CheckIcon className="h-4 w-4 text-leaf-400" />}
                  </div>
                  <p className={`font-display mt-2.5 text-[14.5px] font-extrabold ${earned ? "text-bone-100" : "text-bone-500"}`}>{a.def.name}</p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-bone-600">{a.def.description}</p>
                  <p className={`mt-1.5 text-[10px] font-bold uppercase tracking-wider ${earned ? "text-gold-300/80" : "text-bone-600"}`}>
                    {earned ? `Earned ${fmtDay(a.earned_at!)}` : a.def.requirement}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </Reveal>

      {/* notifications (README §17–19) */}
      <Reveal delay={120}>
        <section className={`${cardCls} p-5`}>
          <h2 className="font-display flex items-center gap-2 text-lg font-extrabold text-bone-100">
            <BellIcon className="h-5 w-5 text-bone-500" /> Task reminders
          </h2>

          <div className="mt-4 flex items-center justify-between rounded-[12px] border border-ink-600 bg-ink-900 px-3.5 py-3">
            <div>
              <p className="text-sm font-bold text-bone-100">Remind me about unfinished tasks</p>
              <p className="text-[11.5px] font-semibold text-bone-600">Only inside the window below — no 3 a.m. pings</p>
            </div>
            <Switch on={remindersOn} onChange={setRemindersOn} />
          </div>

          <div className={`mt-3 space-y-4 transition-opacity ${remindersOn ? "" : "pointer-events-none opacity-40"}`}>
            <Field label="Reminder frequency">
              <div className="grid grid-cols-3 gap-2">
                {([1, 2, 3] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFreq(f)}
                    className={`rounded-[10px] border py-2.5 text-sm font-bold transition ${
                      freq === f ? "border-ember-400 bg-ember-500/15 text-ember-300" : "border-ink-500 text-bone-500 hover:text-bone-300"
                    }`}
                  >
                    Every {f}h
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Window start">
                <input type="time" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="Window end">
                <input type="time" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2.5">
              <button className={btnSolid} onClick={saveSettings} disabled={busy}>
                Save
              </button>
              <button className={btnGhost} onClick={testReminder}>
                Test
              </button>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal delay={160}>
        <section className={`${cardCls} p-5`}>
          <h2 className="font-display text-lg font-extrabold text-bone-100">Friend notifications</h2>
          <p className="mt-0.5 text-[12px] font-semibold text-bone-600">
            Notify me when these friends complete a task, hit a streak record, earn an achievement or join a challenge.
          </p>
          {data && data.friendPrefs.length === 0 && (
            <p className="mt-4 text-sm font-semibold text-bone-600">No friends yet — join a challenge to meet the crew.</p>
          )}
          <div className="mt-3 space-y-2">
            {data?.friendPrefs.map((f, i) => (
              <div key={f.user.user_id} className="flex items-center justify-between rounded-[12px] border border-ink-600 bg-ink-900 px-3.5 py-2.5">
                <span className="text-sm font-bold capitalize text-bone-100">
                  {f.user.username}
                  <span className="ml-2 text-[11px] font-semibold text-bone-600">completes a challenge</span>
                </span>
                <Switch
                  on={friendPrefs[i]?.enabled ?? false}
                  onChange={(v) =>
                    setFriendPrefs((p) => p.map((x) => (x.friend_id === f.user.user_id ? { ...x, enabled: v } : x)))
                  }
                />
              </div>
            ))}
          </div>
          {data && data.friendPrefs.length > 0 && (
            <button className={`${btnSolid} mt-4 w-full`} onClick={saveFriends} disabled={busy}>
              Save friend settings
            </button>
          )}
        </section>
      </Reveal>

      {/* data source — the Sheet URL lives in frontend code, not in the app */}
      <Reveal delay={200}>
        <section className={`${cardCls} p-5`}>
          <h2 className="font-display text-lg font-extrabold text-bone-100">Data source</h2>
          <div className="mt-3 rounded-[12px] border border-ink-600 bg-ink-900 px-3.5 py-3">
            <p className="flex items-center gap-2 text-[13px] font-bold text-bone-100">
              <span className={`h-2 w-2 rounded-full ${api.workerConfigured ? "bg-leaf-400" : "bg-gold-400"}`} />
              {api.workerConfigured ? "Google Sheets · live" : "Local demo · in-browser"}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-bone-600">
              {api.workerConfigured
                ? "Every account, challenge, task, streak and penalty is stored in the connected Google Sheet through the Cloudflare Worker. Only your login session is kept in this browser."
                : "The backend endpoint is hardcoded in src/services/googleSheets.ts → SHEETS_API_URL. Paste your Cloudflare Worker URL there and rebuild to go live. Until then, demo data stays in this browser."}
            </p>
            <p className="mt-2 truncate rounded-lg border border-ink-700 bg-ink-950 px-2.5 py-1.5 font-mono text-[10.5px] text-bone-500">
              {api.workerUrl ?? "SHEETS_API_URL = \"\""}
            </p>
            <p className="mt-2 text-[11px] font-semibold text-bone-600">
              Backend: <span className="font-mono text-bone-400">backend/worker.js</span> in this repo, deployed to Cloudflare Workers.
            </p>
          </div>
        </section>
      </Reveal>

      {/* session */}
      <Reveal delay={220}>
        <section className={`${cardCls} p-5`}>
          <div className="grid gap-2.5">
            <button
              className={btnGhost}
              onClick={async () => {
                if (!confirmReset) {
                  setConfirmReset(true);
                  setTimeout(() => setConfirmReset(false), 3000);
                  return;
                }
                await api.resetDemo();
                toast.push("Demo data reseeded", "info");
                setConfirmReset(false);
                onLogout();
              }}
            >
              {confirmReset ? "Tap again to confirm reset" : "Reset demo data"}
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-coral-500/50 bg-coral-500/10 px-4 py-3 text-sm font-bold text-coral-300 transition hover:bg-coral-500/20 active:scale-[0.97]"
              onClick={onLogout}
            >
              <LogoutIcon className="h-4 w-4" /> Logout
            </button>
          </div>
        </section>
      </Reveal>

      <p className="pb-2 text-center text-[11px] font-semibold text-bone-600">
        ChallengeMate — small social accountability, not a productivity maze.
      </p>
    </div>
  );
}
