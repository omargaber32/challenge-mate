import type {
  Challenge,
  Completion,
  DB,
  DailyTask,
  TaskStatus,
  User,
} from "../types";
import { addDays, dateKey, isoWeekOf, keyShift, pad2, rangeKeys, todayKey, weekdayOf } from "../utils/dates";

/* deterministic PRNG so every seed looks hand-placed */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T = new Date();
const d = (n: number) => dateKey(addDays(T, n));

export const SEED_USERS: User[] = [
  { user_id: "u_omar", username: "omar", password: "demo123", created_at: d(-140) },
  { user_id: "u_ahmed", username: "ahmed", password: "demo123", created_at: d(-132) },
  { user_id: "u_sara", username: "sara", password: "demo123", created_at: d(-121) },
  { user_id: "u_mohamed", username: "mohamed", password: "demo123", created_at: d(-110) },
  { user_id: "u_layla", username: "layla", password: "demo123", created_at: d(-96) },
];

export const SEED_CHALLENGES: Challenge[] = [
  {
    challenge_id: "c_reading",
    name: "Reading Challenge",
    icon: "book",
    description: "The goal is to read every day — at least 20 pages or 30 minutes, whatever keeps the pages turning.",
    rules: [
      "Read for at least 30 minutes (or 20 pages).",
      "Mark the task as done before the daily deadline.",
      "Friday is the main vacation day — automatic rest.",
      "You have one optional vacation per week, use it on any other day.",
      "Missing a task gives you 1 penalty point.",
    ],
    owner_id: "u_sara",
    start_date: d(-62),
    end_date: d(28),
    deadline: "23:00",
    penalty_points: 1,
    main_vacation_day: 5,
    optional_vacations_per_week: 1,
    created_at: d(-66),
  },
  {
    challenge_id: "c_code",
    name: "30-Day Code Sprint",
    icon: "code",
    description: "Ship something small every day: a kata, a PR, a refactor. Momentum over perfection.",
    rules: [
      "Code for at least 30 minutes daily.",
      "Mark the task done before 22:00.",
      "Sunday is the main vacation day.",
      "No optional vacations — this one is a sprint.",
      "Missing a day costs 2 penalty points.",
    ],
    owner_id: "u_ahmed",
    start_date: d(-20),
    end_date: d(10),
    deadline: "22:00",
    penalty_points: 2,
    main_vacation_day: 0,
    optional_vacations_per_week: 0,
    created_at: d(-24),
  },
  {
    challenge_id: "c_german",
    name: "German A1 Sprint",
    icon: "language",
    description: "Sixty days of daily German — vocabulary, grammar drills and at least one ear-training session.",
    rules: [
      "Study German for at least 20 minutes.",
      "Mark the task done before 21:00.",
      "Saturday is the main vacation day.",
      "One optional vacation per week.",
      "Missing a task gives you 1 penalty point.",
    ],
    owner_id: "u_mohamed",
    start_date: d(-95),
    end_date: d(-35),
    deadline: "21:00",
    penalty_points: 1,
    main_vacation_day: 6,
    optional_vacations_per_week: 1,
    created_at: d(-99),
  },
  {
    challenge_id: "c_run",
    name: "Morning Run Club",
    icon: "run",
    description: "Lace up before the day starts. Any distance counts, consistency is the whole game.",
    rules: [
      "Run (or walk-run) at least 20 minutes.",
      "Mark the task done before 08:00 — it is a *morning* club.",
      "Wednesday is the main vacation day.",
      "One optional vacation per week.",
      "Missing a session gives you 1 penalty point.",
    ],
    owner_id: "u_sara",
    start_date: d(-2),
    end_date: d(40),
    deadline: "08:00",
    penalty_points: 1,
    main_vacation_day: 3,
    optional_vacations_per_week: 1,
    created_at: d(-4),
  },
];

const SKILL: Record<string, number> = {
  u_omar: 0.88,
  u_ahmed: 0.94,
  u_sara: 0.8,
  u_mohamed: 0.62,
  u_layla: 0.85,
};

/** how many applicable days back each user's current streak reaches */
const STREAK_TARGET: Record<string, Record<string, number>> = {
  c_reading: { u_ahmed: 21, u_omar: 12, u_layla: 9, u_sara: 8, u_mohamed: 6 },
  c_code: { u_ahmed: 9, u_omar: 5 },
};

const SUMMARIES: Record<string, string[]> = {
  book: [
    "Chapters 5–7 of “Deep Work”",
    "20 pages of “Atomic Habits”",
    "Finished “The Pragmatic Programmer” ch. 4",
    "Evening session — 30 pages with notes",
    "Re-read yesterday's highlights + 15 new pages",
  ],
  code: [
    "Solved 2 katas on generics",
    "Refactored the auth module",
    "Built the REST client layer",
    "Code review + one PR merged",
    "Debugged the worker queue retries",
  ],
  language: [
    "Unit 4 + vocab flashcards",
    "Watched a show with German subtitles",
    "der/die/das drills, 3 rounds",
    "Wrote a short self-intro paragraph",
  ],
  run: [
    "5K easy pace along the river",
    "Intervals: 6 × 400m",
    "30 min zone-2 jog",
    "Hill repeats + stretching",
  ],
};

const DURATION_RANGE: Record<string, [number, number]> = {
  book: [25, 75],
  code: [35, 95],
  language: [20, 50],
  run: [25, 60],
  study: [20, 60],
  write: [20, 60],
  goal: [15, 50],
};

export function buildSeedDB(): DB {
  const today = todayKey();
  const users = structuredClone(SEED_USERS);
  const challenges = structuredClone(SEED_CHALLENGES);

  const members: DB["members"] = [
    { challenge_id: "c_reading", user_id: "u_sara", role: "owner", anonymous: false, joined_at: challenges[0].start_date },
    { challenge_id: "c_reading", user_id: "u_omar", role: "member", anonymous: false, joined_at: challenges[0].start_date },
    { challenge_id: "c_reading", user_id: "u_ahmed", role: "member", anonymous: false, joined_at: challenges[0].start_date },
    { challenge_id: "c_reading", user_id: "u_mohamed", role: "member", anonymous: false, joined_at: keyShift(challenges[0].start_date, 3) },
    { challenge_id: "c_reading", user_id: "u_layla", role: "member", anonymous: true, joined_at: keyShift(challenges[0].start_date, 5) },
    { challenge_id: "c_code", user_id: "u_ahmed", role: "owner", anonymous: false, joined_at: challenges[1].start_date },
    { challenge_id: "c_code", user_id: "u_omar", role: "member", anonymous: false, joined_at: keyShift(challenges[1].start_date, 1) },
    { challenge_id: "c_german", user_id: "u_omar", role: "member", anonymous: false, joined_at: challenges[2].start_date },
    { challenge_id: "c_german", user_id: "u_sara", role: "member", anonymous: false, joined_at: challenges[2].start_date },
    // c_run intentionally has zero members — discovery/enrollment flow (README §5)
  ];

  const dailyTasks: DailyTask[] = [];
  const completions: Completion[] = [];
  const vacations: DB["vacations"] = [];

  for (const m of members) {
    const ch = challenges.find((c) => c.challenge_id === m.challenge_id)!;
    const lastGenerated = ch.end_date < today ? ch.end_date : keyShift(today, -1);
    if (lastGenerated < ch.start_date) continue;
    const keys = rangeKeys(ch.start_date, lastGenerated);
    const rng = mulberry32(hashStr(`${m.user_id}:${m.challenge_id}`));
    const skill = SKILL[m.user_id] ?? 0.8;
    const statuses = new Map<string, TaskStatus>();

    for (const k of keys) {
      if (weekdayOf(k) === ch.main_vacation_day) {
        statuses.set(k, "VACATION");
        continue;
      }
      const r = rng();
      if (r < skill) statuses.set(k, "DONE");
      else if (r < skill + 0.05 && ch.optional_vacations_per_week > 0) statuses.set(k, "VACATION");
      else statuses.set(k, "MISSED");
    }

    // enforce the weekly optional-vacation allowance
    if (ch.optional_vacations_per_week > 0) {
      const byWeek = new Map<string, string[]>();
      for (const k of keys) {
        if (statuses.get(k) === "VACATION" && weekdayOf(k) !== ch.main_vacation_day) {
          const w = isoWeekOf(k);
          byWeek.set(w, [...(byWeek.get(w) ?? []), k]);
        }
      }
      for (const days of byWeek.values()) {
        for (let i = ch.optional_vacations_per_week; i < days.length; i++) {
          statuses.set(days[i], "DONE");
        }
      }
    }

    // pin the most recent applicable days to DONE so current streaks read naturally
    const target = STREAK_TARGET[m.challenge_id]?.[m.user_id] ?? 0;
    if (target > 0) {
      let applicable = 0;
      for (let i = keys.length - 1; i >= 0 && applicable < target; i--) {
        if (weekdayOf(keys[i]) === ch.main_vacation_day) continue;
        statuses.set(keys[i], "DONE");
        applicable++;
      }
    }

    const summaries = SUMMARIES[ch.icon] ?? SUMMARIES.book;
    const [lo, hi] = DURATION_RANGE[ch.icon] ?? [20, 60];

    for (const k of keys) {
      const status = statuses.get(k) ?? "MISSED";
      const task_id = `${m.challenge_id}__${m.user_id}__${k}`;
      let completed_at: string | null = null;

      if (status === "DONE") {
        const h = 7 + Math.floor(rng() * 15);
        completed_at = `${k}T${pad2(h)}:${pad2(Math.floor(rng() * 60))}:00`;
        const duration = rng() < 0.12 ? null : lo + Math.floor(rng() * (hi - lo));
        const summary = rng() < 0.25 ? null : summaries[Math.floor(rng() * summaries.length)];
        if (duration !== null || summary !== null) {
          completions.push({ task_id, duration, summary });
        }
      } else if (status === "VACATION" && weekdayOf(k) !== ch.main_vacation_day) {
        vacations.push({
          vacation_id: `v_${m.user_id}_${k}`,
          challenge_id: m.challenge_id,
          user_id: m.user_id,
          date: k,
          type: "optional",
        });
      }

      dailyTasks.push({
        task_id,
        challenge_id: m.challenge_id,
        user_id: m.user_id,
        date: k,
        status,
        completed_at,
      });
    }
  }

  // a forgiven penalty for Sara, to show the removal-history rule (README §14)
  const penaltyRemovals: DB["penaltyRemovals"] = [];
  const saraMiss = dailyTasks.find(
    (t) => t.user_id === "u_sara" && t.challenge_id === "c_reading" && t.status === "MISSED",
  );
  if (saraMiss) {
    penaltyRemovals.push({
      removal_id: "pr_seed_1",
      challenge_id: "c_reading",
      user_id: "u_sara",
      date: saraMiss.date,
      points: 1,
      created_at: keyShift(saraMiss.date, 2),
    });
  }

  const notificationSettings: DB["notificationSettings"] = users.map((u) => ({
    user_id: u.user_id,
    reminders_enabled: u.user_id === "u_omar",
    reminder_frequency: 2 as const,
    reminder_start: "09:00",
    reminder_end: "22:00",
  }));

  const friendNotifications: DB["friendNotifications"] = [
    { user_id: "u_omar", friend_id: "u_ahmed", enabled: true },
    { user_id: "u_omar", friend_id: "u_sara", enabled: false },
    { user_id: "u_omar", friend_id: "u_mohamed", enabled: true },
    { user_id: "u_ahmed", friend_id: "u_omar", enabled: true },
  ];

  return {
    users,
    challenges,
    members,
    dailyTasks,
    completions,
    vacations,
    penaltyRemovals,
    notificationSettings,
    friendNotifications,
    userAchievements: [],
    invites: [],
    announcements: [
      {
        announcement_id: "an_seed_1",
        challenge_id: "c_reading",
        from_id: "u_sara",
        to_id: "all",
        message: "New month, same rules — let's keep the Friday vacations sacred. Happy reading! 📚",
        created_at: keyShift(todayKey(), -1),
      },
    ],
  };
}
