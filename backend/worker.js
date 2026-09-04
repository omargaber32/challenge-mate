/**
 * ChallengeMate — Cloudflare Worker backend (Google Sheet = database).
 *
 * COMPLETE REPLACEMENT for Code.gs — every action the frontend sends is
 * implemented here. Pure Workers runtime: `fetch` + Web Crypto only.
 * NO npm packages, NO Node.js built-ins, NO `wrangler.toml` needed.
 *
 * Setup
 *  1. Paste your service-account key fields into SA below.
 *  2. Paste your spreadsheet id (from the Sheet URL) into SPREADSHEET_ID.
 *  3. Share the Sheet with SA.client_email as EDITOR.
 *  4. Deploy:  npx wrangler deploy worker.js --name challengemate --compatibility-date 2025-01-01
 *     (or paste into the Workers dashboard).
 *  5. Put the resulting https://…workers.dev URL into the frontend:
 *     src/services/googleSheets.ts → SHEETS_API_URL, then rebuild.
 *
 * On first request it creates the 11 tabs + headers (README §23 schema).
 */

/* ------------------------------------------------------------------ */
/* config                                                              */
/* ------------------------------------------------------------------ */

const SA = {
  client_email: "YOUR-SA@YOUR-PROJECT.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n",
  token_uri: "https://oauth2.googleapis.com/token", // keep as-is
};

const SCOPES = "https://www.googleapis.com/auth/spreadsheets"; // keep as-is
const SPREADSHEET_ID = "YOUR-SPREADSHEET-ID";
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets/" + SPREADSHEET_ID;

/* ------------------------------------------------------------------ */
/* OAuth (service account JWT via Web Crypto — no libraries)           */
/* ------------------------------------------------------------------ */

function b64urlBytes(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const b64urlStr = (str) => b64urlBytes(new TextEncoder().encode(str));
function pemToDer(pem) {
  const bin = atob(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

let tokenCache = { token: null, exp: 0 };
async function getAccessToken_() {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlStr(
    JSON.stringify({ iss: SA.client_email, scope: SCOPES, aud: SA.token_uri, iat: now, exp: now + 3600 }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(SA.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(header + "." + claims));
  const jwt = header + "." + claims + "." + b64urlBytes(new Uint8Array(sig));
  const res = await fetch(SA.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=" +
      encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") +
      "&assertion=" +
      encodeURIComponent(jwt),
  });
  const j = await res.json();
  if (j.error) throw new Error("OAuth failed: " + JSON.stringify(j));
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

/* ------------------------------------------------------------------ */
/* Sheets REST helpers                                                 */
/* ------------------------------------------------------------------ */

async function sheets_(path, opts) {
  const token = await getAccessToken_();
  const res = await fetch(SHEETS_BASE + path, Object.assign({ headers: { Authorization: "Bearer " + token } }, opts || {}));
  if (!res.ok) {
    let msg = "Sheets API " + res.status;
    try {
      const j = await res.json();
      if (j.error) msg += ": " + j.error.message;
    } catch (_) { /* keep default */ }
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const metaCache = { t: 0, data: null };
async function meta_() {
  if (metaCache.data && Date.now() - metaCache.t < 60000) return metaCache.data;
  metaCache.data = await sheets_("?fields=properties.title,sheets.properties.title,sheets.properties.sheetId");
  metaCache.t = Date.now();
  return metaCache.data;
}

const readCache = {};
function invalidate_() {
  for (const k of Object.keys(readCache)) delete readCache[k];
}
async function getValues_(range) {
  const j = await sheets_("/values/" + encodeURIComponent(range));
  return j.values || [];
}

/* ------------------------------------------------------------------ */
/* schema (README §23)                                                 */
/* ------------------------------------------------------------------ */

const HEADERS = {
  Users: ["user_id", "username", "password", "created_at"],
  // `hidden` was added later — ensureSchema_ appends missing columns to old sheets automatically
  Challenges: ["challenge_id", "name", "icon", "description", "rules", "owner_id", "start_date", "end_date",
    "deadline", "penalty_points", "main_vacation_day", "optional_vacations_per_week", "created_at", "hidden"],
  Members: ["challenge_id", "user_id", "role", "anonymous", "joined_at"],
  DailyTasks: ["task_id", "challenge_id", "user_id", "date", "status", "completed_at"],
  Completions: ["task_id", "duration", "summary"],
  Vacations: ["vacation_id", "challenge_id", "user_id", "date", "type"],
  Penalties: ["penalty_id", "challenge_id", "user_id", "date", "points", "reason", "created_at"],
  Achievements: ["achievement_id", "name", "description", "requirement"],
  UserAchievements: ["user_id", "achievement_id", "earned_at"],
  NotificationSettings: ["user_id", "reminders_enabled", "reminder_frequency", "reminder_start", "reminder_end"],
  FriendNotifications: ["user_id", "friend_id", "enabled"],
  Invites: ["invite_id", "challenge_id", "from_id", "to_id", "status", "created_at"],
  // owner broadcasts; `ts` keeps full ISO time for the 12h slow-mode check
  Announcements: ["announcement_id", "challenge_id", "from_id", "to_id", "message", "created_at", "ts"],
};
const SHEET_NAMES = Object.keys(HEADERS);
const DATE_COLS = /(^|_)(date|at)$/; // created_at, joined_at, start_date, date…

let schemaOk_ = false;
async function ensureSchema_() {
  if (schemaOk_) return;
  const meta = await meta_();
  const have = new Set(meta.sheets.map((s) => s.properties.title));
  const missing = SHEET_NAMES.filter((n) => !have.has(n));
  if (missing.length) {
    await sheets_(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: missing.map((n) => ({ addSheet: { properties: { title: n } } })) }),
    });
    metaCache.data = null;
  }
  for (const n of SHEET_NAMES) {
    const headRow = (await getValues_(n + "!1:1"))[0] || [];
    if (!headRow.length) {
      // brand-new tab → write the header row
      await sheets_("/values/" + encodeURIComponent(n + "!A1") + "?valueInputOption=RAW", {
        method: "PUT",
        body: JSON.stringify({ values: [HEADERS[n]] }),
      });
    } else {
      // existing tab → append any columns added in later versions (e.g. Challenges!hidden)
      const missingCols = HEADERS[n].filter((h) => !headRow.includes(h));
      if (missingCols.length) {
        const startCol = rowLetter_(headRow.length);
        const endCol = rowLetter_(headRow.length + missingCols.length - 1);
        await sheets_(
          "/values/" + encodeURIComponent(n + "!" + startCol + "1:" + endCol + "1") + "?valueInputOption=RAW",
          { method: "PUT", body: JSON.stringify({ values: [missingCols] }) },
        );
      }
    }
  }
  schemaOk_ = true;
}

/* ------------------------------------------------------------------ */
/* table read/write                                                    */
/* ------------------------------------------------------------------ */

function normCell_(col, v) {
  if (v === null || v === undefined) return "";
  if (DATE_COLS.test(col)) return dkey_(v);
  return v;
}

async function table_(name) {
  const hit = readCache[name];
  if (hit && Date.now() - hit.t < 8000) return hit.data;
  const vals = await getValues_(name);
  const head = HEADERS[name];
  const out = [];
  for (let i = 1; i < vals.length; i++) {
    const r = {};
    for (let j = 0; j < head.length; j++) r[head[j]] = normCell_(head[j], vals[i][j]);
    if (r[head[0]] !== "" && r[head[0]] != null) out.push(r);
  }
  readCache[name] = { t: Date.now(), data: out };
  return out;
}

async function append_(name, obj) {
  await ensureSchema_();
  const row = HEADERS[name].map((h) => (obj[h] === undefined || obj[h] === null ? "" : obj[h]));
  await sheets_(
    "/values/" + encodeURIComponent(name) + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
    { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values: [row] }) },
  );
  invalidate_();
}

async function putRow_(name, rowIndex1based, obj) {
  const row = HEADERS[name].map((h) => (obj[h] === undefined || obj[h] === null ? "" : obj[h]));
  await sheets_(
    "/values/" + encodeURIComponent(name + "!A" + rowIndex1based + ":" + rowLetter_(HEADERS[name].length - 1) + rowIndex1based) +
      "?valueInputOption=RAW",
    { method: "PUT", body: JSON.stringify({ values: [row] }) },
  );
  invalidate_();
}
function rowLetter_(idx) {
  let s = "";
  idx++;
  while (idx > 0) {
    const m = (idx - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

async function deleteRowsWhere_(name, colName, value) {
  return deleteRowMatch_(name, { [colName]: value });
}

/** delete every row whose columns ALL match the given key/value pairs */
async function deleteRowMatch_(name, match) {
  const meta = await meta_();
  let gid = null;
  meta.sheets.forEach((s) => { if (s.properties.title === name) gid = s.properties.sheetId; });
  const rows = await table_(name);
  const idxs = [];
  rows.forEach((r, i) => {
    const ok = Object.keys(match).every((k) => String(r[k]) === String(match[k]));
    if (ok) idxs.push(i + 1); // +1 header row
  });
  if (!idxs.length) return;
  idxs.sort((a, b) => b - a);
  await sheets_(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: idxs.map((i) => ({ deleteDimension: { range: { sheetId: gid, dimension: "ROWS", startIndex: i, endIndex: i + 1 } } })),
    }),
  });
  invalidate_();
}

/* ------------------------------------------------------------------ */
/* dates / domain helpers                                              */
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
  while (k <= b) { out.push(k); k = addDays_(k, 1); }
  return out;
}
function isoWeek_(k) {
  const d = parseKey_(k);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const w1 = Date.UTC(d.getUTCFullYear(), 0, 4);
  const w1day = (new Date(w1).getUTCDay() + 6) % 7;
  return d.getUTCFullYear() + "-W" + pad_(1 + Math.round(((d.getTime() - w1) / 864e5 - 3 + w1day) / 7));
}
function dkey_(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s)) return s; // already a key / ISO datetime
  const d = new Date(s);
  if (!isNaN(d.getTime())) return key_(d); // Sheets auto-converted to a date
  return s;
}
const bool_ = (v) => v === true || v === "true" || v === "TRUE" || v === "1" || v === 1;

function challenge_(id) {
  return table_("Challenges").then((cs) => {
    const c = cs.find((x) => x.challenge_id === id);
    return c ? coerceChallenge_(c) : null;
  });
}
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

const members_ = () => table_("Members");
const tasks_ = () => table_("DailyTasks");
const completions_ = () => table_("Completions");
const vacations_ = () => table_("Vacations");
const penalties_ = () => table_("Penalties");

async function usernameOf_(uid) {
  const u = await table_("Users");
  const f = u.find((x) => x.user_id === uid);
  return f ? String(f.username) : "unknown";
}

function statusFor_(date, ch, byDate) {
  if (byDate[date]) return String(byDate[date].status);
  const today = today_();
  // the main vacation day is ALWAYS a vacation — even today (README §9)
  if (weekday_(date) === Number(ch.main_vacation_day)) return "VACATION";
  if (date === today) return "PENDING";
  return date < today ? "MISSED" : "PENDING";
}

/** streaks / stats / penalty balance — same rules as the README */
async function computeStats_(ch, uid, from) {
  const allTasks = await tasks_();
  const byDate = {};
  allTasks.forEach((t) => { if (t.challenge_id === ch.challenge_id && t.user_id === uid) byDate[t.date] = t; });
  const compByTask = {};
  (await completions_()).forEach((c) => { compByTask[c.task_id] = c; });
  const penSum = (await penalties_())
    .filter((p) => p.challenge_id === ch.challenge_id && p.user_id === uid)
    .reduce((s, p) => s + Number(p.points || 0), 0);

  const today = today_();
  let start = ch.start_date;
  if (from && from > start) start = from;
  let end = ch.end_date < today ? ch.end_date : today;
  if (end < start) end = start;
  const keys = range_(start, end);

  let cur = 0, best = 0, done = 0, missed = 0, vac = 0, mins = 0;
  const doneDates = {}, missedDates = {}, minsByDay = {}, doneByWeek = {}, missedByWeek = {};

  keys.forEach((k) => {
    const s = statusFor_(k, ch, byDate);
    if (s === "DONE") {
      done++; cur++; if (cur > best) best = cur;
      doneDates[k] = 1;
      const w = isoWeek_(k); doneByWeek[w] = (doneByWeek[w] || 0) + 1;
      const t = byDate[k];
      const c = t && compByTask[t.task_id];
      if (c && c.duration !== "" && c.duration != null) {
        const dm = Number(c.duration);
        if (!isNaN(dm)) { mins += dm; minsByDay[k] = (minsByDay[k] || 0) + dm; }
      }
    } else if (s === "MISSED") {
      missed++; cur = 0;
      missedDates[k] = 1;
      const w = isoWeek_(k); missedByWeek[w] = (missedByWeek[w] || 0) + 1;
    } else if (s === "VACATION") {
      vac++;
    }
  });

  let perfect = 0;
  Object.keys(doneByWeek).forEach((w) => { if (!missedByWeek[w] && doneByWeek[w] >= 4) perfect++; });
  let maxDay = 0;
  Object.keys(minsByDay).forEach((k) => { if (minsByDay[k] > maxDay) maxDay = minsByDay[k]; });
  let comeback = false;
  Object.keys(missedDates).forEach((m) => { if (doneDates[addDays_(m, 1)]) comeback = true; });
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

async function optLeft_(ch, uid) {
  if (Number(ch.optional_vacations_per_week) <= 0) return 0;
  const today = today_();
  const monday = addDays_(today, -((weekday_(today) + 6) % 7));
  const week = {};
  range_(monday, addDays_(monday, 6)).forEach((k) => { week[k] = 1; });
  const used = (await vacations_()).filter(
    (v) => v.challenge_id === ch.challenge_id && v.user_id === uid && v.type === "optional" && week[v.date],
  ).length;
  return Math.max(0, Number(ch.optional_vacations_per_week) - used);
}

/* ------------------------------------------------------------------ */
/* achievements (mirror of src/data/achievements.ts)                   */
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

async function evaluateAchievements_(uid) {
  const memberships = (await members_()).filter((m) => m.user_id === uid);
  const g = { currentStreak: 0, bestStreak: 0, done: 0, missed: 0, vacations: 0, totalMinutes: 0,
    completionPct: 0, applicableDays: 0, perfectWeeks: 0, maxDayMinutes: 0, comeback: false, penalties: 0 };
  for (const m of memberships) {
    const ch = await challenge_(m.challenge_id);
    if (!ch) continue;
    const s = await computeStats_(ch, uid, m.joined_at);
    g.done += s.done; g.missed += s.missed; g.vacations += s.vacations;
    g.totalMinutes += s.totalMinutes; g.applicableDays += s.applicableDays;
    g.penalties += s.penalties; g.perfectWeeks += s.perfectWeeks;
    g.bestStreak = Math.max(g.bestStreak, s.bestStreak);
    g.currentStreak = Math.max(g.currentStreak, s.currentStreak);
    g.maxDayMinutes = Math.max(g.maxDayMinutes, s.maxDayMinutes);
    g.comeback = g.comeback || s.comeback;
  }
  const earned = await table_("UserAchievements");
  const fresh = [];
  for (const def of ACH) {
    const has = earned.some((a) => a.user_id === uid && a.achievement_id === def.id);
    if (!has && def.check(g)) {
      await append_("UserAchievements", { user_id: uid, achievement_id: def.id, earned_at: today_() });
      fresh.push(def.name);
    }
  }
  return fresh;
}

/* ------------------------------------------------------------------ */
/* actions                                                             */
/* ------------------------------------------------------------------ */

const QUOTES = [
  "Small progress is still progress.",
  "You don’t need motivation. You need consistency.",
  "One more day. Keep the streak alive! 🔥",
  "Discipline is choosing what you want most over what you want now.",
  "A river cuts through rock not because of its power, but its persistence.",
  "Miss once, never twice.",
  "Future you is watching. Make them proud.",
  "Thirty minutes today beats ten hours someday.",
];

async function handle_(action, p) {
  await ensureSchema_();

  if (action === "ping") {
    const meta = await meta_();
    return { pong: true, title: meta.properties ? meta.properties.title : "ChallengeMate" };
  }

  if (action === "quote") {
    return { text: QUOTES[Math.floor(Math.random() * QUOTES.length)], author: "ChallengeMate" };
  }

  /* ---------- auth ---------- */

  if (action === "login") {
    const users = await table_("Users");
    for (const u of users) {
      if (String(u.username).toLowerCase() === String(p.username).trim().toLowerCase()) {
        if (String(u.password) !== String(p.password)) return { error: "Incorrect password." };
        return { user_id: u.user_id, username: u.username, password: "", created_at: u.created_at };
      }
    }
    return { error: "Unknown username. Try one of the accounts in the Users tab, or create one." };
  }

  if (action === "register") {
    const name = String(p.username || "").trim();
    if (name.length < 3) return { error: "Username must be at least 3 characters." };
    if (String(p.password || "").length < 6) return { error: "Password must be at least 6 characters." };
    const users = await table_("Users");
    if (users.some((u) => String(u.username).toLowerCase() === name.toLowerCase()))
      return { error: "That username is already taken." };
    const nu = { user_id: "u_" + Date.now().toString(36), username: name, password: String(p.password), created_at: today_() };
    await append_("Users", nu);
    await append_("NotificationSettings", { user_id: nu.user_id, reminders_enabled: false,
      reminder_frequency: 2, reminder_start: "09:00", reminder_end: "22:00" });
    return { user_id: nu.user_id, username: nu.username, password: "", created_at: nu.created_at };
  }

  if (action === "listUsers") {
    const users = await table_("Users");
    return users.filter((u) => u.user_id !== p.userId).map((u) => ({ user_id: u.user_id, username: u.username }));
  }

  /* ---------- challenges ---------- */

  if (action === "challenges") {
    const today = today_();
    const chs = await table_("Challenges");
    const mem = await members_();
    const out = [];
    for (const c of chs) {
      const ch = coerceChallenge_(c);
      // hidden challenges are only ever visible to their owner (README: invite-only)
      if (ch.hidden && ch.owner_id !== p.userId) continue;
      const mine = mem.find((m) => m.challenge_id === ch.challenge_id && m.user_id === p.userId) || null;
      out.push({
        challenge: ch,
        member: mine ? { challenge_id: mine.challenge_id, user_id: mine.user_id, role: String(mine.role || "member"),
          anonymous: bool_(mine.anonymous), joined_at: String(mine.joined_at || "") } : null,
        participants: mem.filter((m) => m.challenge_id === ch.challenge_id).length,
        state: ch.end_date < today ? "ended" : mine ? "joined" : "discover",
      });
    }
    return out;
  }

  if (action === "myInvites") {
    const inv = (await table_("Invites")).filter((i) => i.to_id === p.userId && String(i.status) === "pending");
    const out = [];
    for (const i of inv) {
      const ch = await challenge_(i.challenge_id);
      if (!ch) continue;
      out.push({ invite_id: i.invite_id, challenge_id: i.challenge_id, challenge_name: ch.name,
        from_name: await usernameOf_(i.from_id), created_at: String(i.created_at || "") });
    }
    return out;
  }

  if (action === "respondInvite") {
    const rows = await table_("Invites");
    const idx = rows.findIndex((i) => i.invite_id === p.inviteId && i.to_id === p.userId && String(i.status) === "pending");
    if (idx < 0) return { error: "Invite not found or already answered." };
    const row = Object.assign({}, rows[idx], { status: p.accept ? "accepted" : "declined" });
    await putRow_("Invites", idx + 2, row);
    if (p.accept) {
      const mem = await members_();
      const ch = rows[idx].challenge_id;
      if (!mem.some((m) => m.challenge_id === ch && m.user_id === p.userId)) {
        await append_("Members", { challenge_id: ch, user_id: p.userId, role: "member", anonymous: false, joined_at: today_() });
      }
    }
    return { ok: true };
  }

  if (action === "enroll") {
    const chE = await challenge_(p.challengeId);
    if (!chE) return { error: "Challenge not found" };
    // hidden challenges are invite-only: joining is only possible through an accepted invite
    if (chE.hidden && chE.owner_id !== p.userId) {
      const inv = await table_("Invites");
      const ok = inv.some((i) => i.challenge_id === p.challengeId && i.to_id === p.userId && String(i.status) === "accepted");
      if (!ok) return { error: "This challenge is hidden — you need an invite from the owner." };
    }
    const mem = await members_();
    if (mem.some((m) => m.challenge_id === p.challengeId && m.user_id === p.userId))
      return { error: "Already enrolled." };
    await append_("Members", { challenge_id: p.challengeId, user_id: p.userId, role: "member",
      anonymous: !!p.anonymous, joined_at: today_() });
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
      hidden: !!p.hidden,
    };
    // no participants are added at creation — people discover the challenge
    // or (for hidden ones) receive an invite from the owner
    await append_("Challenges", ch);
    await append_("Members", { challenge_id: cid, user_id: p.userId, role: "owner", anonymous: false, joined_at: today_() });
    return coerceChallenge_(ch);
  }

  /* ---------- daily task ---------- */

  if (action === "completeTask") {
    const ch = await challenge_(p.challengeId);
    if (!ch) return { error: "Challenge not found" };
    const today = today_();
    const taskId = p.challengeId + "__" + p.userId + "__" + today;
    const existing = (await tasks_()).find((t) => t.task_id === taskId || (t.challenge_id === p.challengeId && t.user_id === p.userId && t.date === today));
    if (existing && String(existing.status) === "DONE") return { error: "Today's task is already done." };
    await append_("DailyTasks", { task_id: taskId, challenge_id: p.challengeId, user_id: p.userId,
      date: today, status: "DONE", completed_at: new Date().toISOString() });
    if (p.duration != null || (p.summary && String(p.summary).trim())) {
      await append_("Completions", { task_id: taskId,
        duration: p.duration != null ? Number(p.duration) : "",
        summary: p.summary ? String(p.summary).trim() : "" });
    }
    const newAchievements = await evaluateAchievements_(p.userId);
    return { newAchievements };
  }

  if (action === "vacation") {
    const ch = await challenge_(p.challengeId);
    if (!ch) return { error: "Challenge not found" };
    const today = today_();
    if (weekday_(today) === Number(ch.main_vacation_day)) return { error: "Today is already the main vacation day." };
    const left = await optLeft_(ch, p.userId);
    if (left <= 0) return { error: "No optional vacations left this week." };
    await append_("DailyTasks", { task_id: p.challengeId + "__" + p.userId + "__" + today,
      challenge_id: p.challengeId, user_id: p.userId, date: today, status: "VACATION", completed_at: "" });
    await append_("Vacations", { vacation_id: "v_" + p.userId + "_" + today + "_" + Date.now().toString(36),
      challenge_id: p.challengeId, user_id: p.userId, date: today, type: "optional" });
    return { optLeft: left - 1 };
  }

  /* ---------- home ---------- */

  if (action === "home") {
    const today = today_();
    const out = [];
    let totalPen = 0;
    const memberships = (await members_()).filter((m) => m.user_id === p.userId);
    for (const m of memberships) {
      const ch = await challenge_(m.challenge_id);
      if (!ch || ch.end_date < today) continue;
      const st = await computeStats_(ch, p.userId, m.joined_at);
      const byDate = {};
      const myTasks = (await tasks_()).filter((t) => t.challenge_id === ch.challenge_id && t.user_id === p.userId);
      myTasks.forEach((t) => { byDate[t.date] = t; });
      const status = statusFor_(today, ch, byDate);
      let completion = null;
      const tToday = byDate[today];
      if (status === "DONE" && tToday) {
        const c = (await completions_()).find((x) => x.task_id === tToday.task_id);
        if (c) completion = { task_id: c.task_id,
          duration: c.duration === "" || c.duration == null ? null : Number(c.duration),
          summary: c.summary === "" || c.summary == null ? null : String(c.summary) };
      }
      totalPen += st.penalties;
      out.push({ challenge: ch, anonymous: bool_(m.anonymous), status, streak: st.currentStreak,
        best: st.bestStreak, optLeft: await optLeft_(ch, p.userId), penalties: st.penalties,
        completion, deadlineOver: false });
    }
    const order = { PENDING: 0, VACATION: 1, DONE: 2, MISSED: 3 };
    out.sort((a, b) => order[a.status] - order[b.status] || a.challenge.name.localeCompare(b.challenge.name));

    // owner broadcasts addressed to me (last 14 days) — powers the Home feed + OS push
    const cutoff = addDays_(today, -14);
    const annRows = (await table_("Announcements")).filter(
      (a) => String(a.created_at || "") >= cutoff &&
        memberships.some((m) => m.challenge_id === a.challenge_id) &&
        (String(a.to_id) === "all" || String(a.to_id) === p.userId),
    );
    const announcements = [];
    for (const a of annRows) {
      const ch = await challenge_(a.challenge_id);
      announcements.push({ announcement_id: a.announcement_id, challengeName: ch ? ch.name : "",
        fromName: await usernameOf_(a.from_id), message: String(a.message || ""), createdAt: String(a.created_at || "") });
    }
    announcements.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    // friend activity for enabled friend-prefs — powers "friend completed" OS push
    const friendRows = await table_("FriendNotifications");
    const allMem = await members_();
    const friendsActivity = [];
    for (const m of memberships) {
      const ch = await challenge_(m.challenge_id);
      if (!ch || ch.end_date < today) continue;
      const others = allMem.filter((x) => x.challenge_id === m.challenge_id && x.user_id !== p.userId && !bool_(x.anonymous));
      for (const o of others) {
        const pref = friendRows.find((f) => f.user_id === p.userId && f.friend_id === o.user_id);
        if (!pref || !bool_(pref.enabled)) continue;
        const s = await computeStats_(ch, o.user_id, o.joined_at);
        friendsActivity.push({ username: await usernameOf_(o.user_id), challengeName: ch.name,
          done: s.done, streak: s.currentStreak });
      }
    }

    return { quote: { text: QUOTES[Math.floor(Math.random() * QUOTES.length)], author: "ChallengeMate" },
      tasks: out, totalPenalties: totalPen, announcements: announcements.slice(0, 10), friendsActivity };
  }

  /* ---------- detail / progress ---------- */

  if (action === "detail" || action === "progress") {
    const ch = await challenge_(p.challengeId);
    if (!ch) return { error: "Challenge not found" };
    const today = today_();
    const all = (await members_()).filter((m) => m.challenge_id === p.challengeId);
    const visible = all.filter((m) => !bool_(m.anonymous));
    const mine = all.find((m) => m.user_id === p.userId) || null;

    const lb = [];
    for (const m of visible) {
      const s = await computeStats_(ch, m.user_id, m.joined_at);
      lb.push({ user_id: m.user_id, username: await usernameOf_(m.user_id), anonymous: false,
        streak: s.currentStreak, best: s.bestStreak, done: s.done, penalties: s.penalties,
        completionPct: s.completionPct, isYou: m.user_id === p.userId });
    }

    if (action === "progress") {
      if (!mine) return { error: "Not a member." };
      lb.sort((a, b) => b.completionPct - a.completionPct);
      const byDate = {};
      (await tasks_()).filter((t) => t.challenge_id === p.challengeId && t.user_id === p.userId)
        .forEach((t) => { byDate[t.date] = t; });
      let start = ch.start_date;
      if (mine.joined_at && mine.joined_at > start) start = mine.joined_at;
      const end = ch.end_date < today ? ch.end_date : today;
      const statuses = {};
      range_(start, end).forEach((k) => { statuses[k] = statusFor_(k, ch, byDate); });
      return { challenge: ch, stats: await computeStats_(ch, p.userId, mine.joined_at), statuses, friends: lb };
    }

    lb.sort((a, b) => b.streak - a.streak || b.best - a.best || b.done - a.done);

    const WEEKD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monday = addDays_(today, -((weekday_(today) + 6) % 7));
    const byD = {};
    if (mine) {
      (await tasks_()).filter((t) => t.challenge_id === p.challengeId && t.user_id === p.userId)
        .forEach((t) => { byD[t.date] = t; });
    }
    const weekArr = range_(monday, addDays_(monday, 6)).map((k) => ({
      key: k, label: WEEKD[weekday_(k)], dayNum: Number(String(k).slice(8)),
      status: mine ? statusFor_(k, ch, byD) : "PENDING",
      isToday: k === today, isMain: weekday_(k) === Number(ch.main_vacation_day),
    }));

    const penEvents = [];
    let balance = 0;
    if (mine) {
      const penRows = (await penalties_()).filter((x) => x.challenge_id === p.challengeId && x.user_id === p.userId);
      let start = ch.start_date;
      if (mine.joined_at && mine.joined_at > start) start = mine.joined_at;
      const endP = ch.end_date < today ? ch.end_date : today;
      range_(start, endP).forEach((k) => {
        if (statusFor_(k, ch, byD) === "MISSED") {
          const removed = penRows.some((r) => String(r.date) === k && Number(r.points) < 0);
          penEvents.push({ date: k, reason: "Missed task", points: Number(ch.penalty_points), removable: !removed });
        }
      });
      penRows.filter((r) => Number(r.points) < 0).forEach((r) => {
        penEvents.push({ date: String(r.date), reason: String(r.reason || "Penalty removed"),
          points: Number(r.points), removable: false });
      });
      penEvents.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      balance = (await computeStats_(ch, p.userId, mine.joined_at)).penalties;
    }

    return {
      challenge: ch,
      member: mine ? { challenge_id: mine.challenge_id, user_id: mine.user_id, role: String(mine.role || "member"),
        anonymous: bool_(mine.anonymous), joined_at: String(mine.joined_at || "") } : null,
      participants: await Promise.all(visible.map(async (m) => ({ user_id: m.user_id,
        username: await usernameOf_(m.user_id), role: String(m.role || "member"), isYou: m.user_id === p.userId }))),
      hiddenCount: all.length - visible.length,
      owner: mine ? String(mine.role) === "owner" : false,
      pendingInvites: !mine || String(mine.role) !== "owner" ? [] : await (async () => {
        const users = await table_("Users");
        const inv = await table_("Invites");
        return users
          .filter((u) => u.user_id !== p.userId &&
            !all.some((m) => m.user_id === u.user_id) &&
            !inv.some((i) => i.challenge_id === p.challengeId && i.to_id === u.user_id && String(i.status) === "pending"))
          .map((u) => ({ user_id: u.user_id, username: String(u.username) }));
      })(),
      myStats: mine ? await computeStats_(ch, p.userId, mine.joined_at) : null,
      week: weekArr,
      leaderboard: lb,
      iAmAnonymous: mine ? bool_(mine.anonymous) : false,
      penalties: { events: penEvents, balance },
      optLeft: mine ? await optLeft_(ch, p.userId) : 0,
    };
  }

  /* ---------- profile ---------- */

  if (action === "profile") {
    const users = await table_("Users");
    const me = users.find((u) => u.user_id === p.userId);
    if (!me) return { error: "User not found." };
    const memberships = (await members_()).filter((m) => m.user_id === p.userId);
    const g = { currentStreak: 0, bestStreak: 0, done: 0, missed: 0, vacations: 0, totalMinutes: 0,
      completionPct: 0, applicableDays: 0, perfectWeeks: 0, maxDayMinutes: 0, comeback: false, penalties: 0 };
    for (const m of memberships) {
      const ch = await challenge_(m.challenge_id);
      if (!ch) continue;
      const s = await computeStats_(ch, p.userId, m.joined_at);
      g.done += s.done; g.missed += s.missed; g.vacations += s.vacations;
      g.totalMinutes += s.totalMinutes; g.applicableDays += s.applicableDays;
      g.penalties += s.penalties; g.perfectWeeks += s.perfectWeeks;
      g.bestStreak = Math.max(g.bestStreak, s.bestStreak);
      g.currentStreak = Math.max(g.currentStreak, s.currentStreak);
      g.maxDayMinutes = Math.max(g.maxDayMinutes, s.maxDayMinutes);
      g.comeback = g.comeback || s.comeback;
    }
    g.completionPct = g.applicableDays ? Math.round((g.done / g.applicableDays) * 100) : 0;

    const earnedMap = {};
    (await table_("UserAchievements")).filter((a) => a.user_id === p.userId)
      .forEach((a) => { earnedMap[a.achievement_id] = String(a.earned_at || today_()); });
    const achievements = ACH.map((def) => ({
      def: { id: def.id, name: def.name, description: def.description, requirement: def.requirement, icon: def.icon },
      earned_at: earnedMap[def.id] || null,
    })).sort((a, b) => Number(b.earned_at !== null) - Number(a.earned_at !== null));

    const settingsRows = await table_("NotificationSettings");
    const sRow = settingsRows.find((s) => s.user_id === p.userId);
    const settings = { user_id: p.userId,
      reminders_enabled: sRow ? bool_(sRow.reminders_enabled) : false,
      reminder_frequency: sRow && sRow.reminder_frequency !== "" ? Number(sRow.reminder_frequency) : 2,
      reminder_start: sRow && sRow.reminder_start ? String(sRow.reminder_start) : "09:00",
      reminder_end: sRow && sRow.reminder_end ? String(sRow.reminder_end) : "22:00" };

    const myChallenges = memberships.map((m) => m.challenge_id);
    const allMembers = await members_();
    const friendIds = [];
    allMembers.forEach((m) => {
      if (myChallenges.includes(m.challenge_id) && m.user_id !== p.userId && !bool_(m.anonymous) && !friendIds.includes(m.user_id)) {
        friendIds.push(m.user_id);
      }
    });
    const friendRows = await table_("FriendNotifications");
    const friendPrefs = [];
    for (const fid of friendIds) {
      const fu = users.find((u) => u.user_id === fid);
      if (!fu) continue;
      const pref = friendRows.find((f) => f.user_id === p.userId && f.friend_id === fid);
      friendPrefs.push({ user: { user_id: fu.user_id, username: fu.username, password: "", created_at: fu.created_at },
        enabled: pref ? bool_(pref.enabled) : false });
    }
    friendPrefs.sort((a, b) => String(a.user.username).localeCompare(String(b.user.username)));

    return { user: { user_id: me.user_id, username: me.username, password: "", created_at: me.created_at },
      global: g, achievements, settings, friendPrefs, challengeCount: memberships.length };
  }

  /* ---------- penalties ---------- */

  if (action === "removePenalty") {
    const ch = await challenge_(p.challengeId);
    await append_("Penalties", { penalty_id: "p_" + Date.now().toString(36), challenge_id: p.challengeId,
      user_id: p.userId, date: String(p.date), points: -Number(ch ? ch.penalty_points : 1),
      reason: "Penalty removed", created_at: today_() });
    return { ok: true };
  }

  if (action === "decreasePenalty") {
    const ch = await challenge_(p.challengeId);
    await append_("Penalties", { penalty_id: "p_" + Date.now().toString(36), challenge_id: p.challengeId,
      user_id: p.userId, date: today_(), points: -Number(ch ? ch.penalty_points : 1),
      reason: "Penalty decreased", created_at: today_() });
    return { ok: true };
  }

  /* ---------- owner tools ---------- */

  if (action === "endChallenge" || action === "deleteChallenge") {
    const ch = await challenge_(p.challengeId);
    if (!ch) return { error: "Challenge not found" };
    const mine = (await members_()).find((m) => m.challenge_id === p.challengeId && m.user_id === p.userId);
    if (!mine || String(mine.role) !== "owner") return { error: "Only the owner can do that." };
    if (String(p.confirmName || "") !== ch.name) return { error: "Challenge name doesn't match — nothing was changed." };

    if (action === "endChallenge") {
      const rows = await table_("Challenges");
      const idx = rows.findIndex((r) => r.challenge_id === p.challengeId);
      if (idx >= 0) {
        const row = Object.assign({}, rows[idx], { end_date: addDays_(today_(), -1) });
        await putRow_("Challenges", idx + 2, row);
      }
      return { ok: true };
    }

    // delete: wipe every row that belongs to this challenge
    await deleteRowsWhere_("Members", "challenge_id", p.challengeId);
    await deleteRowsWhere_("DailyTasks", "challenge_id", p.challengeId);
    await deleteRowsWhere_("Vacations", "challenge_id", p.challengeId);
    await deleteRowsWhere_("Penalties", "challenge_id", p.challengeId);
    await deleteRowsWhere_("Invites", "challenge_id", p.challengeId);
    await deleteRowsWhere_("Announcements", "challenge_id", p.challengeId);
    const comps = (await completions_()).filter((c) => String(c.task_id).indexOf(p.challengeId + "__") === 0);
    for (const c of comps) await deleteRowsWhere_("Completions", "task_id", c.task_id);
    await deleteRowsWhere_("Challenges", "challenge_id", p.challengeId);
    return { ok: true };
  }

  if (action === "leaveChallenge") {
    const mine = (await members_()).find((m) => m.challenge_id === p.challengeId && m.user_id === p.userId);
    if (!mine) return { error: "You are not a member." };
    if (String(mine.role) === "owner") return { error: "Owners can't leave — end or delete the challenge instead." };
    await deleteRowMatch_("Members", { challenge_id: p.challengeId, user_id: p.userId });
    return { ok: true };
  }

  if (action === "removeParticipant") {
    const mine = (await members_()).find((m) => m.challenge_id === p.challengeId && m.user_id === p.userId);
    if (!mine || String(mine.role) !== "owner") return { error: "Only the owner can remove participants." };
    if (p.targetId === p.userId) return { error: "That's you — owners can't be removed." };
    await deleteRowMatch_("Members", { challenge_id: p.challengeId, user_id: p.targetId });
    return { ok: true };
  }

  if (action === "sendInvite") {
    const mine = (await members_()).find((m) => m.challenge_id === p.challengeId && m.user_id === p.userId);
    if (!mine || String(mine.role) !== "owner") return { error: "Only the owner can invite people." };
    const mem = await members_();
    const inv = await table_("Invites");
    let sent = 0;
    for (const uid of p.targetIds || []) {
      if (uid === p.userId) continue;
      if (mem.some((m) => m.challenge_id === p.challengeId && m.user_id === uid)) continue; // already in
      if (inv.some((i) => i.challenge_id === p.challengeId && i.to_id === uid && String(i.status) === "pending")) continue;
      await append_("Invites", { invite_id: "inv_" + Date.now().toString(36) + "_" + sent,
        challenge_id: p.challengeId, from_id: p.userId, to_id: uid, status: "pending", created_at: today_() });
      sent++;
    }
    return { ok: true, sent };
  }

  if (action === "notifyParticipants") {
    const ch = await challenge_(p.challengeId);
    if (!ch) return { error: "Challenge not found" };
    const mine = (await members_()).find((m) => m.challenge_id === p.challengeId && m.user_id === p.userId);
    if (!mine || String(mine.role) !== "owner") return { error: "Only the owner can broadcast." };
    const msg = String(p.message || "").trim();
    if (!msg) return { error: "Write a message first." };

    // slow mode: 12h between two broadcasts in the same challenge
    const ann = await table_("Announcements");
    const cutoff = Date.now() - 12 * 3600 * 1000;
    const recent = ann
      .filter((a) => a.challenge_id === p.challengeId && a.from_id === p.userId && a.ts && new Date(a.ts).getTime() > cutoff)
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0];
    if (recent) {
      const waitMin = Math.ceil((12 * 3600 * 1000 - (Date.now() - new Date(recent.ts).getTime())) / 60000);
      const h = Math.floor(waitMin / 60), m = waitMin % 60;
      return { error: "Slow mode — you can send the next message in " + (h ? h + "h " : "") + m + "m." };
    }

    const ts = new Date().toISOString();
    const targets = p.targetIds === "all" || !Array.isArray(p.targetIds)
      ? ["all"]
      : p.targetIds.filter((t) => t !== p.userId);
    if (!targets.length) return { error: "Pick at least one participant." };
    for (const t of targets) {
      await append_("Announcements", { announcement_id: "an_" + Date.now().toString(36) + "_" + targets.indexOf(t),
        challenge_id: p.challengeId, from_id: p.userId, to_id: t, message: msg, created_at: today_(), ts });
    }
    return { ok: true, sentTo: targets.length === 1 && targets[0] === "all" ? "everyone" : targets.length };
  }

  /* ---------- settings ---------- */

  if (action === "saveSettings") {
    const rows = await table_("NotificationSettings");
    const row = { user_id: p.userId, reminders_enabled: !!p.reminders_enabled,
      reminder_frequency: p.reminder_frequency || 2,
      reminder_start: p.reminder_start || "09:00", reminder_end: p.reminder_end || "22:00" };
    const idx = rows.findIndex((r) => r.user_id === p.userId);
    if (idx >= 0) await putRow_("NotificationSettings", idx + 2, row);
    else await append_("NotificationSettings", row);
    return { ok: true };
  }

  if (action === "saveFriendPrefs") {
    await deleteRowsWhere_("FriendNotifications", "user_id", p.userId);
    if (Array.isArray(p.prefs)) {
      for (const f of p.prefs) {
        await append_("FriendNotifications", { user_id: p.userId, friend_id: f.friend_id, enabled: !!f.enabled });
      }
    }
    return { ok: true };
  }

  return { error: "Unknown action: " + action };
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

const json_ = (obj) =>
  new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json; charset=utf-8" } });
const cors_ = (res) => {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return cors_(new Response(null, { status: 204 }));
    let out;
    try {
      const body = JSON.parse((await request.text()) || "{}");
      out = await handle_(body.action, body.payload || {});
    } catch (err) {
      out = { error: String((err && err.message) || err) };
    }
    return cors_(json_(out));
  },
};
