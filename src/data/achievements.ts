import type { ExtendedStats } from "../types";

/**
 * Achievement definitions (README §21–22). Structured so each entry can
 * later render as a visual badge with icon / name / requirement / rarity.
 */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  requirement: string;
  icon: "flame" | "shield" | "bolt" | "book" | "target" | "calendar" | "star" | "trophy";
  check: (s: ExtendedStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_spark",
    name: "First Spark",
    description: "Completed 3 consecutive days.",
    requirement: "3-day streak",
    icon: "flame",
    check: (s) => s.bestStreak >= 3,
  },
  {
    id: "week_warrior",
    name: "Week Warrior",
    description: "A full week without breaking the chain.",
    requirement: "7-day streak",
    icon: "shield",
    check: (s) => s.bestStreak >= 7,
  },
  {
    id: "on_fire",
    name: "On Fire",
    description: "Reached a 30-day streak.",
    requirement: "30-day streak",
    icon: "bolt",
    check: (s) => s.bestStreak >= 30,
  },
  {
    id: "bookworm",
    name: "Bookworm",
    description: "Completed 50 challenge tasks.",
    requirement: "50 tasks",
    icon: "book",
    check: (s) => s.done >= 50,
  },
  {
    id: "dedicated",
    name: "Dedicated",
    description: "Completed 100 challenge tasks.",
    requirement: "100 tasks",
    icon: "target",
    check: (s) => s.done >= 100,
  },
  {
    id: "perfect_week",
    name: "Perfect Week",
    description: "Completed every applicable task for one week.",
    requirement: "Flawless week",
    icon: "calendar",
    check: (s) => s.perfectWeeks >= 1,
  },
  {
    id: "marathoner",
    name: "Marathoner",
    description: "Logged 90+ minutes in a single day.",
    requirement: "90 min in one day",
    icon: "star",
    check: (s) => s.maxDayMinutes >= 90,
  },
  {
    id: "comeback",
    name: "Comeback",
    description: "Completed a task the day right after a miss.",
    requirement: "Bounce back",
    icon: "trophy",
    check: (s) => s.comeback,
  },
];
