/**
 * ChallengeMate backend - Cloudflare Worker with D1 database
 *
 * Setup:
 *   1. Create D1 database: wrangler d1 create challenge-mate
 *   2. Update database_id in wrangler.toml
 *   3. Run schema: wrangler d1 execute challenge-mate --file=backend/schema.sql
 *   4. Deploy: wrangler deploy
 */

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    let out;
    try {
      const body = JSON.parse((await request.text()) || "{}");
      out = await handle_(env.DB, body.action, body.payload || {});
    } catch (err) {
      out = { error: String((err && err.message) || err) };
    }

    return new Response(JSON.stringify(out), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};

/* ------------------------------------------------------------------ */
/* date helpers                                                        */
/* ------------------------------------------------------------------ */

const pad_ = (n) => String(n).padStart(2, "0");
const key_ = (d) => d.getUTCFullYear() + "-" + pad_(d.getUTCMonth() + 1) + "-" + pad_(d.getUTCDate());
const today_ = () => key_(new Date());
function parseKey_(k) {
  const p = String(k).split("-");
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
}
function addDays_(k, n) {
  const d = parseKey_(k);
  d.setUTCDate(d.getUTCDate() + n);
  return key_(d);
}
const weekday_ = (k) => parseKey_(k).getUTCDay();
function range_(a, b) {
  const out = [];
  let k = a;
  while (k <= b) {
    out.push(k);
    k = addDays_(k, 1);
  }
  return out;
}
function isoWeek_(k) {
  const d = parseKey_(k);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const w1 = Date.UTC(d.getUTCFullYear(), 0, 4);
  const w1day = (new Date(w1).getUTCDay() + 6) % 7;
  return d.getUTCFullYear() + "-W" + pad_(1 + Math.round(((d.getTime() - w1) / 864e5 - 3 + w1day) / 7));
}
const bool_ = (v) => v === true || v === 1 || v === "1";

/* ------------------------------------------------------------------ */
/* challenge coercion                                                  */
/* ------------------------------------------------------------------ */

function coerceChallenge_(c) {
  return {
    challenge_id: String(c.challenge_id),
    name: String(c.name || ""),
    icon: String(c.icon || "book"),
    description: String(c.description || ""),
    rules: String(c.rules || "").split("\n").map((r) => r.trim()).filter(Boolean),
    owner_id: String(c.owner_id || ""),
    start_date: String(c.start_date || ""),
    end_date: String(c.end_date || ""),
    deadline: String(c.deadline || "23:00"),
    penalty_points: Number(c.penalty_points) || 0,
    main_vacation_day: Number(c.main_vacation_day) || 0,
    optional_vacations_per_week: Number(c.optional_vacations_per_week) || 0,
    created_at: String(c.created_at || ""),
    hidden: bool_(c.hidden),
  };
}

/* ------------------------------------------------------------------ */
/* status logic                                                        */
/* ------------------------------------------------------------------ */

function statusFor_(date, ch, byDate) {
  if (byDate[date]) return String(byDate[date].status);
  const today = today_();
  if (weekday_(date) === Number(ch.main_vacation_day)) return "VACATION";
  if (date === today) return "PENDING";
  return date < today ? "MISSED" : "PENDING";
}

/* ------------------------------------------------------------------ */
/* stats computation                                                   */
/* ------------------------------------------------------------------ */

async function computeStats_(db, ch, uid, from) {
  const tasks = await db
    .prepare("SELECT * FROM DailyTasks WHERE challenge_id = ? AND user_id = ?")
    .bind(ch.challenge_id, uid)
    .all();

  const byDate = {};
  tasks.results.forEach((t) => {
    byDate[t.date] = t;
  });

  const comps = await db
    .prepare("SELECT * FROM Completions WHERE task_id IN (SELECT task_id FROM DailyTasks WHERE challenge_id = ? AND user_id = ?)")
    .bind(ch.challenge_id, uid)
    .all();

  const compByTask = {};
  comps.results.forEach((c) => {
    compByTask[c.task_id] = c;
  });

  const penRows = await db
    .prepare("SELECT points FROM Penalties WHERE challenge_id = ? AND user_id = ?")
    .bind(ch.challenge_id, uid)
    .all();

  const penSum = penRows.results.reduce((sum, p) => sum + Number(p.points || 0), 0);

  const today = today_();
  let start = ch.start_date;
  if (from && from > start) start = from;
  let end = ch.end_date < today ? ch.end_date : today;
  if (end < start) end = start;
  const keys = range_(start, end);

  let cur = 0,
    best = 0,
    done = 0,
    missed = 0,
    vac = 0,
    mins = 0;
  const doneDates = {},
    missedDates = {},
    minsByDay = {},
    doneByWeek = {},
    missedByWeek = {};

  keys.forEach((k) => {
    const s = statusFor_(k, ch, byDate);
    if (s === "DONE") {
      done++;
      cur++;
      if (cur > best) best = cur;
      doneDates[k] = 1;
      const w = isoWeek_(k);
      doneByWeek[w] = (doneByWeek[w] || 0) + 1;
      const t = byDate[k];
      const c = t && compByTask[t.task_id];
      if (c && c.duration !== null && c.duration !== "") {
        const dm = Number(c.duration);
        if (!isNaN(dm)) {
          mins += dm;
          minsByDay[k] = (minsByDay[k] || 0) + dm;
        }
      }
    } else if (s === "MISSED") {
      missed++;
      cur = 0;
      missedDates[k] = 1;
      const w = isoWeek_(k);
      missedByWeek[w] = (missedByWeek[w] || 0) + 1;
    } else if (s === "VACATION") {
      vac++;
    }
  });

  let perfect = 0;
  Object.keys(doneByWeek).forEach((w) => {
    if (!missedByWeek[w] && doneByWeek[w] >= 4) perfect++;
  });
  let maxDay = 0;
  Object.keys(minsByDay).forEach((k) => {
    if (minsByDay[k] > maxDay) maxDay = minsByDay[k];
  });
  let comeback = false;
  Object.keys(missedDates).forEach((m) => {
    if (doneDates[addDays_(m, 1)]) comeback = true;
  });
  const applicable = done + missed;

  return {
    currentStreak: cur,
    bestStreak: best,
    done,
    missed,
    vacations: vac,
    totalMinutes: mins,
    completionPct: applicable ? Math.round((done / applicable) * 100) : 0,
    applicableDays: applicable,
    perfectWeeks: perfect,
    maxDayMinutes: maxDay,
    comeback,
    penalties: Math.max(0, missed * Number(ch.penalty_points) + penSum),
  };
}

async function optLeft_(db, ch, uid) {
  if (Number(ch.optional_vacations_per_week) <= 0) return 0;
  const today = today_();
  const monday = addDays_(today, -((weekday_(today) + 6) % 7));
  const week = {};
  range_(monday, addDays_(monday, 6)).forEach((k) => {
    week[k] = 1;
  });

  const vacs = await db
    .prepare("SELECT date FROM Vacations WHERE challenge_id = ? AND user_id = ? AND type = 'optional'")
    .bind(ch.challenge_id, uid)
    .all();

  const used = vacs.results.filter((v) => week[v.date]).length;
  return Math.max(0, Number(ch.optional_vacations_per_week) - used);
}

/* ------------------------------------------------------------------ */
/* achievements                                                        */
/* ------------------------------------------------------------------ */

const ACH = [
  { id: "first_spark", name: "First Spark", description: "Completed 3 consecutive days.", requirement: "3-day streak", icon: "flame", check: (s) => s.bestStreak >= 3 },
  { id: "week_warrior", name: "Week Warrior", description: "A full week without breaking the chain.", requirement: "7-day streak", icon: "shield", check: (s) => s.bestStreak >= 7 },
  { id: "on_fire", name: "On Fire", description: "Reached a 30-day streak.", requirement: "30-day streak", icon: "bolt", check: (s) => s.bestStreak >= 30 },
  { id: "bookworm", name: "Bookworm", description: "Completed 50 challenge tasks.", requirement: "50 tasks", icon: "book", check: (s) => s.done >= 50 },
  { id: "dedicated", name: "Dedicated", description: "Completed 100 challenge tasks.", requirement: "100 tasks", icon: "target", check: (s) => s.done >= 100 },
  { id: "perfect_week", name: "Perfect Week", description: "Completed every applicable task for one week.", requirement: "Flawless week", icon: "calendar", check: (s) => s.perfectWeeks >= 1 },
  { id: "marathoner", name: "Marathoner", description: "Logged 90+ minutes in a single day.", requirement: "90 min in one day", icon: "star", check: (s) => s.maxDayMinutes >= 90 },
  { id: "comeback", name: "Comeback", description: "Completed a task the day right after a miss.", requirement: "Bounce back", icon: "trophy", check: (s) => s.comeback },
];

async function evaluateAchievements_(db, uid) {
  const memberships = await db.prepare("SELECT * FROM Members WHERE user_id = ?").bind(uid).all();
  const challenges = await db.prepare("SELECT * FROM Challenges").all();
  const chById = {};
  challenges.results.forEach((c) => {
    chById[c.challenge_id] = coerceChallenge_(c);
  });

  const g = {
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

  for (const m of memberships.results) {
    const ch = chById[m.challenge_id];
    if (!ch) continue;
    const s = await computeStats_(db, ch, uid, m.joined_at);
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

  const earned = await db.prepare("SELECT * FROM UserAchievements WHERE user_id = ?").bind(uid).all();
  const fresh = [];

  for (const def of ACH) {
    const has = earned.results.some((a) => a.achievement_id === def.id);
    if (!has && def.check(g)) {
      await db
        .prepare("INSERT INTO UserAchievements (user_id, achievement_id, earned_at) VALUES (?, ?, ?)")
        .bind(uid, def.id, today_())
        .run();
      fresh.push(def.name);
    }
  }

  return fresh;
}

/* ------------------------------------------------------------------ */
/* action handlers                                                     */
/* ------------------------------------------------------------------ */

const QUOTES = [
  "Small progress is still progress.",
  "You don't need motivation. You need consistency.",
  "One more day. Keep the streak alive! 🔥",
  "Discipline is choosing what you want most over what you want now.",
  "A river cuts through rock not because of its power, but its persistence.",
  "Miss once, never twice.",
  "Future you is watching. Make them proud.",
  "Thirty minutes today beats ten hours someday.",
];

async function handle_(db, action, p) {
  if (action === "ping") {
    return { pong: true, title: "ChallengeMate" };
  }

  if (action === "quote") {
    return { text: QUOTES[Math.floor(Math.random() * QUOTES.length)], author: "ChallengeMate" };
  }

  /* ---------- auth ---------- */

  if (action === "login") {
    const users = await db.prepare("SELECT * FROM Users WHERE username = ?").bind(String(p.username || "").trim().toLowerCase()).all();
    if (users.results.length === 0) {
      return { error: "Unknown username. Try one of the accounts in the Users table, or create one." };
    }
    const u = users.results[0];
    if (String(u.password) !== String(p.password)) {
      return { error: "Incorrect password." };
    }
    return { user_id: u.user_id, username: u.username, password: "", created_at: u.created_at };
  }

  if (action === "register") {
    const name = String(p.username || "").trim();
    if (name.length < 3) return { error: "Username must be at least 3 characters." };
    if (String(p.password || "").length < 6) return { error: "Password must be at least 6 characters." };

    const existing = await db.prepare("SELECT user_id FROM Users WHERE username = ?").bind(name.toLowerCase()).all();
    if (existing.results.length > 0) return { error: "That username is already taken." };

    const nu = {
      user_id: "u_" + Date.now().toString(36),
      username: name,
      password: String(p.password),
      created_at: today_(),
    };

    await db
      .prepare("INSERT INTO Users (user_id, username, password, created_at) VALUES (?, ?, ?, ?)")
      .bind(nu.user_id, nu.username, nu.password, nu.created_at)
      .run();

    await db
      .prepare("INSERT INTO NotificationSettings (user_id, reminders_enabled, reminder_frequency, reminder_start, reminder_end) VALUES (?, 0, 2, '09:00', '22:00')")
      .bind(nu.user_id)
      .run();

    return { user_id: nu.user_id, username: nu.username, password: "", created_at: nu.created_at };
  }

  if (action === "listUsers") {
    const users = await db.prepare("SELECT user_id, username FROM Users WHERE user_id != ?").bind(p.userId).all();
    return users.results;
  }

  /* ---------- challenges ---------- */

  if (action === "challenges") {
    const today = today_();
    const challenges = await db.prepare("SELECT * FROM Challenges").all();
    const members = await db.prepare("SELECT * FROM Members").all();

    const out = [];
    for (const c of challenges.results) {
      const ch = coerceChallenge_(c);
      if (ch.hidden && ch.owner_id !== p.userId) continue;

      const mine = members.results.find((m) => m.challenge_id === ch.challenge_id && m.user_id === p.userId) || null;
      const participants = members.results.filter((m) => m.challenge_id === ch.challenge_id).length;

      out.push({
        challenge: ch,
        member: mine
          ? {
              challenge_id: mine.challenge_id,
              user_id: mine.user_id,
              role: String(mine.role || "member"),
              anonymous: bool_(mine.anonymous),
              joined_at: String(mine.joined_at || ""),
            }
          : null,
        participants,
        state: ch.end_date < today ? "ended" : mine ? "joined" : "discover",
      });
    }
    return out;
  }

  if (action === "enroll") {
    const ch = await db.prepare("SELECT * FROM Challenges WHERE challenge_id = ?").bind(p.challengeId).first();
    if (!ch) return { error: "Challenge not found" };

    if (bool_(ch.hidden) && ch.owner_id !== p.userId) {
      const inv = await db
        .prepare("SELECT * FROM Invites WHERE challenge_id = ? AND to_id = ? AND status = 'accepted'")
        .bind(p.challengeId, p.userId)
        .all();
      if (inv.results.length === 0) {
        return { error: "This challenge is hidden — you need an invite from the owner." };
      }
    }

    const existing = await db
      .prepare("SELECT * FROM Members WHERE challenge_id = ? AND user_id = ?")
      .bind(p.challengeId, p.userId)
      .all();
    if (existing.results.length > 0) return { error: "Already enrolled." };

    await db
      .prepare("INSERT INTO Members (challenge_id, user_id, role, anonymous, joined_at) VALUES (?, ?, 'member', ?, ?)")
      .bind(p.challengeId, p.userId, !!p.anonymous ? 1 : 0, today_())
      .run();

    return { ok: true };
  }

  if (action === "createChallenge") {
    const cid = "c_" + Date.now().toString(36);
    const ch = {
      challenge_id: cid,
      name: String(p.name || "").trim(),
      icon: String(p.icon || "book"),
      description: String(p.description || "").trim(),
      rules: Array.isArray(p.rules) ? p.rules.join("\n") : String(p.rules || ""),
      owner_id: p.userId,
      start_date: String(p.start_date),
      end_date: String(p.end_date),
      deadline: String(p.deadline || "23:00"),
      penalty_points: p.penalty_points != null ? Number(p.penalty_points) : 1,
      main_vacation_day: p.main_vacation_day != null ? Number(p.main_vacation_day) : 5,
      optional_vacations_per_week: p.optional_vacations_per_week != null ? Number(p.optional_vacations_per_week) : 1,
      created_at: today_(),
      hidden: !!p.hidden ? 1 : 0,
    };

    await db
      .prepare(
        "INSERT INTO Challenges (challenge_id, name, icon, description, rules, owner_id, start_date, end_date, deadline, penalty_points, main_vacation_day, optional_vacations_per_week, created_at, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        ch.challenge_id,
        ch.name,
        ch.icon,
        ch.description,
        ch.rules,
        ch.owner_id,
        ch.start_date,
        ch.end_date,
        ch.deadline,
        ch.penalty_points,
        ch.main_vacation_day,
        ch.optional_vacations_per_week,
        ch.created_at,
        ch.hidden
      )
      .run();

    await db
      .prepare("INSERT INTO Members (challenge_id, user_id, role, anonymous, joined_at) VALUES (?, ?, 'owner', 0, ?)")
      .bind(cid, p.userId, today_())
      .run();

    return coerceChallenge_(ch);
  }

  /* ---------- daily task ---------- */

  if (action === "completeTask") {
    const ch = await db.prepare("SELECT * FROM Challenges WHERE challenge_id = ?").bind(p.challengeId).first();
    if (!ch) return { error: "Challenge not found" };

    const today = today_();
    const taskId = p.challengeId + "__" + p.userId + "__" + today;
    const existing = await db
      .prepare("SELECT * FROM DailyTasks WHERE task_id = ? OR (challenge_id = ? AND user_id = ? AND date = ?)")
      .bind(taskId, p.challengeId, p.userId, today)
      .all();

    if (existing.results.length > 0 && String(existing.results[0].status) === "DONE") {
      return { error: "Today's task is already done." };
    }

    await db
      .prepare("INSERT INTO DailyTasks (task_id, challenge_id, user_id, date, status, completed_at) VALUES (?, ?, ?, ?, 'DONE', ?)")
      .bind(taskId, p.challengeId, p.userId, today, new Date().toISOString())
      .run();

    if (p.duration != null || (p.summary && String(p.summary).trim())) {
      await db
        .prepare("INSERT INTO Completions (task_id, duration, summary) VALUES (?, ?, ?)")
        .bind(taskId, p.duration != null ? Number(p.duration) : null, p.summary ? String(p.summary).trim() : null)
        .run();
    }

    const newAchievements = await evaluateAchievements_(db, p.userId);
    return { newAchievements };
  }

  if (action === "vacation") {
    const ch = await db.prepare("SELECT * FROM Challenges WHERE challenge_id = ?").bind(p.challengeId).first();
    if (!ch) return { error: "Challenge not found" };

    const today = today_();
    if (weekday_(today) === Number(ch.main_vacation_day)) {
      return { error: "Today is already the main vacation day." };
    }

    const left = await optLeft_(db, ch, p.userId);
    if (left <= 0) return { error: "No optional vacations left this week." };

    const taskId = p.challengeId + "__" + p.userId + "__" + today;
    await db
      .prepare("INSERT INTO DailyTasks (task_id, challenge_id, user_id, date, status, completed_at) VALUES (?, ?, ?, ?, 'VACATION', NULL)")
      .bind(taskId, p.challengeId, p.userId, today)
      .run();

    await db
      .prepare("INSERT INTO Vacations (vacation_id, challenge_id, user_id, date, type) VALUES (?, ?, ?, ?, 'optional')")
      .bind("v_" + p.userId + "_" + today + "_" + Date.now().toString(36), p.challengeId, p.userId, today)
      .run();

    return { optLeft: left - 1 };
  }

  /* ---------- home ---------- */

  if (action === "home") {
    const today = today_();
    const users = await db.prepare("SELECT * FROM Users").all();
    const challenges = await db.prepare("SELECT * FROM Challenges").all();
    const members = await db.prepare("SELECT * FROM Members WHERE user_id = ?").bind(p.userId).all();
    const tasks = await db.prepare("SELECT * FROM DailyTasks WHERE user_id = ?").bind(p.userId).all();
    const completions = await db
      .prepare("SELECT * FROM Completions WHERE task_id IN (SELECT task_id FROM DailyTasks WHERE user_id = ?)")
      .bind(p.userId)
      .all();
    const vacations = await db.prepare("SELECT * FROM Vacations WHERE user_id = ?").bind(p.userId).all();
    const penalties = await db.prepare("SELECT * FROM Penalties WHERE user_id = ?").bind(p.userId).all();
    const announcements = await db
      .prepare(
        "SELECT * FROM Announcements WHERE created_at >= ? AND challenge_id IN (SELECT challenge_id FROM Members WHERE user_id = ?) AND (to_id = 'all' OR to_id = ?)"
      )
      .bind(addDays_(today, -14), p.userId, p.userId)
      .all();
    const friendNotifications = await db.prepare("SELECT * FROM FriendNotifications WHERE user_id = ?").bind(p.userId).all();

    const chById = {};
    challenges.results.forEach((c) => {
      chById[c.challenge_id] = coerceChallenge_(c);
    });

    const out = [];
    let totalPen = 0;

    for (const m of members.results) {
      const ch = chById[m.challenge_id];
      if (!ch || ch.end_date < today) continue;

      const st = await computeStats_(db, ch, p.userId, m.joined_at);
      const byDate = {};
      tasks.results
        .filter((t) => t.challenge_id === ch.challenge_id)
        .forEach((t) => {
          byDate[t.date] = t;
        });

      const status = statusFor_(today, ch, byDate);
      let completion = null;
      const tToday = byDate[today];

      if (status === "DONE" && tToday) {
        const c = completions.results.find((x) => x.task_id === tToday.task_id);
        if (c) {
          completion = {
            task_id: c.task_id,
            duration: c.duration === null || c.duration === "" ? null : Number(c.duration),
            summary: c.summary === null || c.summary === "" ? null : String(c.summary),
          };
        }
      }

      totalPen += st.penalties;
      out.push({
        challenge: ch,
        anonymous: bool_(m.anonymous),
        status,
        streak: st.currentStreak,
        best: st.bestStreak,
        optLeft: await optLeft_(db, ch, p.userId),
        penalties: st.penalties,
        completion,
        deadlineOver: false,
      });
    }

    const order = { PENDING: 0, VACATION: 1, DONE: 2, MISSED: 3 };
    out.sort((a, b) => order[a.status] - order[b.status] || a.challenge.name.localeCompare(b.challenge.name));

    const annList = announcements.results
      .map((a) => ({
        announcement_id: a.announcement_id,
        challengeName: chById[a.challenge_id] ? chById[a.challenge_id].name : "",
        fromName: users.results.find((u) => u.user_id === a.from_id)?.username || "unknown",
        message: String(a.message || ""),
        createdAt: String(a.created_at || ""),
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 10);

    const friendsActivity = [];
    for (const m of members.results) {
      const ch = chById[m.challenge_id];
      if (!ch || ch.end_date < today) continue;

      const others = members.results.filter((x) => x.challenge_id === m.challenge_id && x.user_id !== p.userId && !bool_(x.anonymous));
      for (const o of others) {
        const pref = friendNotifications.results.find((f) => f.friend_id === o.user_id);
        if (!pref || !bool_(pref.enabled)) continue;

        const s = await computeStats_(db, ch, o.user_id, o.joined_at);
        friendsActivity.push({
          username: users.results.find((u) => u.user_id === o.user_id)?.username || "unknown",
          challengeName: ch.name,
          done: s.done,
          streak: s.currentStreak,
        });
      }
    }

    return {
      quote: { text: QUOTES[Math.floor(Math.random() * QUOTES.length)], author: "ChallengeMate" },
      tasks: out,
      totalPenalties: totalPen,
      announcements: annList,
      friendsActivity,
    };
  }

  /* ---------- detail / progress ---------- */

  if (action === "detail" || action === "progress") {
    const ch = await db.prepare("SELECT * FROM Challenges WHERE challenge_id = ?").bind(p.challengeId).first();
    if (!ch) return { error: "Challenge not found" };

    const today = today_();
    const users = await db.prepare("SELECT * FROM Users").all();
    const all = await db.prepare("SELECT * FROM Members WHERE challenge_id = ?").bind(p.challengeId).all();
    const visible = all.results.filter((m) => !bool_(m.anonymous));
    const mine = all.results.find((m) => m.user_id === p.userId) || null;

    const lb = [];
    for (const m of visible) {
      const s = await computeStats_(db, coerceChallenge_(ch), m.user_id, m.joined_at);
      lb.push({
        user_id: m.user_id,
        username: users.results.find((u) => u.user_id === m.user_id)?.username || "unknown",
        anonymous: false,
        streak: s.currentStreak,
        best: s.bestStreak,
        done: s.done,
        penalties: s.penalties,
        completionPct: s.completionPct,
        isYou: m.user_id === p.userId,
      });
    }

    if (action === "progress") {
      if (!mine) return { error: "Not a member." };
      lb.sort((a, b) => b.completionPct - a.completionPct);

      const tasks = await db
        .prepare("SELECT * FROM DailyTasks WHERE challenge_id = ? AND user_id = ?")
        .bind(p.challengeId, p.userId)
        .all();

      const byDate = {};
      tasks.results.forEach((t) => {
        byDate[t.date] = t;
      });

      let start = ch.start_date;
      if (mine.joined_at && mine.joined_at > start) start = mine.joined_at;
      const end = ch.end_date < today ? ch.end_date : today;
      const statuses = {};
      range_(start, end).forEach((k) => {
        statuses[k] = statusFor_(k, coerceChallenge_(ch), byDate);
      });

      return {
        challenge: coerceChallenge_(ch),
        stats: await computeStats_(db, coerceChallenge_(ch), p.userId, mine.joined_at),
        statuses,
        friends: lb,
      };
    }

    lb.sort((a, b) => b.streak - a.streak || b.best - a.best || b.done - a.done);

    const WEEKD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monday = addDays_(today, -((weekday_(today) + 6) % 7));
    const byD = {};

    if (mine) {
      const tasks = await db
        .prepare("SELECT * FROM DailyTasks WHERE challenge_id = ? AND user_id = ?")
        .bind(p.challengeId, p.userId)
        .all();
      tasks.results.forEach((t) => {
        byD[t.date] = t;
      });
    }

    const weekArr = range_(monday, addDays_(monday, 6)).map((k) => ({
      key: k,
      label: WEEKD[weekday_(k)],
      dayNum: Number(String(k).slice(8)),
      status: mine ? statusFor_(k, coerceChallenge_(ch), byD) : "PENDING",
      isToday: k === today,
      isMain: weekday_(k) === Number(ch.main_vacation_day),
    }));

    const penEvents = [];
    let balance = 0;

    if (mine) {
      const penRows = await db
        .prepare("SELECT * FROM Penalties WHERE challenge_id = ? AND user_id = ?")
        .bind(p.challengeId, p.userId)
        .all();

      let start = ch.start_date;
      if (mine.joined_at && mine.joined_at > start) start = mine.joined_at;
      const endP = ch.end_date < today ? ch.end_date : today;

      range_(start, endP).forEach((k) => {
        if (statusFor_(k, coerceChallenge_(ch), byD) === "MISSED") {
          const removed = penRows.results.some((r) => String(r.date) === k && Number(r.points) < 0);
          penEvents.push({ date: k, reason: "Missed task", points: Number(ch.penalty_points), removable: !removed });
        }
      });

      penRows.results
        .filter((r) => Number(r.points) < 0)
        .forEach((r) => {
          penEvents.push({
            date: String(r.date),
            reason: String(r.reason || "Penalty removed"),
            points: Number(r.points),
            removable: false,
          });
        });

      penEvents.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      balance = (await computeStats_(db, coerceChallenge_(ch), p.userId, mine.joined_at)).penalties;
    }

    const pendingInvites =
      !mine || String(mine.role) !== "owner"
        ? []
        : users.results
            .filter(
              (u) =>
                u.user_id !== p.userId &&
                !all.results.some((m) => m.user_id === u.user_id) &&
                !all.results.some(
                  (m) =>
                    m.challenge_id === p.challengeId &&
                    m.user_id === u.user_id
                )
            )
            .map((u) => ({ user_id: u.user_id, username: String(u.username) }));

    return {
      challenge: coerceChallenge_(ch),
      member: mine
        ? {
            challenge_id: mine.challenge_id,
            user_id: mine.user_id,
            role: String(mine.role || "member"),
            anonymous: bool_(mine.anonymous),
            joined_at: String(mine.joined_at || ""),
          }
        : null,
      participants: visible.map((m) => ({
        user_id: m.user_id,
        username: users.results.find((u) => u.user_id === m.user_id)?.username || "unknown",
        role: String(m.role || "member"),
        isYou: m.user_id === p.userId,
      })),
      hiddenCount: all.results.length - visible.length,
      owner: mine ? String(mine.role) === "owner" : false,
      pendingInvites,
      myStats: mine ? await computeStats_(db, coerceChallenge_(ch), p.userId, mine.joined_at) : null,
      week: weekArr,
      leaderboard: lb,
      iAmAnonymous: mine ? bool_(mine.anonymous) : false,
      penalties: { events: penEvents, balance },
      optLeft: mine ? await optLeft_(db, coerceChallenge_(ch), p.userId) : 0,
    };
  }

  /* ---------- profile ---------- */

  if (action === "profile") {
    const users = await db.prepare("SELECT * FROM Users").all();
    const me = users.results.find((u) => u.user_id === p.userId);
    if (!me) return { error: "User not found." };

    const challenges = await db.prepare("SELECT * FROM Challenges").all();
    const chById = {};
    challenges.results.forEach((c) => {
      chById[c.challenge_id] = coerceChallenge_(c);
    });

    const memberships = await db.prepare("SELECT * FROM Members WHERE user_id = ?").bind(p.userId).all();
    const g = {
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

    for (const m of memberships.results) {
      const ch = chById[m.challenge_id];
      if (!ch) continue;
      const s = await computeStats_(db, ch, p.userId, m.joined_at);
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

    g.completionPct = g.applicableDays ? Math.round((g.done / g.applicableDays) * 100) : 0;

    const earned = await db.prepare("SELECT * FROM UserAchievements WHERE user_id = ?").bind(p.userId).all();
    const earnedMap = {};
    earned.results.forEach((a) => {
      earnedMap[a.achievement_id] = String(a.earned_at || today_());
    });

    const achievements = ACH.map((def) => ({
      def: { id: def.id, name: def.name, description: def.description, requirement: def.requirement, icon: def.icon },
      earned_at: earnedMap[def.id] || null,
    })).sort((a, b) => Number(b.earned_at !== null) - Number(a.earned_at !== null));

    const settings = await db.prepare("SELECT * FROM NotificationSettings WHERE user_id = ?").bind(p.userId).first();
    const settingsObj = {
      user_id: p.userId,
      reminders_enabled: settings ? bool_(settings.reminders_enabled) : false,
      reminder_frequency: settings && settings.reminder_frequency !== "" ? Number(settings.reminder_frequency) : 2,
      reminder_start: settings && settings.reminder_start ? String(settings.reminder_start) : "09:00",
      reminder_end: settings && settings.reminder_end ? String(settings.reminder_end) : "22:00",
    };

    const myChallenges = memberships.results.map((m) => m.challenge_id);
    const allMembers = await db.prepare("SELECT * FROM Members").all();
    const friendIds = [];

    allMembers.results.forEach((m) => {
      if (myChallenges.includes(m.challenge_id) && m.user_id !== p.userId && !bool_(m.anonymous) && !friendIds.includes(m.user_id)) {
        friendIds.push(m.user_id);
      }
    });

    const friendRows = await db.prepare("SELECT * FROM FriendNotifications WHERE user_id = ?").bind(p.userId).all();
    const friendPrefs = [];

    for (const fid of friendIds) {
      const fu = users.results.find((u) => u.user_id === fid);
      if (!fu) continue;
      const pref = friendRows.results.find((f) => f.friend_id === fid);
      friendPrefs.push({
        user: { user_id: fu.user_id, username: fu.username, password: "", created_at: fu.created_at },
        enabled: pref ? bool_(pref.enabled) : false,
      });
    }

    friendPrefs.sort((a, b) => String(a.user.username).localeCompare(String(b.user.username)));

    return {
      user: { user_id: me.user_id, username: me.username, password: "", created_at: me.created_at },
      global: g,
      achievements,
      settings: settingsObj,
      friendPrefs,
      challengeCount: memberships.results.length,
    };
  }

  /* ---------- penalties ---------- */

  if (action === "removePenalty") {
    const ch = await db.prepare("SELECT * FROM Challenges WHERE challenge_id = ?").bind(p.challengeId).first();
    await db
      .prepare("INSERT INTO Penalties (penalty_id, challenge_id, user_id, date, points, reason, created_at) VALUES (?, ?, ?, ?, ?, 'Penalty removed', ?)")
      .bind("p_" + Date.now().toString(36), p.challengeId, p.userId, String(p.date), -Number(ch ? ch.penalty_points : 1), today_())
      .run();
    return { ok: true };
  }

  if (action === "decreasePenalty") {
    const ch = await db.prepare("SELECT * FROM Challenges WHERE challenge_id = ?").bind(p.challengeId).first();
    await db
      .prepare("INSERT INTO Penalties (penalty_id, challenge_id, user_id, date, points, reason, created_at) VALUES (?, ?, ?, ?, ?, 'Penalty decreased', ?)")
      .bind("p_" + Date.now().toString(36), p.challengeId, p.userId, today_(), -Number(ch ? ch.penalty_points : 1), today_())
      .run();
    return { ok: true };
  }

  /* ---------- owner tools ---------- */

  if (action === "endChallenge" || action === "deleteChallenge") {
    const ch = await db.prepare("SELECT * FROM Challenges WHERE challenge_id = ?").bind(p.challengeId).first();
    if (!ch) return { error: "Challenge not found" };

    const mine = await db
      .prepare("SELECT * FROM Members WHERE challenge_id = ? AND user_id = ?")
      .bind(p.challengeId, p.userId)
      .first();
    if (!mine || String(mine.role) !== "owner") return { error: "Only the owner can do that." };
    if (String(p.confirmName || "") !== ch.name) return { error: "Challenge name doesn't match — nothing was changed." };

    if (action === "endChallenge") {
      await db
        .prepare("UPDATE Challenges SET end_date = ? WHERE challenge_id = ?")
        .bind(addDays_(today_(), -1), p.challengeId)
        .run();
      return { ok: true };
    }

    await db.prepare("DELETE FROM Members WHERE challenge_id = ?").bind(p.challengeId).run();
    await db.prepare("DELETE FROM DailyTasks WHERE challenge_id = ?").bind(p.challengeId).run();
    await db.prepare("DELETE FROM Vacations WHERE challenge_id = ?").bind(p.challengeId).run();
    await db.prepare("DELETE FROM Penalties WHERE challenge_id = ?").bind(p.challengeId).run();
    await db.prepare("DELETE FROM Invites WHERE challenge_id = ?").bind(p.challengeId).run();
    await db.prepare("DELETE FROM Announcements WHERE challenge_id = ?").bind(p.challengeId).run();
    await db.prepare("DELETE FROM Completions WHERE task_id IN (SELECT task_id FROM DailyTasks WHERE challenge_id = ?)").bind(p.challengeId).run();
    await db.prepare("DELETE FROM Challenges WHERE challenge_id = ?").bind(p.challengeId).run();

    return { ok: true };
  }

  if (action === "leaveChallenge") {
    const mine = await db
      .prepare("SELECT * FROM Members WHERE challenge_id = ? AND user_id = ?")
      .bind(p.challengeId, p.userId)
      .first();
    if (!mine) return { error: "You are not a member." };
    if (String(mine.role) === "owner") return { error: "Owners can't leave — end or delete the challenge instead." };

    await db.prepare("DELETE FROM Members WHERE challenge_id = ? AND user_id = ?").bind(p.challengeId, p.userId).run();
    return { ok: true };
  }

  if (action === "removeParticipant") {
    const mine = await db
      .prepare("SELECT * FROM Members WHERE challenge_id = ? AND user_id = ?")
      .bind(p.challengeId, p.userId)
      .first();
    if (!mine || String(mine.role) !== "owner") return { error: "Only the owner can remove participants." };
    if (p.targetId === p.userId) return { error: "That's you — owners can't be removed." };

    await db.prepare("DELETE FROM Members WHERE challenge_id = ? AND user_id = ?").bind(p.challengeId, p.targetId).run();
    return { ok: true };
  }

  if (action === "sendInvite") {
    const mine = await db
      .prepare("SELECT * FROM Members WHERE challenge_id = ? AND user_id = ?")
      .bind(p.challengeId, p.userId)
      .first();
    if (!mine || String(mine.role) !== "owner") return { error: "Only the owner can invite people." };

    const members = await db.prepare("SELECT * FROM Members WHERE challenge_id = ?").bind(p.challengeId).all();
    const invites = await db.prepare("SELECT * FROM Invites WHERE challenge_id = ?").bind(p.challengeId).all();

    let sent = 0;
    for (const uid of p.targetIds || []) {
      if (uid === p.userId) continue;
      if (members.results.some((m) => m.user_id === uid)) continue;
      if (invites.results.some((i) => i.to_id === uid && String(i.status) === "pending")) continue;

      await db
        .prepare("INSERT INTO Invites (invite_id, challenge_id, from_id, to_id, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)")
        .bind("inv_" + Date.now().toString(36) + "_" + sent, p.challengeId, p.userId, uid, today_())
        .run();
      sent++;
    }

    return { ok: true, sent };
  }

  if (action === "notifyParticipants") {
    const ch = await db.prepare("SELECT * FROM Challenges WHERE challenge_id = ?").bind(p.challengeId).first();
    if (!ch) return { error: "Challenge not found" };

    const mine = await db
      .prepare("SELECT * FROM Members WHERE challenge_id = ? AND user_id = ?")
      .bind(p.challengeId, p.userId)
      .first();
    if (!mine || String(mine.role) !== "owner") return { error: "Only the owner can broadcast." };

    const msg = String(p.message || "").trim();
    if (!msg) return { error: "Write a message first." };

    const ann = await db
      .prepare("SELECT * FROM Announcements WHERE challenge_id = ? AND from_id = ?")
      .bind(p.challengeId, p.userId)
      .all();

    const cutoff = Date.now() - 12 * 3600 * 1000;
    const recent = ann.results
      .filter((a) => a.ts && new Date(a.ts).getTime() > cutoff)
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];

    if (recent) {
      const waitMin = Math.ceil((12 * 3600 * 1000 - (Date.now() - new Date(recent.ts).getTime())) / 60000);
      const h = Math.floor(waitMin / 60),
        m = waitMin % 60;
      return { error: "Slow mode — you can send the next message in " + (h ? h + "h " : "") + m + "m." };
    }

    const ts = new Date().toISOString();
    const targets = p.targetIds === "all" || !Array.isArray(p.targetIds) ? ["all"] : p.targetIds.filter((t) => t !== p.userId);

    if (!targets.length) return { error: "Pick at least one participant." };

    for (const t of targets) {
      await db
        .prepare(
          "INSERT INTO Announcements (announcement_id, challenge_id, from_id, to_id, message, created_at, ts) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind("an_" + Date.now().toString(36) + "_" + targets.indexOf(t), p.challengeId, p.userId, t, msg, today_(), ts)
        .run();
    }

    return { ok: true, sentTo: targets.length === 1 && targets[0] === "all" ? "everyone" : targets.length };
  }

  /* ---------- invites ---------- */

  if (action === "myInvites") {
    const users = await db.prepare("SELECT * FROM Users").all();
    const challenges = await db.prepare("SELECT * FROM Challenges").all();
    const inv = await db
      .prepare("SELECT * FROM Invites WHERE to_id = ? AND status = 'pending'")
      .bind(p.userId)
      .all();

    const out = [];
    for (const i of inv.results) {
      const ch = challenges.results.find((c) => c.challenge_id === i.challenge_id);
      if (!ch) continue;
      out.push({
        invite_id: i.invite_id,
        challenge_id: i.challenge_id,
        challenge_name: ch.name,
        from_name: users.results.find((u) => u.user_id === i.from_id)?.username || "unknown",
        created_at: String(i.created_at || ""),
      });
    }
    return out;
  }

  if (action === "respondInvite") {
    const inv = await db
      .prepare("SELECT * FROM Invites WHERE invite_id = ? AND to_id = ? AND status = 'pending'")
      .bind(p.inviteId, p.userId)
      .first();

    if (!inv) return { error: "Invite not found or already answered." };

    await db
      .prepare("UPDATE Invites SET status = ? WHERE invite_id = ?")
      .bind(p.accept ? "accepted" : "declined", p.inviteId)
      .run();

    if (p.accept) {
      const existing = await db
        .prepare("SELECT * FROM Members WHERE challenge_id = ? AND user_id = ?")
        .bind(inv.challenge_id, p.userId)
        .all();

      if (existing.results.length === 0) {
        await db
          .prepare("INSERT INTO Members (challenge_id, user_id, role, anonymous, joined_at) VALUES (?, ?, 'member', 0, ?)")
          .bind(inv.challenge_id, p.userId, today_())
          .run();
      }
    }

    return { ok: true };
  }

  /* ---------- settings ---------- */

  if (action === "saveSettings") {
    const existing = await db.prepare("SELECT * FROM NotificationSettings WHERE user_id = ?").bind(p.userId).first();

    if (existing) {
      await db
        .prepare(
          "UPDATE NotificationSettings SET reminders_enabled = ?, reminder_frequency = ?, reminder_start = ?, reminder_end = ? WHERE user_id = ?"
        )
        .bind(!!p.reminders_enabled ? 1 : 0, p.reminder_frequency || 2, p.reminder_start || "09:00", p.reminder_end || "22:00", p.userId)
        .run();
    } else {
      await db
        .prepare(
          "INSERT INTO NotificationSettings (user_id, reminders_enabled, reminder_frequency, reminder_start, reminder_end) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(p.userId, !!p.reminders_enabled ? 1 : 0, p.reminder_frequency || 2, p.reminder_start || "09:00", p.reminder_end || "22:00")
        .run();
    }

    return { ok: true };
  }

  if (action === "saveFriendPrefs") {
    await db.prepare("DELETE FROM FriendNotifications WHERE user_id = ?").bind(p.userId).run();

    if (Array.isArray(p.prefs)) {
      for (const f of p.prefs) {
        await db
          .prepare("INSERT INTO FriendNotifications (user_id, friend_id, enabled) VALUES (?, ?, ?)")
          .bind(p.userId, f.friend_id, !!f.enabled ? 1 : 0)
          .run();
      }
    }

    return { ok: true };
  }

  return { error: "Unknown action: " + action };
}
