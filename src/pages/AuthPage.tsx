import { useState, type FormEvent } from "react";
import { api } from "../services/api";
import type { User } from "../types";
import { btnSolid, Field, inputCls, Spinner, cardCls } from "../components/ui";
import { FlameFill, TrophyIcon, UmbrellaIcon, UsersIcon } from "../components/icons";
import { Ambient, Wordmark } from "../components/chrome";

const DEMO_ACCOUNTS = ["omar", "ahmed", "sara"];

export default function AuthPage({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  const fail = (msg: string) => {
    setErr(msg);
    setShakeKey((k) => k + 1);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy("form");
    try {
      if (mode === "register" && password !== confirm) {
        throw new Error("Passwords do not match.");
      }
      const u =
        mode === "login"
          ? await api.login(username, password)
          : await api.register(username, password);
      onAuthed(u);
    } catch (ex) {
      fail(ex instanceof Error ? ex.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const quick = async (name: string) => {
    setErr("");
    setBusy(name);
    try {
      const u = await api.login(name, "demo123");
      onAuthed(u);
    } catch (ex) {
      fail(ex instanceof Error ? ex.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative min-h-dvh">
      <Ambient />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center gap-10 px-5 py-10 lg:flex-row lg:items-center lg:gap-16">
        {/* brand / manifesto side */}
        <div className="max-w-xl lg:flex-1">
          <Wordmark />
          <h1 className="font-display mt-7 text-[2.6rem] font-extrabold leading-[1.04] tracking-tight text-bone-100 sm:text-6xl">
            <span className="line-mask">
              <span className="rise-word">What do you</span>
            </span>
            <span className="line-mask">
              <span className="rise-word" style={{ animationDelay: "90ms" }}>
                need to do
              </span>
            </span>
            <span className="line-mask">
              <span className="rise-word text-ember-400" style={{ animationDelay: "180ms" }}>
                today?
              </span>
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-bone-500">
            ChallengeMate is a small social accountability app for friends. Daily challenges,
            streaks you protect, vacations you earn, penalties you can forgive — and a
            leaderboard that keeps it honest.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2.5 text-[12px] font-semibold text-bone-500">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ember-500/35 bg-ember-500/10 px-3 py-1.5 text-ember-300">
              <FlameFill className="h-3.5 w-3.5" /> 21-day streaks happen here
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/35 bg-gold-400/10 px-3 py-1.5 text-gold-300">
              <UmbrellaIcon className="h-3.5 w-3.5" /> 1 optional vacation / week
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-leaf-500/35 bg-leaf-500/10 px-3 py-1.5 text-leaf-300">
              <TrophyIcon className="h-3.5 w-3.5" /> 8 achievements to earn
            </span>
          </div>

          <div className="mt-10 hidden items-center gap-3 lg:flex">
            <span className="flex -space-x-2">
              {["O", "A", "S", "M", "L"].map((c, i) => (
                <span
                  key={c}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink-900 font-display text-xs font-bold ${
                    ["bg-ember-500/25 text-ember-300", "bg-leaf-500/25 text-leaf-300", "bg-gold-400/25 text-gold-300", "bg-coral-500/25 text-coral-300", "bg-ink-600 text-bone-300"][i]
                  }`}
                >
                  {c}
                </span>
              ))}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-bone-600">
              <UsersIcon className="h-4 w-4" /> Omar, Ahmed, Sara, Mohamed & Layla are already in
            </span>
          </div>
        </div>

        {/* form side */}
        <div className="w-full max-w-sm lg:shrink-0">
          <div key={shakeKey} className={`${cardCls} ${err ? "anim-shake" : ""} p-6 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)]`}>
            <div className="mb-5 grid grid-cols-2 rounded-[12px] border border-ink-600 bg-ink-900 p-1 text-sm font-bold">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setErr("");
                  }}
                  className={`rounded-[9px] py-2 transition-all duration-200 ${
                    mode === m ? "bg-ink-700 text-ember-300 shadow" : "text-bone-600 hover:text-bone-300"
                  }`}
                >
                  {m === "login" ? "Welcome back" : "Create account"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-4">
              <Field label="Username">
                <input
                  className={inputCls}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. omar"
                  autoComplete="username"
                  required
                />
              </Field>
              <Field label="Password">
                <input
                  className={inputCls}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                />
              </Field>
              {mode === "register" && (
                <Field label="Confirm password">
                  <input
                    className={inputCls}
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                  />
                </Field>
              )}

              {err && (
                <p className="rounded-[10px] border border-coral-500/40 bg-coral-500/10 px-3 py-2 text-[13px] font-semibold text-coral-300">
                  {err}
                </p>
              )}

              <button type="submit" disabled={busy !== null} className={`${btnSolid} w-full`}>
                {busy === "form" ? <Spinner /> : null}
                {mode === "login" ? "Login" : "Create account"}
              </button>

              {mode === "login" && (
                <p className="text-center text-[12.5px] text-bone-600">
                  Forgot password? Ask the group admin — it’s a small club.
                </p>
              )}
            </form>

            <div className="mt-6 border-t border-ink-700 pt-4">
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-bone-600">
                Demo crew · password <span className="text-bone-300">demo123</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {DEMO_ACCOUNTS.map((name) => (
                  <button
                    key={name}
                    onClick={() => quick(name)}
                    disabled={busy !== null}
                    className="rounded-[10px] border border-ink-500 py-2 text-sm font-bold capitalize text-bone-300 transition hover:border-ember-400/60 hover:text-ember-300 active:scale-[0.97] disabled:opacity-50"
                  >
                    {busy === name ? <Spinner className="mx-auto h-4 w-4" /> : name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-[11.5px] leading-relaxed text-bone-600">
            Frontend on GitHub Pages · API on Cloudflare Workers · data in a private Google Sheet.
            This demo runs the same API contract locally.
          </p>
        </div>
      </div>
    </div>
  );
}
