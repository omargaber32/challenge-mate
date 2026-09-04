/**
 * Real OS-level notifications (browser Notification API).
 *
 * While the app is open, a 60s engine:
 *  1. reminds about pending tasks — honoring frequency + reminder window (README §18)
 *  2. pushes owner broadcasts the moment they arrive (README §19-style)
 *  3. pushes friend activity for friends the user enabled notifications for
 *
 * Only *settings* are cached locally (never challenge data).
 */
import { api } from "../services/api";
import type { User } from "../types";
import { nowTimeHM } from "./dates";

const SEEN_KEY = "cm_ann_seen";
const DISMISSED_KEY = "cm_ann_dismissed";
const SNAP_KEY = "cm_friend_snap";
const LAST_REMINDER_KEY = "cm_last_reminder";
const CFG_KEY = "cm_notify_cfg";

let timer: ReturnType<typeof setInterval> | null = null;
let runningFor: string | null = null;

export const notifySupported = () => typeof window !== "undefined" && "Notification" in window;
export const notifyPermission = (): NotificationPermission | "unsupported" =>
  notifySupported() ? Notification.permission : "unsupported";

export async function requestNotifyPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notifySupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function osNotify(title: string, body: string) {
  if (!notifySupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, silent: false });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* some mobile browsers only allow SW-based notifications */
  }
}

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* full */
  }
};

export const dismissedAnnouncements = () => readJson<string[]>(DISMISSED_KEY, []);
export function dismissAnnouncement(id: string) {
  writeJson(DISMISSED_KEY, [...dismissedAnnouncements(), id]);
}

interface Cfg {
  reminders_enabled: boolean;
  reminder_frequency: number;
  reminder_start: string;
  reminder_end: string;
  friendNames: string[];
  at: number;
}

async function getCfg(user: User): Promise<Cfg | null> {
  const cached = readJson<Cfg | null>(CFG_KEY, null);
  if (cached && cached.at && Date.now() - cached.at < 30 * 60 * 1000) return cached;
  try {
    const profile = await api.getProfile(user.user_id);
    const cfg: Cfg = {
      reminders_enabled: profile.settings.reminders_enabled,
      reminder_frequency: profile.settings.reminder_frequency,
      reminder_start: profile.settings.reminder_start,
      reminder_end: profile.settings.reminder_end,
      friendNames: profile.friendPrefs.filter((f) => f.enabled).map((f) => f.user.username),
      at: Date.now(),
    };
    writeJson(CFG_KEY, cfg);
    return cfg;
  } catch {
    return cached;
  }
}

function inWindow(now: string, start: string, end: string): boolean {
  if (start <= end) return now >= start && now <= end;
  return now >= start || now <= end; // overnight window
}

async function tick(user: User) {
  if (notifyPermission() !== "granted") return;
  const cfg = await getCfg(user);
  if (!cfg) return;

  let home;
  try {
    home = await api.getHome(user.user_id);
  } catch {
    return;
  }

  /* 1 — owner broadcasts: OS-push anything unseen */
  const seen = readJson<string[]>(SEEN_KEY, []);
  const dismissed = dismissedAnnouncements();
  let seenChanged = false;
  for (const a of home.announcements ?? []) {
    if (!seen.includes(a.announcement_id)) {
      seen.push(a.announcement_id);
      seenChanged = true;
      if (!dismissed.includes(a.announcement_id)) {
        osNotify(`📣 ${a.challengeName} — ${a.fromName}`, a.message);
      }
    }
  }
  if (seenChanged) writeJson(SEEN_KEY, seen.slice(-200));

  /* 2 — task reminders, only inside the user's window & frequency */
  if (cfg.reminders_enabled) {
    const now = nowTimeHM();
    if (inWindow(now, cfg.reminder_start, cfg.reminder_end)) {
      const pending = (home.tasks ?? []).filter((t) => t.status === "PENDING").length;
      if (pending > 0) {
        const last = Number(localStorage.getItem(LAST_REMINDER_KEY) || 0);
        if (Date.now() - last >= cfg.reminder_frequency * 3600 * 1000) {
          osNotify(
            "ChallengeMate 🔥",
            `You still have ${pending} task${pending > 1 ? "s" : ""} pending today — keep the streak alive!`,
          );
          localStorage.setItem(LAST_REMINDER_KEY, String(Date.now()));
        }
      }
    }
  }

  /* 3 — friend activity: push when an enabled friend's done-count goes up */
  const snap = readJson<Record<string, number>>(SNAP_KEY, {});
  let snapChanged = false;
  for (const f of home.friendsActivity ?? []) {
    if (!cfg.friendNames.includes(f.username)) continue;
    const key = `${f.username}|${f.challengeName}`;
    const prev = snap[key];
    if (prev !== undefined && f.done > prev) {
      osNotify("Friend activity", `${f.username} just completed a task in ${f.challengeName} 🔥`);
    }
    if (prev !== f.done) {
      snap[key] = f.done;
      snapChanged = true;
    }
  }
  if (snapChanged) writeJson(SNAP_KEY, snap);
}

export function startNotifyEngine(user: User) {
  if (timer || runningFor === user.user_id) return;
  stopNotifyEngine();
  runningFor = user.user_id;
  // first tick shortly after load, then every minute
  setTimeout(() => tick(user).catch(() => undefined), 4000);
  timer = setInterval(() => tick(user).catch(() => undefined), 60 * 1000);
}

export function stopNotifyEngine() {
  if (timer) clearInterval(timer);
  timer = null;
  runningFor = null;
}
