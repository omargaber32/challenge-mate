/**
 * ChallengeMate API layer.
 *
 * Production topology:
 *
 *   Frontend (GitHub Pages) ──HTTPS──▶ Cloudflare Worker ──Sheets REST API──▶ Google Sheet
 *
 * The Worker URL is hardcoded in ./googleSheets (SHEETS_API_URL). When it is
 * set, every method below is served straight from the Google Sheet via
 * `sheetsApi`. With no URL configured, a deterministic local engine — same
 * contract, in-browser persistence — keeps the app fully functional as a demo.
 *
 *   POST /login              POST /register           POST /home
 *   POST /challenges         POST /challenge/detail   POST /challenge/create
 *   POST /challenge/enroll   POST /task/complete      POST /task/vacation
 *   POST /progress           POST /profile            POST /penalty/remove
 *   POST /settings/save      POST /settings/friends   POST /demo/reset
 */

import type {
  Announcement,
  Challenge,
  Completion,
  DB,
  DailyTask,
  ExtendedStats,
  Member,
  NotificationSettings,
  TaskStatus,
  User,
} from "../types";
import { buildSeedDB } from "../data/seed";
import { SHEETS_API_URL, isSheetsConfigured, sheetsApi } from "./googleSheets";
import { ACHIEVEMENTS, type AchievementDef } from "../data/achievements";
import { randomQuote } from "../data/quotes";
import { computeStats, statusFor } from "../utils/streak";
import {
  WEEKDAY_SHORT,
  deadlinePassed,
  isoWeekOf,
  keyShift,
  todayKey,
  weekStartKey,
  weekdayOf,
  rangeKeys,
} from "../utils/dates";

/* ------------------------------------------------------------------ */
/* transport                                                           */
/* ------------------------------------------------------------------ */

const WORKER_URL: string | null =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_WORKER_URL) ?? null;

async function workerFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`Worker responded ${res.status}`);
  return (await res.json()) as T;
}

const DB_KEY = "challengemate_db_v1";
const SESSION_KEY = "challengemate_session_v1";
let cache: DB | null = null;

function loadDB(): DB {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      cache = JSON.parse(raw) as DB;
      return cache;
    }
  } catch {
    /* corrupted store → reseed */
  }
  cache = buildSeedDB();
  persist(cache);
  return cache;
}
function persist(db: DB) {
  cache = db;
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* storage full — demo continues in memory */
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lag = () => sleep(130 + Math.random() * 220);

/* ------------------------------------------------------------------ */
/* internal helpers                                                    */
/* ------------------------------------------------------------------ */

const tasksOf = (db: DB, cid: string, uid: string) =>
  db.dailyTasks.filter((t) => t.challenge_id === cid && t.user_id === uid);

const completionsFor = (db: DB, tasks: DailyTask[]): Completion[] => {
  const ids = new Set(tasks.map((t) => t.task_id));
  return db.completions.filter((c) => ids.has(c.task_id));
};

const challengeById = (db: DB, cid: string) => {
  const ch = db.challenges.find((c) => c.challenge_id === cid);
  if (!ch) throw new Error("Challenge not found");
  return ch;
};

const memberOf = (db: DB, cid: string, uid: string) =>
  db.members.find((m) => m.challenge_id === cid && m.user_id === uid) ?? null;

const usernameOf = (db: DB, uid: string) =>
  db.users.find((u) => u.user_id === uid)?.username ?? "unknown";

/** penalty balance = missed days × points − forgiven removals (README §14) */
function penaltyBalance(db: DB, ch: Challenge, uid: string, from?: string): number {
  const start = from && from > ch.start_date ? from : ch.start_date;
  const today = todayKey();
  const end = ch.end_date < today ? ch.end_date : today;
  const byDate = new Map(tasksOf(db, ch.challenge_id, uid).map((t) => [t.date, t]));
  let missed = 0;
  for (const k of rangeKeys(start, end)) {
    if (statusFor(k, ch, byDate) === "MISSED") missed++;
  }
  const removed = db.penaltyRemovals
    .filter((p) => p.challenge_id === ch.challenge_id && p.user_id === uid)
    .reduce((s, p) => s + p.points, 0);
  return Math.max(0, missed * ch.penalty_points - removed);
}

function optionalLeft(db: DB, ch: Challenge, uid: string): number {
  if (ch.optional_vacations_per_week <= 0) return 0;
  const ws = weekStartKey(todayKey());
  const weekDays = new Set(rangeKeys(ws, keyShift(ws, 6)));
  const used = db.vacations.filter(
    (v) => v.challenge_id === ch.challenge_id && v.user_id === uid && v.type === "optional" && weekDays.has(v.date),
  ).length;
  return Math.max(0, ch.optional_vacations_per_week - used);
}

function statsFor(db: DB, ch: Challenge, uid: string, from?: string): ExtendedStats {
  const tasks = tasksOf(db, ch.challenge_id, uid);
  const s = computeStats(ch, tasks, completionsFor(db, tasks), from);
  s.penalties = penaltyBalance(db, ch, uid, from);
  return s;
}

/** global (all challenges) stats — used by the achievement engine */
function globalStats(db: DB, uid: string): ExtendedStats {
  const memberships = db.members.filter((m) => m.user_id === uid);
  const g: ExtendedStats = {
    currentStreak: 0,
    bestStreak: 0,
    done: 0,
    missed: 0,
    vacations: 0,
    totalMinutes: 0,
    completionPct: 0,
    applicableDays: 0,
    perfectWeeks: 0,
    maxDayMinutes: 0,
    comeback: false,
    penalties: 0,
  };
  for (const m of memberships) {
    const s = statsFor(db, challengeById(db, m.challenge_id), uid, m.joined_at);
    g.done += s.done;
    g.missed += s.missed;
    g.vacations += s.vacations;
    g.totalMinutes += s.totalMinutes;
    g.applicableDays += s.applicableDays;
    g.penalties += s.penalties;
    g.perfectWeeks += s.perfectWeeks;
    g.bestStreak = Math.max(g.bestStreak, s.bestStreak);
    g.currentStreak = Math.max(g.currentStreak, s.currentStreak);
    g.maxDayMinutes = Math.max(g.maxDayMinutes, s.maxDayMinutes);
    g.comeback = g.comeback || s.comeback;
  }
  g.completionPct = g.applicableDays > 0 ? Math.round((g.done / g.applicableDays) * 100) : 0;
  return g;
}

function evaluateAchievements(db: DB, uid: string): string[] {
  const stats = globalStats(db, uid);
  const earnedNow: string[] = [];
  const today = todayKey();
  for (const def of ACHIEVEMENTS) {
    const has = db.userAchievements.some(
      (a) => a.user_id === uid && a.achievement_id === def.id,
    );
    if (!has && def.check(stats)) {
      db.userAchievements.push({ user_id: uid, achievement_id: def.id, earned_at: today });
      earnedNow.push(def.name);
    }
  }
  return earnedNow;
}

/* ------------------------------------------------------------------ */
/* view models                                                         */
/* ------------------------------------------------------------------ */

export interface TaskView {
  challenge: Challenge;
  anonymous: boolean;
  status: TaskStatus;
  streak: number;
  best: number;
  optLeft: number;
  penalties: number;
  completion: Completion | null;
  deadlineOver: boolean;
}

export interface AnnouncementView {
  announcement_id: string;
  challengeName: string;
  fromName: string;
  message: string;
  createdAt: string;
}

export interface FriendActivity {
  username: string;
  challengeName: string;
  done: number;
  streak: number;
}

export interface InviteView {
  invite_id: string;
  challenge_id: string;
  challenge_name: string;
  from_name: string;
  created_at: string;
}

export interface HomeData {
  quote: { text: string; author: string };
  tasks: TaskView[];
  totalPenalties: number;
  announcements: AnnouncementView[];
  friendsActivity: FriendActivity[];
}

export interface ChallengeCardData {
  challenge: Challenge;
  member: Member | null;
  participants: number;
  state: "joined" | "discover" | "ended";
}

export interface LeaderRow {
  user_id: string;
  username: string;
  anonymous: boolean;
  streak: number;
  best: number;
  done: number;
  penalties: number;
  completionPct: number;
  isYou: boolean;
}

export interface PenaltyEvent {
  date: string;
  reason: string;
  points: number; // + penalty, − removal
  removable: boolean;
}

export interface WeekDayView {
  key: string;
  label: string;
  dayNum: number;
  status: TaskStatus;
  isToday: boolean;
  isMain: boolean;
}

export interface DetailData {
  challenge: Challenge;
  member: Member | null;
  participants: { user_id: string; username: string; role: string; isYou: boolean }[];
  hiddenCount: number;
  myStats: ExtendedStats | null;
  week: WeekDayView[];
  leaderboard: LeaderRow[];
  iAmAnonymous: boolean;
  penalties: { events: PenaltyEvent[]; balance: number };
  optLeft: number;
}

export interface ProgressData {
  challenge: Challenge;
  stats: ExtendedStats;
  statuses: Record<string, TaskStatus>;
  friends: LeaderRow[];
}

export interface AchievementView {
  def: AchievementDef;
  earned_at: string | null;
}

export interface ProfileData {
  user: User;
  global: ExtendedStats;
  achievements: AchievementView[];
  settings: NotificationSettings;
  friendPrefs: { user: User; enabled: boolean }[];
  challengeCount: number;
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

const localApi = {
  /* ---------- auth ---------- */

  async login(username: string, password: string): Promise<User> {
    if (WORKER_URL) return workerFetch("/login", { username, password });
    await lag();
    const db = loadDB();
    const u = db.users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
    if (!u) throw new Error("Unknown username. Try one of the demo accounts below.");
    if (u.password !== password) throw new Error("Incorrect password.");
    localStorage.setItem(SESSION_KEY, u.user_id);
    return u;
  },

  async register(username: string, password: string): Promise<User> {
    if (WORKER_URL) return workerFetch("/register", { username, password });
    await lag();
    const db = loadDB();
    const name = username.trim();
    if (name.length < 3) throw new Error("Username must be at least 3 characters.");
    if (db.users.some((x) => x.username.toLowerCase() === name.toLowerCase()))
      throw new Error("That username is already taken.");
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    const u: User = {
      user_id: `u_${Date.now().toString(36)}`,
      username: name,
      password,
      created_at: todayKey(),
    };
    db.users.push(u);
    db.notificationSettings.push({
      user_id: u.user_id,
      reminders_enabled: false,
      reminder_frequency: 2,
      reminder_start: "09:00",
      reminder_end: "22:00",
    });
    persist(db);
    localStorage.setItem(SESSION_KEY, u.user_id);
    return u;
  },

  logout() {
    localStorage.removeItem(SESSION_KEY);
  },

  sessionUser(): User | null {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) return null;
    return loadDB().users.find((u) => u.user_id === id) ?? null;
  },

  /* ---------- home ---------- */

  async getHome(userId: string): Promise<HomeData> {
    if (WORKER_URL) return workerFetch("/home", { userId });
    await lag();
    const db = loadDB();
    const today = todayKey();
    const views: TaskView[] = [];
    let totalPenalties = 0;

    for (const m of db.members.filter((x) => x.user_id === userId)) {
      const ch = challengeById(db, m.challenge_id);
      if (ch.end_date < today) continue; // only live challenges on Home
      const s = statsFor(db, ch, userId, m.joined_at);
      const byDate = new Map(tasksOf(db, ch.challenge_id, userId).map((t) => [t.date, t]));
      const status = statusFor(today, ch, byDate);
      const doneTask = byDate.get(today);
      const completion =
        status === "DONE" && doneTask
          ? db.completions.find((c) => c.task_id === doneTask.task_id) ?? null
          : null;
      totalPenalties += s.penalties;
      views.push({
        challenge: ch,
        anonymous: m.anonymous,
        status,
        streak: s.currentStreak,
        best: s.bestStreak,
        optLeft: optionalLeft(db, ch, userId),
        penalties: s.penalties,
        completion,
        deadlineOver: deadlinePassed(ch.deadline),
      });
    }

    const order: Record<TaskStatus, number> = { PENDING: 0, VACATION: 1, DONE: 2, MISSED: 3 };
    views.sort((a, b) => order[a.status] - order[b.status] || a.challenge.name.localeCompare(b.challenge.name));

    // owner broadcasts addressed to me (last 14 days)
    const memberships = db.members.filter((x) => x.user_id === userId);
    const cutoff = keyShift(today, -14);
    const announcements: AnnouncementView[] = db.announcements
      .filter(
        (a) =>
          a.created_at >= cutoff &&
          memberships.some((m) => m.challenge_id === a.challenge_id) &&
          (a.to_id === "all" || a.to_id === userId),
      )
      .map((a) => ({
        announcement_id: a.announcement_id,
        challengeName: db.challenges.find((c) => c.challenge_id === a.challenge_id)?.name ?? "",
        fromName: usernameOf(db, a.from_id),
        message: a.message,
        createdAt: a.created_at,
      }))
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
      .slice(0, 10);

    // friend activity for enabled friend-prefs
    const friendsActivity: FriendActivity[] = [];
    for (const m of memberships) {
      const ch = db.challenges.find((c) => c.challenge_id === m.challenge_id);
      if (!ch || ch.end_date < today) continue;
      for (const o of db.members.filter(
        (x) => x.challenge_id === m.challenge_id && x.user_id !== userId && !x.anonymous,
      )) {
        const pref = db.friendNotifications.find((f) => f.user_id === userId && f.friend_id === o.user_id);
        if (!pref || !pref.enabled) continue;
        const s = statsFor(db, ch, o.user_id, o.joined_at);
        friendsActivity.push({
          username: usernameOf(db, o.user_id),
          challengeName: ch.name,
          done: s.done,
          streak: s.currentStreak,
        });
      }
    }

    return { quote: randomQuote(), tasks: views, totalPenalties, announcements, friendsActivity };
  },

  /** shuffle a fresh motivational line (README §3) */
  async getQuote(): Promise<HomeData["quote"]> {
    await sleep(120);
    return randomQuote();
  },

  async completeTask(
    userId: string,
    challengeId: string,
    info: { duration: number | null; summary: string | null },
  ): Promise<{ newAchievements: string[] }> {
    if (WORKER_URL) return workerFetch("/task/complete", { userId, challengeId, ...info });
    await lag();
    const db = loadDB();
    const ch = challengeById(db, challengeId);
    const today = todayKey();
    const task_id = `${challengeId}__${userId}__${today}`;
    let task = db.dailyTasks.find((t) => t.task_id === task_id);
    if (task && task.status === "DONE") throw new Error("Today's task is already done.");
    if (!task) {
      task = { task_id, challenge_id: challengeId, user_id: userId, date: today, status: "PENDING", completed_at: null };
      db.dailyTasks.push(task);
    }
    task.status = "DONE";
    task.completed_at = new Date().toISOString();

    let comp = db.completions.find((c) => c.task_id === task_id);
    if (info.duration !== null || (info.summary && info.summary.trim())) {
      if (!comp) {
        comp = { task_id, duration: null, summary: null };
        db.completions.push(comp);
      }
      if (info.duration !== null) comp.duration = info.duration;
      if (info.summary && info.summary.trim()) comp.summary = info.summary.trim();
    }

    const newAchievements = evaluateAchievements(db, userId);
    persist(db);
    return { newAchievements };
  },

  async takeVacation(userId: string, challengeId: string): Promise<{ optLeft: number }> {
    if (WORKER_URL) return workerFetch("/task/vacation", { userId, challengeId });
    await lag();
    const db = loadDB();
    const ch = challengeById(db, challengeId);
    const today = todayKey();
    if (weekdayOf(today) === ch.main_vacation_day)
      throw new Error("Today is already the main vacation day.");
    const left = optionalLeft(db, ch, userId);
    if (left <= 0) throw new Error("No optional vacations left this week.");
    const task_id = `${challengeId}__${userId}__${today}`;
    let task = db.dailyTasks.find((t) => t.task_id === task_id);
    if (task && task.status === "DONE") throw new Error("Today is already completed.");
    if (!task) {
      task = { task_id, challenge_id: challengeId, user_id: userId, date: today, status: "PENDING", completed_at: null };
      db.dailyTasks.push(task);
    }
    task.status = "VACATION";
    task.completed_at = null;
    db.vacations.push({
      vacation_id: `v_${userId}_${today}_${Date.now().toString(36)}`,
      challenge_id: challengeId,
      user_id: userId,
      date: today,
      type: "optional",
    });
    persist(db);
    return { optLeft: left - 1 };
  },

  /* ---------- challenges ---------- */

  async getChallenges(userId: string): Promise<ChallengeCardData[]> {
    if (WORKER_URL) return workerFetch("/challenges", { userId });
    await lag();
    const db = loadDB();
    const today = todayKey();
    return db.challenges
      // hidden challenges are invite-only: only the owner ever sees them in the list
      .filter((c) => !c.hidden || c.owner_id === userId)
      .map((challenge) => {
        const member = memberOf(db, challenge.challenge_id, userId);
        const participants = db.members.filter((m) => m.challenge_id === challenge.challenge_id).length;
        const state: ChallengeCardData["state"] =
          challenge.end_date < today ? "ended" : member ? "joined" : "discover";
        return { challenge, member, participants, state };
      });
  },

  async enroll(challengeId: string, userId: string, anonymous: boolean): Promise<void> {
    if (WORKER_URL) return workerFetch("/challenge/enroll", { challengeId, userId, anonymous });
    await lag();
    const db = loadDB();
    challengeById(db, challengeId);
    if (memberOf(db, challengeId, userId)) throw new Error("Already enrolled.");
    db.members.push({
      challenge_id: challengeId,
      user_id: userId,
      role: "member",
      anonymous,
      joined_at: todayKey(),
    });
    evaluateAchievements(db, userId);
    persist(db);
  },

  async createChallenge(
    userId: string,
    input: {
      name: string;
      description: string;
      rules: string[];
      icon: Challenge["icon"];
      start_date: string;
      end_date: string;
      deadline: string;
      penalty_points: number;
      main_vacation_day: Challenge["main_vacation_day"];
      optional_vacations_per_week: number;
      hidden: boolean;
    },
  ): Promise<Challenge> {
    if (WORKER_URL) return workerFetch("/challenge/create", { userId, ...input });
    await lag();
    const db = loadDB();
    const ch: Challenge = {
      challenge_id: `c_${Date.now().toString(36)}`,
      name: input.name.trim(),
      icon: input.icon,
      description: input.description.trim(),
      rules: input.rules,
      owner_id: userId,
      start_date: input.start_date,
      end_date: input.end_date,
      deadline: input.deadline,
      penalty_points: input.penalty_points,
      main_vacation_day: input.main_vacation_day,
      optional_vacations_per_week: input.optional_vacations_per_week,
      created_at: todayKey(),
      hidden: input.hidden,
    };
    // no participants are added at creation — people discover the challenge,
    // or (for hidden ones) receive an invite from the owner
    db.challenges.push(ch);
    db.members.push({ challenge_id: ch.challenge_id, user_id: userId, role: "owner", anonymous: false, joined_at: todayKey() });
    persist(db);
    return ch;
  },

  async getChallengeDetail(userId: string, challengeId: string): Promise<DetailData> {
    if (WORKER_URL) return workerFetch("/challenge/detail", { userId, challengeId });
    await lag();
    const db = loadDB();
    const ch = challengeById(db, challengeId);
    const member = memberOf(db, challengeId, userId);
    const today = todayKey();

    const allMembers = db.members.filter((m) => m.challenge_id === challengeId);
    const visible = allMembers.filter((m) => !m.anonymous);

    const rows: LeaderRow[] = visible.map((m) => {
      const s = statsFor(db, ch, m.user_id, m.joined_at);
      return {
        user_id: m.user_id,
        username: usernameOf(db, m.user_id),
        anonymous: false,
        streak: s.currentStreak,
        best: s.bestStreak,
        done: s.done,
        penalties: s.penalties,
        completionPct: s.completionPct,
        isYou: m.user_id === userId,
      };
    });
    rows.sort((a, b) => b.streak - a.streak || b.best - a.best || b.done - a.done);

    const weekStart = weekStartKey(today);
    const byDate = member
      ? new Map(tasksOf(db, challengeId, userId).map((t) => [t.date, t]))
      : new Map<string, DailyTask>();
    const week: WeekDayView[] = rangeKeys(weekStart, keyShift(weekStart, 6)).map((k) => ({
      key: k,
      label: WEEKDAY_SHORT[weekdayOf(k)],
      dayNum: Number(k.slice(8)),
      status: member ? statusFor(k, ch, byDate) : "PENDING",
      isToday: k === today,
      isMain: weekdayOf(k) === ch.main_vacation_day,
    }));

    const events: PenaltyEvent[] = [];
    if (member) {
      const removedDates = new Set(
        db.penaltyRemovals.filter((p) => p.challenge_id === challengeId && p.user_id === userId).map((p) => p.date),
      );
      const start = member.joined_at > ch.start_date ? member.joined_at : ch.start_date;
      const end = ch.end_date < today ? ch.end_date : today;
      for (const k of rangeKeys(start, end)) {
        if (statusFor(k, ch, byDate) === "MISSED") {
          events.push({ date: k, reason: "Missed task", points: ch.penalty_points, removable: !removedDates.has(k) });
        }
      }
      for (const p of db.penaltyRemovals.filter(
        (x) => x.challenge_id === challengeId && x.user_id === userId,
      )) {
        events.push({ date: p.date, reason: "Penalty removed", points: -p.points, removable: false });
      }
      events.sort((a, b) => b.date.localeCompare(a.date));
    }

    return {
      challenge: ch,
      member,
      participants: visible.map((m) => ({
        user_id: m.user_id,
        username: usernameOf(db, m.user_id),
        role: m.role,
        isYou: m.user_id === userId,
      })),
      hiddenCount: allMembers.length - visible.length,
      myStats: member ? statsFor(db, ch, userId, member.joined_at) : null,
      week,
      leaderboard: rows,
      iAmAnonymous: member?.anonymous ?? false,
      penalties: {
        events,
        balance: member ? penaltyBalance(db, ch, userId, member.joined_at) : 0,
      },
      optLeft: member ? optionalLeft(db, ch, userId) : 0,
    };
  },

  /* ---------- progress ---------- */

  async getProgress(userId: string, challengeId: string): Promise<ProgressData> {
    if (WORKER_URL) return workerFetch("/progress", { userId, challengeId });
    await lag();
    const db = loadDB();
    const ch = challengeById(db, challengeId);
    const member = memberOf(db, challengeId, userId);
    if (!member) throw new Error("Not a member of this challenge.");
    const today = todayKey();
    const stats = statsFor(db, ch, userId, member.joined_at);

    const start = member.joined_at > ch.start_date ? member.joined_at : ch.start_date;
    const end = ch.end_date < today ? ch.end_date : today;
    const tasks = tasksOf(db, challengeId, userId);
    const byDate = new Map(tasks.map((t) => [t.date, t]));
    const statuses: Record<string, TaskStatus> = {};
    for (const k of rangeKeys(start, end)) statuses[k] = statusFor(k, ch, byDate);

    const friends: LeaderRow[] = db.members
      .filter((m) => m.challenge_id === challengeId && !m.anonymous)
      .map((m) => {
        const s = statsFor(db, ch, m.user_id, m.joined_at);
        return {
          user_id: m.user_id,
          username: usernameOf(db, m.user_id),
          anonymous: false,
          streak: s.currentStreak,
          best: s.bestStreak,
          done: s.done,
          penalties: s.penalties,
          completionPct: s.completionPct,
          isYou: m.user_id === userId,
        };
      })
      .sort((a, b) => b.completionPct - a.completionPct);

    return { challenge: ch, stats, statuses, friends };
  },

  /* ---------- profile ---------- */

  async getProfile(userId: string): Promise<ProfileData> {
    if (WORKER_URL) return workerFetch("/profile", { userId });
    await lag();
    const db = loadDB();
    const user = db.users.find((u) => u.user_id === userId);
    if (!user) throw new Error("User not found.");
    const global = globalStats(db, userId);

    const earnedMap = new Map(
      db.userAchievements.filter((a) => a.user_id === userId).map((a) => [a.achievement_id, a.earned_at]),
    );
    const achievements: AchievementView[] = ACHIEVEMENTS.map((def) => ({
      def,
      earned_at: earnedMap.get(def.id) ?? null,
    })).sort((a, b) => Number(b.earned_at !== null) - Number(a.earned_at !== null));

    const settings: NotificationSettings = db.notificationSettings.find(
      (s) => s.user_id === userId,
    ) ?? {
      user_id: userId,
      reminders_enabled: false,
      reminder_frequency: 2,
      reminder_start: "09:00",
      reminder_end: "22:00",
    };

    // friends = visible co-members across shared challenges (anonymous never appear)
    const friendIds = new Set<string>();
    const myChallenges = db.members.filter((m) => m.user_id === userId).map((m) => m.challenge_id);
    for (const m of db.members) {
      if (myChallenges.includes(m.challenge_id) && m.user_id !== userId && !m.anonymous) {
        friendIds.add(m.user_id);
      }
    }
    const friendPrefs = [...friendIds]
      .map((fid) => ({
        user: db.users.find((u) => u.user_id === fid)!,
        enabled: db.friendNotifications.find((f) => f.user_id === userId && f.friend_id === fid)?.enabled ?? false,
      }))
      .filter((f) => f.user)
      .sort((a, b) => a.user.username.localeCompare(b.user.username));

    return {
      user,
      global,
      achievements,
      settings,
      friendPrefs,
      challengeCount: myChallenges.length,
    };
  },

  async saveSettings(userId: string, s: Omit<NotificationSettings, "user_id">): Promise<void> {
    if (WORKER_URL) return workerFetch("/settings/save", { userId, ...s });
    await lag();
    const db = loadDB();
    const existing = db.notificationSettings.find((x) => x.user_id === userId);
    if (existing) Object.assign(existing, s);
    else db.notificationSettings.push({ user_id: userId, ...s });
    persist(db);
  },

  async saveFriendPrefs(userId: string, prefs: { friend_id: string; enabled: boolean }[]): Promise<void> {
    if (WORKER_URL) return workerFetch("/settings/friends", { userId, prefs });
    await lag();
    const db = loadDB();
    db.friendNotifications = db.friendNotifications.filter((f) => f.user_id !== userId);
    for (const p of prefs) db.friendNotifications.push({ user_id: userId, ...p });
    persist(db);
  },

  async removePenalty(userId: string, challengeId: string, date: string): Promise<void> {
    if (WORKER_URL) return workerFetch("/penalty/remove", { userId, challengeId, date });
    await lag();
    const db = loadDB();
    const ch = challengeById(db, challengeId);
    db.penaltyRemovals.push({
      removal_id: `pr_${Date.now().toString(36)}`,
      challenge_id: challengeId,
      user_id: userId,
      date,
      points: ch.penalty_points,
      created_at: todayKey(),
    });
    persist(db);
  },

  /** lower the penalty balance by one penalty-step; logged as a −points event (README §14) */
  async decreasePenalty(userId: string, challengeId: string): Promise<void> {
    if (WORKER_URL) return workerFetch("/penalty/decrease", { userId, challengeId });
    await lag();
    const db = loadDB();
    const ch = challengeById(db, challengeId);
    const balance = penaltyBalance(db, ch, userId);
    if (balance <= 0) throw new Error("Penalty balance is already zero.");
    db.penaltyRemovals.push({
      removal_id: `pr_${Date.now().toString(36)}`,
      challenge_id: challengeId,
      user_id: userId,
      date: todayKey(),
      points: Math.min(ch.penalty_points, balance),
      created_at: todayKey(),
    });
    persist(db);
  },

  /* ---------- owner tools ---------- */

  async endChallenge(userId: string, challengeId: string, confirmName: string): Promise<void> {
    if (WORKER_URL) return workerFetch("/challenge/end", { userId, challengeId, confirmName });
    await lag();
    const db = loadDB();
    const ch = challengeById(db, challengeId);
    const m = memberOf(db, challengeId, userId);
    if (!m || m.role !== "owner") throw new Error("Only the owner can end this challenge.");
    if (confirmName !== ch.name) throw new Error("Challenge name doesn't match — nothing was changed.");
    ch.end_date = keyShift(todayKey(), -1);
    persist(db);
  },

  async deleteChallenge(userId: string, challengeId: string, confirmName: string): Promise<void> {
    if (WORKER_URL) return workerFetch("/challenge/delete", { userId, challengeId, confirmName });
    await lag();
    const db = loadDB();
    const ch = challengeById(db, challengeId);
    const m = memberOf(db, challengeId, userId);
    if (!m || m.role !== "owner") throw new Error("Only the owner can delete this challenge.");
    if (confirmName !== ch.name) throw new Error("Challenge name doesn't match — nothing was deleted.");
    const taskIds = new Set(db.dailyTasks.filter((t) => t.challenge_id === challengeId).map((t) => t.task_id));
    db.members = db.members.filter((x) => x.challenge_id !== challengeId);
    db.dailyTasks = db.dailyTasks.filter((t) => t.challenge_id !== challengeId);
    db.completions = db.completions.filter((c) => !taskIds.has(c.task_id));
    db.vacations = db.vacations.filter((v) => v.challenge_id !== challengeId);
    db.penaltyRemovals = db.penaltyRemovals.filter((p) => p.challenge_id !== challengeId);
    db.invites = db.invites.filter((i) => i.challenge_id !== challengeId);
    db.announcements = db.announcements.filter((a) => a.challenge_id !== challengeId);
    db.challenges = db.challenges.filter((c) => c.challenge_id !== challengeId);
    persist(db);
  },

  async leaveChallenge(userId: string, challengeId: string): Promise<void> {
    if (WORKER_URL) return workerFetch("/challenge/leave", { userId, challengeId });
    await lag();
    const db = loadDB();
    const m = memberOf(db, challengeId, userId);
    if (!m) throw new Error("You are not a member.");
    if (m.role === "owner") throw new Error("Owners can't leave — end or delete the challenge instead.");
    db.members = db.members.filter((x) => !(x.challenge_id === challengeId && x.user_id === userId));
    persist(db);
  },

  async removeParticipant(userId: string, challengeId: string, targetId: string): Promise<void> {
    if (WORKER_URL) return workerFetch("/challenge/removeParticipant", { userId, challengeId, targetId });
    await lag();
    const db = loadDB();
    const m = memberOf(db, challengeId, userId);
    if (!m || m.role !== "owner") throw new Error("Only the owner can remove participants.");
    if (targetId === userId) throw new Error("That's you — owners can't be removed.");
    db.members = db.members.filter((x) => !(x.challenge_id === challengeId && x.user_id === targetId));
    persist(db);
  },

  /* ---------- invites (hidden challenges) ---------- */

  async sendInvite(userId: string, challengeId: string, targetIds: string[]): Promise<{ sent: number }> {
    if (WORKER_URL) return workerFetch("/challenge/invite", { userId, challengeId, targetIds });
    await lag();
    const db = loadDB();
    const m = memberOf(db, challengeId, userId);
    if (!m || m.role !== "owner") throw new Error("Only the owner can invite people.");
    let sent = 0;
    for (const uid of targetIds) {
      if (uid === userId) continue;
      if (memberOf(db, challengeId, uid)) continue;
      if (db.invites.some((i) => i.challenge_id === challengeId && i.to_id === uid && i.status === "pending")) continue;
      db.invites.push({
        invite_id: `inv_${Date.now().toString(36)}_${sent}`,
        challenge_id: challengeId,
        from_id: userId,
        to_id: uid,
        status: "pending",
        created_at: todayKey(),
      });
      sent++;
    }
    persist(db);
    return { sent };
  },

  async myInvites(userId: string): Promise<InviteView[]> {
    if (WORKER_URL) return workerFetch("/invites", { userId });
    await sleep(90);
    const db = loadDB();
    const out: InviteView[] = [];
    for (const i of db.invites.filter((x) => x.to_id === userId && x.status === "pending")) {
      const ch = db.challenges.find((c) => c.challenge_id === i.challenge_id);
      if (!ch) continue;
      out.push({
        invite_id: i.invite_id,
        challenge_id: i.challenge_id,
        challenge_name: ch.name,
        from_name: usernameOf(db, i.from_id),
        created_at: i.created_at,
      });
    }
    return out;
  },

  async respondInvite(userId: string, inviteId: string, accept: boolean): Promise<void> {
    if (WORKER_URL) return workerFetch("/invites/respond", { userId, inviteId, accept });
    await lag();
    const db = loadDB();
    const inv = db.invites.find((i) => i.invite_id === inviteId && i.to_id === userId && i.status === "pending");
    if (!inv) throw new Error("Invite not found or already answered.");
    inv.status = accept ? "accepted" : "declined";
    if (accept && !memberOf(db, inv.challenge_id, userId)) {
      db.members.push({ challenge_id: inv.challenge_id, user_id: userId, role: "member", anonymous: false, joined_at: todayKey() });
    }
    persist(db);
  },

  /* ---------- owner broadcasts (12h slow mode) ---------- */

  async notifyParticipants(
    userId: string,
    challengeId: string,
    message: string,
    targetIds: string[] | "all",
  ): Promise<{ sentTo: number | "everyone" }> {
    if (WORKER_URL) return workerFetch("/challenge/notify", { userId, challengeId, message, targetIds });
    await lag();
    const db = loadDB();
    challengeById(db, challengeId);
    const m = memberOf(db, challengeId, userId);
    if (!m || m.role !== "owner") throw new Error("Only the owner can broadcast.");
    const msg = message.trim();
    if (!msg) throw new Error("Write a message first.");

    const H12 = 12 * 3600 * 1000;
    const last = db.announcements
      .filter((a) => a.challenge_id === challengeId && a.from_id === userId)
      .sort((a, b) => (b.ts ?? b.created_at).localeCompare(a.ts ?? a.created_at))[0];
    if (last && last.ts) {
      const lastTs = new Date(last.ts).getTime();
      if (Date.now() - lastTs < H12) {
        const waitMin = Math.ceil((H12 - (Date.now() - lastTs)) / 60000);
        const h = Math.floor(waitMin / 60), mm = waitMin % 60;
        throw new Error(`Slow mode — you can send the next message in ${h ? h + "h " : ""}${mm}m.`);
      }
    }

    const targets = targetIds === "all" ? ["all"] : targetIds.filter((t) => t !== userId);
    if (!targets.length) throw new Error("Pick at least one participant.");
    const ts = new Date().toISOString();
    targets.forEach((t, idx) => {
      db.announcements.push({
        announcement_id: `an_${Date.now().toString(36)}_${idx}`,
        challenge_id: challengeId,
        from_id: userId,
        to_id: t,
        message: msg,
        created_at: todayKey(),
        ts,
      });
    });
    persist(db);
    return { sentTo: targets[0] === "all" ? "everyone" : targets.length };
  },

  /** directory of registered users (for invite lists) */
  async listUsers(excludeId?: string): Promise<Pick<User, "user_id" | "username">[]> {
    if (WORKER_URL) return workerFetch("/users", { excludeId });
    await sleep(90);
    return loadDB()
      .users.filter((u) => u.user_id !== excludeId)
      .map(({ user_id, username }) => ({ user_id, username }));
  },

  /** wipe local demo data and reseed (dev convenience) */
  async resetDemo(): Promise<void> {
    await sleep(300);
    localStorage.removeItem(DB_KEY);
    cache = null;
    loadDB();
  },

  workerConfigured: WORKER_URL !== null,
  workerUrl: WORKER_URL,
};

/* ------------------------------------------------------------------ */
/* facade — routes every call to the Google Sheet (via the Worker)     */
/* when SHEETS_API_URL is set in ./googleSheets; otherwise the local   */
/* engine above keeps the app fully functional offline.                */
/*                                                                     */
/* Storage contract: the login SESSION is the only thing kept in the   */
/* browser. All main data (users, challenges, tasks, penalties…) lives */
/* in the Google Sheet and is never cached locally.                    */
/* ------------------------------------------------------------------ */

const SESSION_USER_KEY = "challengemate_session_user_v1";

function persistSession(u: User) {
  localStorage.setItem(SESSION_KEY, u.user_id);
  localStorage.setItem(
    SESSION_USER_KEY,
    JSON.stringify({ user_id: u.user_id, username: u.username, password: "", created_at: u.created_at }),
  );
  // never keep main data in the browser once the Sheet is the source of truth
  if (isSheetsConfigured()) localStorage.removeItem(DB_KEY);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
}

function storedSessionUser(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    if (raw) return JSON.parse(raw) as User;
  } catch {
    /* corrupted session → treat as logged out */
  }
  // legacy demo sessions only stored an id — resolve it against the local DB
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  return loadDB().users.find((u) => u.user_id === id) ?? null;
}

export const api = new Proxy(localApi, {
  get(target, prop: string) {
    // connection status reflects the hardcoded backend URL
    if (prop === "workerConfigured") return isSheetsConfigured();
    if (prop === "workerUrl") return SHEETS_API_URL.trim() || null;

    // --- session lives in the browser, everything else lives in the Sheet ---
    if (prop === "sessionUser") return storedSessionUser;
    if (prop === "logout") return clearSession;
    if (prop === "login" || prop === "register") {
      const fn =
        isSheetsConfigured() && prop in sheetsApi
          ? (sheetsApi as unknown as Record<string, (a: string, b: string) => Promise<User>>)[prop]
          : (target as unknown as Record<string, (a: string, b: string) => Promise<User>>)[prop];
      return async (username: string, password: string) => {
        const u = await fn(username, password);
        persistSession(u);
        return u;
      };
    }

    if (isSheetsConfigured() && prop !== "resetDemo" && prop in sheetsApi) {
      return (sheetsApi as unknown as Record<string, unknown>)[prop];
    }
    return (target as unknown as Record<string, unknown>)[prop];
  },
}) as typeof localApi;

export type { Challenge, Member, TaskStatus, User };
export { isoWeekOf };
