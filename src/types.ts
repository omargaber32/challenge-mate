/**
 * ChallengeMate domain types — these mirror the Google Sheets schema
 * that the Cloudflare Worker persists to (see README §23).
 */

export type TaskStatus = "PENDING" | "DONE" | "MISSED" | "VACATION";
export type VacationType = "main" | "optional";
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
export type ChallengeIcon = "book" | "code" | "language" | "run" | "study" | "write" | "goal";

export interface User {
  user_id: string;
  username: string;
  password: string;
  created_at: string; // date key yyyy-mm-dd
}

export interface Challenge {
  challenge_id: string;
  name: string;
  icon: ChallengeIcon;
  description: string;
  rules: string[];
  owner_id: string;
  start_date: string; // yyyy-mm-dd
  end_date: string;
  deadline: string; // "23:00"
  penalty_points: number;
  main_vacation_day: Weekday;
  optional_vacations_per_week: number;
  created_at: string;
  /** hidden challenges are invite-only: only the owner sees them in the list */
  hidden?: boolean;
}

export interface Member {
  challenge_id: string;
  user_id: string;
  role: "owner" | "member";
  anonymous: boolean;
  joined_at: string;
}

export interface DailyTask {
  task_id: string;
  challenge_id: string;
  user_id: string;
  date: string; // yyyy-mm-dd
  status: TaskStatus;
  completed_at: string | null; // ISO datetime
}

export interface Completion {
  task_id: string;
  duration: number | null; // minutes
  summary: string | null;
}

export interface Vacation {
  vacation_id: string;
  challenge_id: string;
  user_id: string;
  date: string;
  type: VacationType;
}

export interface PenaltyRemoval {
  removal_id: string;
  challenge_id: string;
  user_id: string;
  date: string; // the date of the missed task being forgiven
  points: number;
  created_at: string;
}

export interface Invite {
  invite_id: string;
  challenge_id: string;
  from_id: string;
  to_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
}

export interface Announcement {
  announcement_id: string;
  challenge_id: string;
  from_id: string;
  to_id: string; // "all" or a user_id
  message: string;
  created_at: string; // yyyy-mm-dd (display)
  ts?: string; // full ISO datetime — drives the 12h slow-mode check
}

export interface NotificationSettings {
  user_id: string;
  reminders_enabled: boolean;
  reminder_frequency: 1 | 2 | 3; // hours
  reminder_start: string; // "09:00"
  reminder_end: string; // "22:00"
}

export interface FriendNotification {
  user_id: string;
  friend_id: string;
  enabled: boolean;
}

export interface EarnedAchievement {
  user_id: string;
  achievement_id: string;
  earned_at: string;
}

export interface DB {
  users: User[];
  challenges: Challenge[];
  members: Member[];
  dailyTasks: DailyTask[];
  completions: Completion[];
  vacations: Vacation[];
  penaltyRemovals: PenaltyRemoval[];
  notificationSettings: NotificationSettings[];
  friendNotifications: FriendNotification[];
  userAchievements: EarnedAchievement[];
  invites: Invite[];
  announcements: Announcement[];
}

/* ---------- computed shapes ---------- */

export interface UserStats {
  currentStreak: number;
  bestStreak: number;
  done: number;
  missed: number;
  vacations: number;
  totalMinutes: number;
  completionPct: number; // 0–100, based on elapsed applicable days
  applicableDays: number; // done + missed (elapsed, non-vacation)
}

export interface ExtendedStats extends UserStats {
  perfectWeeks: number;
  maxDayMinutes: number;
  comeback: boolean;
  penalties: number; // penalty balance for the scope (challenge or global)
}
