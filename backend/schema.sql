-- ChallengeMate D1 schema (SQLite)
-- Deploy: wrangler d1 create challenge-mate
--         wrangler d1 execute challenge-mate --file=backend/schema.sql

CREATE TABLE IF NOT EXISTS Users (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Challenges (
  challenge_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'book',
  description TEXT NOT NULL DEFAULT '',
  rules TEXT NOT NULL DEFAULT '',
  owner_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  deadline TEXT NOT NULL DEFAULT '23:00',
  penalty_points INTEGER NOT NULL DEFAULT 1,
  main_vacation_day INTEGER NOT NULL DEFAULT 5,
  optional_vacations_per_week INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS Members (
  challenge_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  anonymous INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (challenge_id, user_id)
);

CREATE TABLE IF NOT EXISTS DailyTasks (
  task_id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_dailytasks_lookup ON DailyTasks(challenge_id, user_id, date);

CREATE TABLE IF NOT EXISTS Completions (
  task_id TEXT PRIMARY KEY,
  duration INTEGER,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS Vacations (
  vacation_id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vacations_lookup ON Vacations(challenge_id, user_id, date);

CREATE TABLE IF NOT EXISTS Penalties (
  penalty_id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_penalties_lookup ON Penalties(challenge_id, user_id);

CREATE TABLE IF NOT EXISTS Achievements (
  achievement_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  requirement TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS UserAchievements (
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS NotificationSettings (
  user_id TEXT PRIMARY KEY,
  reminders_enabled INTEGER NOT NULL DEFAULT 0,
  reminder_frequency INTEGER NOT NULL DEFAULT 2,
  reminder_start TEXT NOT NULL DEFAULT '09:00',
  reminder_end TEXT NOT NULL DEFAULT '22:00'
);

CREATE TABLE IF NOT EXISTS FriendNotifications (
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS Invites (
  invite_id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invites_lookup ON Invites(challenge_id, to_id);

CREATE TABLE IF NOT EXISTS Announcements (
  announcement_id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ts TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_lookup ON Announcements(challenge_id, created_at);
