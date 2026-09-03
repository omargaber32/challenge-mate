/**
 * Google Sheets transport.
 *
 * Topology:
 *   Frontend (GitHub Pages) ──HTTPS──▶ Google Apps Script Web App ──▶ Google Sheet
 *
 * The Sheet is the database. A Google Apps Script Web App (the deployable
 * backend lives in `backend/Code.gs` at the repo root) exposes it as a tiny
 * JSON RPC API, so end users never need Google sign-in (README §2). The
 * browser posts `{action, payload}` and receives the same view-models the
 * local engine returns.
 *
 * `rpc` uses `Content-Type: text/plain` deliberately: it avoids a CORS
 * preflight (OPTIONS) that Apps Script cannot answer.
 */

import type { Challenge, User } from "../types";
import type {
  ChallengeCardData,
  DetailData,
  HomeData,
  ProfileData,
  ProgressData,
} from "./api";

/* ------------------------------------------------------------------ */
/* connection — hardcoded in frontend code (no in-app configuration)   */
/* ------------------------------------------------------------------ */

/**
 * ⬇ PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE ⬇
 *
 * It is the /exec URL you get from Apps Script ▸ Deploy ▸ Web app, e.g.
 *   "https://script.google.com/macros/s/AKfycbx1234…/exec"
 *
 * Leave it empty ("") to run the built-in local demo engine instead.
 * Full step-by-step guide: README / deployment docs of this repository.
 */
export const SHEETS_API_URL = "";

export function isSheetsConfigured(): boolean {
  return /^https:\/\/script\.google(?:usercontent)?\.com\/.+\/exec$/.test(SHEETS_API_URL.trim());
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
  listUsers: (userId: string) => rpc<{ user_id: string; username: string }[]>("listUsers", { userId }),
};
