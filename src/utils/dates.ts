/** Date helpers. All "keys" are local yyyy-mm-dd strings — they compare lexicographically. */

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const parseKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const todayKey = () => dateKey(new Date());

export const keyShift = (k: string, n: number) => dateKey(addDays(parseKey(k), n));

export const rangeKeys = (start: string, end: string) => {
  const out: string[] = [];
  let d = parseKey(start);
  const e = parseKey(end);
  while (d <= e) {
    out.push(dateKey(d));
    d = addDays(d, 1);
  }
  return out;
};

export const weekdayOf = (k: string) => parseKey(k).getDay();

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const fmtDay = (k: string) =>
  parseKey(k).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const fmtDayLong = (k: string) =>
  parseKey(k).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

export const fmtRange = (a: string, b: string) => `${fmtDay(a)} → ${fmtDay(b)}`;

export const fmtMonthYear = (year: number, month: number) =>
  new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

/** Did the wall-clock pass today's deadline, e.g. "23:00"? */
export const deadlinePassed = (deadline: string) => {
  const now = new Date();
  const [h, m] = deadline.split(":").map(Number);
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
};

export const minutesUntilDeadline = (deadline: string) => {
  const now = new Date();
  const [h, m] = deadline.split(":").map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 60000);
};

/** Monday-based week start key. */
export const weekStartKey = (k: string) => {
  const d = parseKey(k);
  return dateKey(addDays(d, -((d.getDay() + 6) % 7)));
};

/** ISO-ish week id, e.g. "2025-W37" — used for the optional-vacation weekly allowance. */
export const isoWeekOf = (k: string) => {
  const d = parseKey(k);
  const t = new Date(d);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const week1 = new Date(t.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((t.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    );
  return `${t.getFullYear()}-W${pad2(week)}`;
};

/** Monday-first month grid of keys (nulls pad the edges). */
export const monthGrid = (year: number, month: number) => {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(dateKey(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

export const nowTimeHM = () => {
  const n = new Date();
  return `${pad2(n.getHours())}:${pad2(n.getMinutes())}`;
};

export const fmtClock = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export const fmtMinutes = (mins: number) => {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};
