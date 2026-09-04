/**
 * Google Sheets transport.
 *
 * Topology:
 *   Frontend (GitHub Pages) ──HTTPS──▶ Cloudflare Worker ──Google Sheets REST──▶ Google Sheet
 *
 * The Sheet is the database. A Cloudflare Worker (`backend/worker.js`, pure
 * fetch + Web Crypto, no Node.js) exposes it as a tiny JSON RPC API using a
 * service account, so end users never need Google sign-in (README §2). The
 * browser posts `{action, payload}` and receives the same view-models the
 * local engine returns.
 *
 * `rpc` uses `Content-Type: text/plain` deliberately: it makes the request
 * "simple", so no CORS preflight is needed at all.
 */

import type { Challenge, User } from "../types";
import type {
  ChallengeCardData,
  DetailData,
  HomeData,
  InviteView,
  ProfileData,
  ProgressData,
} from "./api";

/* ------------------------------------------------------------------ */
/* connection — hardcoded in frontend code (no in-app configuration)   */
/* ------------------------------------------------------------------ */

/**
 * ⬇ PASTE YOUR CLOUDFLARE WORKER URL HERE ⬇
 *
 * The URL you get after `npx wrangler deploy backend/worker.js`, e.g.
 *   "https://challengemate.your-subdomain.workers.dev"
 *
 * While this is empty, the app runs the built-in local demo engine and
 * stores data in the browser — set the URL to make Google Sheets (via the
 * Worker) the real database. Only the login session is ever stored locally.
 */
export const SHEETS_API_URL = "";

export function isSheetsConfigured(): boolean {
  // any deployed worker / API endpoint over https counts as configured
  return /^https:\/\/.+\..+/.test(SHEETS_API_URL.trim());
}

/* ------------------------------------------------------------------ */
/* rpc                                                                 */
/* ------------------------------------------------------------------ */

export async function rpc<T>(action: string, payload: unknown = {}): Promise<T> {
  const url = SHEETS_API_URL.trim();
  if (!url) throw new Error("Google Sheets endpoint is not configured.");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      // text/plain avoids a CORS preflight Apps Script can't answer
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, payload }),
    });
  } catch {
    throw new Error("Could not reach the Apps Script endpoint (network/CORS).");
  }
  if (!res.ok) throw new Error(`Sheets API responded ${res.status}`);
  const data = (await res.json()) as T & { error?: string };
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }
  return data;
}

/** lightweight ping — opening the /exec URL in a browser does the same */
export async function testSheetsConnection(url: string = SHEETS_API_URL): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "ping", payload: {} }),
    });
    if (!res.ok) return { ok: false, message: `Endpoint responded ${res.status}` };
    const data = (await res.json()) as { pong?: boolean; title?: string; error?: string };
    if (data.error) return { ok: false, message: String(data.error) };
    return { ok: true, message: data.title ? `Connected — sheet “${data.title}”` : "Connected" };
  } catch {
    return { ok: false, message: "Unreachable — check the URL and that the app is deployed to “Anyone”." };
  }
}

/* ------------------------------------------------------------------ */
/* sheets-backed API surface (mirrors `api` in ./api)                  */
/* ------------------------------------------------------------------ */

export const sheetsApi = {
  login: (username: string, password: string) => rpc<User>("login", { username, password }),
  register: (username: string, password: string) => rpc<User>("register", { username, password }),
  getHome: (userId: string) => rpc<HomeData>("home", { userId }),
  getQuote: () => rpc<HomeData["quote"]>("quote", {}),
  completeTask: (userId: string, challengeId: string, info: { duration: number | null; summary: string | null }) =>
    rpc<{ newAchievements: string[] }>("completeTask", { userId, challengeId, ...info }),
  takeVacation: (userId: string, challengeId: string) => rpc<{ optLeft: number }>("vacation", { userId, challengeId }),
  getChallenges: (userId: string) => rpc<ChallengeCardData[]>("challenges", { userId }),
  enroll: (challengeId: string, userId: string, anonymous: boolean) =>
    rpc<void>("enroll", { challengeId, userId, anonymous }),
  createChallenge: (userId: string, input: Record<string, unknown>) => rpc<Challenge>("createChallenge", { userId, ...input }),
  getChallengeDetail: (userId: string, challengeId: string) => rpc<DetailData>("detail", { userId, challengeId }),
  getProgress: (userId: string, challengeId: string) => rpc<ProgressData>("progress", { userId, challengeId }),
  getProfile: (userId: string) => rpc<ProfileData>("profile", { userId }),
  saveSettings: (userId: string, s: Record<string, unknown>) => rpc<void>("saveSettings", { userId, ...s }),
  saveFriendPrefs: (userId: string, prefs: { friend_id: string; enabled: boolean }[]) =>
    rpc<void>("saveFriendPrefs", { userId, prefs }),
  removePenalty: (userId: string, challengeId: string, date: string) =>
    rpc<void>("removePenalty", { userId, challengeId, date }),
  decreasePenalty: (userId: string, challengeId: string) =>
    rpc<void>("decreasePenalty", { userId, challengeId }),
  endChallenge: (userId: string, challengeId: string, confirmName: string) =>
    rpc<void>("endChallenge", { userId, challengeId, confirmName }),
  deleteChallenge: (userId: string, challengeId: string, confirmName: string) =>
    rpc<void>("deleteChallenge", { userId, challengeId, confirmName }),
  leaveChallenge: (userId: string, challengeId: string) =>
    rpc<void>("leaveChallenge", { userId, challengeId }),
  removeParticipant: (userId: string, challengeId: string, targetId: string) =>
    rpc<void>("removeParticipant", { userId, challengeId, targetId }),
  sendInvite: (userId: string, challengeId: string, targetIds: string[]) =>
    rpc<{ ok: boolean; sent: number }>("sendInvite", { userId, challengeId, targetIds }),
  myInvites: (userId: string) => rpc<InviteView[]>("myInvites", { userId }),
  respondInvite: (userId: string, inviteId: string, accept: boolean) =>
    rpc<void>("respondInvite", { userId, inviteId, accept }),
  notifyParticipants: (userId: string, challengeId: string, message: string, targetIds: string[] | "all") =>
    rpc<{ ok: boolean; sentTo: number | "everyone" }>("notifyParticipants", { userId, challengeId, message, targetIds }),
  listUsers: (userId: string) => rpc<{ user_id: string; username: string }[]>("listUsers", { userId }),
};
