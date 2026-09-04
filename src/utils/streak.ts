import type { Challenge, Completion, DailyTask, ExtendedStats, TaskStatus } from "../types";
import { isoWeekOf, keyShift, rangeKeys, todayKey, weekdayOf } from "./dates";

/**
 * Resolve the status of a single date for a member. The backend owns this
 * logic (README §12) — this local engine reproduces the same rules:
 *  - main vacation day → VACATION (automatic)
 *  - past + untouched  → MISSED
 *  - today untouched   → PENDING
 */
export function statusFor(
  date: string,
  challenge: Challenge,
  byDate: Map<string, DailyTask>,
): TaskStatus {
  const stored = byDate.get(date);
  if (stored) return stored.status;
  const today = todayKey();
  // the main vacation day is ALWAYS a vacation — even today (README §9)
  if (weekdayOf(date) === challenge.main_vacation_day) return "VACATION";
  if (date === today) return "PENDING";
  return date < today ? "MISSED" : "PENDING";
}

/** Walk a challenge's elapsed days and derive streaks / counters (README §13). */
export function computeStats(
  challenge: Challenge,
  tasks: DailyTask[],
  completions: Completion[],
  from?: string, // membership start — days before joining are not counted
): ExtendedStats {
  const byDate = new Map(tasks.map((t) => [t.date, t]));
  const completionByTask = new Map(completions.map((c) => [c.task_id, c]));

  const today = todayKey();
  const end = challenge.end_date < today ? challenge.end_date : today;
  const start = from && from > challenge.start_date ? from : challenge.start_date;
  const keys = rangeKeys(start, end);

  let cur = 0;
  let best = 0;
  let done = 0;
  let missed = 0;
  let vacations = 0;
  let totalMinutes = 0;

  const doneDates = new Set<string>();
  const missedDates = new Set<string>();
  const minutesByDay = new Map<string, number>();
  const doneByWeek = new Map<string, number>();
  const missedByWeek = new Map<string, number>();

  for (const k of keys) {
    const s = statusFor(k, challenge, byDate);
    if (s === "DONE") {
      done++;
      cur++;
      if (cur > best) best = cur;
      doneDates.add(k);
      const w = isoWeekOf(k);
      doneByWeek.set(w, (doneByWeek.get(w) ?? 0) + 1);
      const c = completionByTask.get(byDate.get(k)?.task_id ?? "");
      if (c?.duration) {
        totalMinutes += c.duration;
        minutesByDay.set(k, (minutesByDay.get(k) ?? 0) + c.duration);
      }
    } else if (s === "MISSED") {
      missed++;
      cur = 0;
      missedDates.add(k);
      const w = isoWeekOf(k);
      missedByWeek.set(w, (missedByWeek.get(w) ?? 0) + 1);
    } else if (s === "VACATION") {
      vacations++;
      // vacations never break a streak (README §9/§10)
    }
  }

  let perfectWeeks = 0;
  for (const [week, doneCount] of doneByWeek) {
    const misses = missedByWeek.get(week) ?? 0;
    if (misses === 0 && doneCount >= 4) perfectWeeks++;
  }

  let comeback = false;
  for (const m of missedDates) {
    if (doneDates.has(keyShift(m, 1))) {
      comeback = true;
      break;
    }
  }

  let maxDayMinutes = 0;
  for (const v of minutesByDay.values()) if (v > maxDayMinutes) maxDayMinutes = v;

  const applicableDays = done + missed;
  const completionPct = applicableDays > 0 ? Math.round((done / applicableDays) * 100) : 0;

  return {
    currentStreak: cur,
    bestStreak: best,
    done,
    missed,
    vacations,
    totalMinutes,
    completionPct,
    applicableDays,
    perfectWeeks,
    maxDayMinutes,
    comeback,
    penalties: 0, // filled in by the API layer (penalties live in their own sheet)
  };
}
