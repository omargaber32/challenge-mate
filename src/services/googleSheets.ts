/**
 * Google Sheets transport.
 *
 * Topology:
 *   Frontend (GitHub Pages) ──HTTPS──▶ Google Apps Script Web App ──▶ Google Sheet
 *
 * The Sheet is the database. A Google Apps Script Web App (see
 * APPS_SCRIPT_CODE below / `public/Code.gs`) exposes it as a tiny JSON RPC
 * API, so end users never need Google sign-in (README §2). The browser posts
 * `{action, payload}` and receives the same view-models the local engine
 * returns.
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
/* connection config                                                   */
/* ------------------------------------------------------------------ */

export interface SheetsConfig {
  url: string; // Apps Script Web App URL, e.g. https://script.google.com/macros/s/…/exec
  enabled: boolean;
}

const CONFIG_KEY = "challengemate_sheets_v1";

export function getSheetsConfig(): SheetsConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const c = JSON.parse(raw) as Partial<SheetsConfig>;
      return { url: typeof c.url === "string" ? c.url : "", enabled: !!c.enabled };
    }
  } catch {
    /* fall through */
  }
  return { url: "", enabled: false };
}

export function setSheetsConfig(url: string, enabled: boolean): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: url.trim(), enabled }));
}

export function isSheetsConfigured(): boolean {
  const c = getSheetsConfig();
  return c.enabled && /^https:\/\/script\.google(?:usercontent)?\.com\/.+\/exec$/.test(c.url);
}

/* ------------------------------------------------------------------ */
/* rpc                                                                 */
/* ------------------------------------------------------------------ */

export async function rpc<T>(action: string, payload: unknown = {}): Promise<T> {
  const { url } = getSheetsConfig();
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

/** lightweight ping used by the "Test connection" button */
export async function testSheetsConnection(url: string): Promise<{ ok: boolean; message: string }> {
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
  listUsers: (userId: string) => rpc<{ user_id: string; username: string }[]>("listUsers", { userId }),
};

/* ------------------------------------------------------------------ */
/* deployable Apps Script backend                                      */
/* ------------------------------------------------------------------ */

export const APPS_SCRIPT_CODE = `/**
 * ChallengeMate — Google Apps Script backend (Google Sheet = database).
 *
 * Setup
 *  1. Create a Google Sheet (any name).
 *  2. Extensions ▸ Apps Script ▸ paste this whole file as Code.gs.
 *  3. Deploy ▸ New deployment ▸ type "Web app":
 *       - Execute as: Me
 *       - Who has access: Anyone
 *  4. Copy the /exec Web App URL into ChallengeMate ▸ Profile ▸ Data source.
 *
 * On first run it creates the 11 tabs + headers from the README §23 schema.
 */

var SHEETS = ['Users','Challenges','Members','DailyTasks','Completions','Vacations',
  'Penalties','Achievements','UserAchievements','NotificationSettings','FriendNotifications'];

var HEADERS = {
  Users:['user_id','username','password','created_at'],
  Challenges:['challenge_id','name','icon','description','rules','owner_id','start_date','end_date',
    'deadline','penalty_points','main_vacation_day','optional_vacations_per_week','created_at'],
  Members:['challenge_id','user_id','role','anonymous','joined_at'],
  DailyTasks:['task_id','challenge_id','user_id','date','status','completed_at'],
  Completions:['task_id','duration','summary'],
  Vacations:['vacation_id','challenge_id','user_id','date','type'],
  Penalties:['penalty_id','challenge_id','user_id','date','points','reason','created_at'],
  Achievements:['achievement_id','name','description','requirement'],
  UserAchievements:['user_id','achievement_id','earned_at'],
  NotificationSettings:['user_id','reminders_enabled','reminder_frequency','reminder_start','reminder_end'],
  FriendNotifications:['user_id','friend_id','enabled']
};

function ss(){ return SpreadsheetApp.getActiveSpreadsheet(); }

function ensureSchema(){
  var s = ss();
  SHEETS.forEach(function(name){
    var sh = s.getSheetByName(name);
    if(!sh){ sh = s.insertSheet(name); }
    if(sh.getLastRow()===0){ sh.appendRow(HEADERS[name]); }
  });
}

function rows(name){
  ensureSchema();
  var sh = ss().getSheetByName(name);
  var v = sh.getDataRange().getValues();
  var head = HEADERS[name], out=[];
  for(var i=1;i<v.length;i++){
    var r={};
    for(var j=0;j<head.length;j++){ r[head[j]] = v[i][j]; }
    if(r[head[0]]!=='' && r[head[0]]!==undefined) out.push(r);
  }
  return out;
}

function addRow(name, obj){
  ensureSchema();
  var sh = ss().getSheetByName(name);
  sh.appendRow(HEADERS[name].map(function(h){ return obj[h]!==undefined && obj[h]!==null ? obj[h] : ''; }));
}

function key_(d){ return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function today_(){ return key_(new Date()); }
function parseKey_(k){ var p=String(k).split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function addDays_(k,n){ var d=parseKey_(k); d.setDate(d.getDate()+n); return key_(d); }
function weekday_(k){ return parseKey_(k).getDay(); }
function range_(a,b){ var out=[],k=a; while(k<=b){ out.push(k); k=addDays_(k,1);} return out; }
function isoWeek_(k){ var d=parseKey_(k); d.setDate(d.getDate()+3-((d.getDay()+6)%7));
  var w1=new Date(d.getFullYear(),0,4);
  return d.getFullYear()+'-W'+('0'+(1+Math.round(((d-w1)/864e5-3+((w1.getDay()+6)%7))/7))).slice(-2); }

function getChallenge_(id){ var c=rows('Challenges'); for(var i=0;i<c.length;i++) if(c[i].challenge_id===id) return c[i]; return null; }
function membersOf_(id){ return rows('Members').filter(function(m){ return m.challenge_id===id; }); }
function tasksOf_(cid,uid){ return rows('DailyTasks').filter(function(t){ return t.challenge_id===cid && t.user_id===uid; }); }
function usernameOf_(uid){ var u=rows('Users'); for(var i=0;i<u.length;i++) if(u[i].user_id===uid) return u[i].username; return 'unknown'; }

function statusFor_(date, ch, byDate){
  if(byDate[date]) return byDate[date].status;
  var today=today_();
  if(date===today) return 'PENDING';
  if(weekday_(date)===Number(ch.main_vacation_day)) return 'VACATION';
  return date<today ? 'MISSED' : 'PENDING';
}

function computeStats_(ch, uid){
  var tasks=tasksOf_(ch.challenge_id, uid);
  var byDate={}; tasks.forEach(function(t){ byDate[t.date]=t; });
  var comps=rows('Completions'); var compByTask={}; comps.forEach(function(c){ compByTask[c.task_id]=c; });
  var today=today_();
  var end = ch.end_date<today?ch.end_date:today;
  var keys=range_(ch.start_date,end);
  var cur=0,best=0,done=0,missed=0,vac=0,mins=0;
  keys.forEach(function(k){
    var s=statusFor_(k,ch,byDate);
    if(s==='DONE'){ done++; cur++; if(cur>best)best=cur;
      var t=byDate[k]; var c=t&&compByTask[t.task_id];
      if(c&&c.duration!=='') mins+=Number(c.duration); }
    else if(s==='MISSED'){ missed++; cur=0; }
    else if(s==='VACATION'){ vac++; }
  });
  var pen=rows('Penalties').filter(function(p){ return p.challenge_id===ch.challenge_id&&p.user_id===uid; })
    .reduce(function(s,p){ return s+Number(p.points); },0);
  var applicable=done+missed;
  return { currentStreak:cur, bestStreak:best, done:done, missed:missed, vacations:vac,
    totalMinutes:mins, completionPct: applicable?Math.round(done/applicable*100):0,
    applicableDays:applicable, penalties:Math.max(0,pen) };
}

function optLeft_(ch, uid){
  if(Number(ch.optional_vacations_per_week)<=0) return 0;
  var today=today_(); var start=addDays_(today,-((weekday_(today)+6)%7));
  var week={}; range_(start, addDays_(start,6)).forEach(function(k){ week[k]=1; });
  var used=rows('Vacations').filter(function(v){ return v.challenge_id===ch.challenge_id&&v.user_id===uid&&v.type==='optional'&&week[v.date]; }).length;
  return Math.max(0, Number(ch.optional_vacations_per_week)-used);
}

function handle_(action, p){
  ensureSchema();
  var i,u,ch;

  if(action==='ping') return { pong:true, title:ss().getName() };

  if(action==='login'){
    u=rows('Users');
    for(i=0;i<u.length;i++) if(String(u[i].username).toLowerCase()===String(p.username).toLowerCase()){
      if(String(u[i].password)!==String(p.password)) return { error:'Incorrect password.' };
      return { user_id:u[i].user_id, username:u[i].username, password:u[i].password, created_at:u[i].created_at };
    }
    return { error:'Unknown username.' };
  }

  if(action==='register'){
    u=rows('Users');
    for(i=0;i<u.length;i++) if(String(u[i].username).toLowerCase()===String(p.username).toLowerCase())
      return { error:'That username is already taken.' };
    var nu={ user_id:'u_'+new Date().getTime(), username:p.username, password:p.password, created_at:today_() };
    addRow('Users', nu);
    addRow('NotificationSettings',{ user_id:nu.user_id, reminders_enabled:false, reminder_frequency:2, reminder_start:'09:00', reminder_end:'22:00' });
    return nu;
  }

  if(action==='challenges'){
    var today=today_();
    return rows('Challenges').map(function(c){
      var mem=membersOf_(c.challenge_id);
      var mine=null; mem.forEach(function(m){ if(m.user_id===p.userId) mine=m; });
      return { challenge:c, member:mine, participants:mem.length,
        state: c.end_date<today?'ended':(mine?'joined':'discover') };
    });
  }

  if(action==='enroll'){
    addRow('Members',{ challenge_id:p.challengeId, user_id:p.userId, role:'member', anonymous:!!p.anonymous, joined_at:today_() });
    return { ok:true };
  }

  if(action==='completeTask'){
    ch=getChallenge_(p.challengeId); if(!ch) return { error:'Challenge not found' };
    var today2=today_();
    var taskId=p.challengeId+'__'+p.userId+'__'+today2;
    var existing=tasksOf_(p.challengeId,p.userId).filter(function(t){ return t.date===today2; })[0];
    if(existing && existing.status==='DONE') return { error:"Today's task is already done." };
    addRow('DailyTasks',{ task_id:taskId, challenge_id:p.challengeId, user_id:p.userId, date:today2,
      status:'DONE', completed_at:new Date().toISOString() });
    if(p.duration!=null || p.summary) addRow('Completions',{ task_id:taskId, duration:p.duration!=null?p.duration:'', summary:p.summary||'' });
    return { newAchievements:[] };
  }

  if(action==='vacation'){
    ch=getChallenge_(p.challengeId); if(!ch) return { error:'Challenge not found' };
    var today3=today_();
    if(weekday_(today3)===Number(ch.main_vacation_day)) return { error:'Today is already the main vacation day.' };
    var left=optLeft_(ch,p.userId);
    if(left<=0) return { error:'No optional vacations left this week.' };
    var taskId2=p.challengeId+'__'+p.userId+'__'+today3;
    addRow('DailyTasks',{ task_id:taskId2, challenge_id:p.challengeId, user_id:p.userId, date:today3, status:'VACATION', completed_at:'' });
    addRow('Vacations',{ vacation_id:'v_'+p.userId+'_'+today3, challenge_id:p.challengeId, user_id:p.userId, date:today3, type:'optional' });
    return { optLeft:left-1 };
  }

  if(action==='home'){
    var today4=today_(); var out=[]; var totalPen=0;
    rows('Members').filter(function(m){ return m.user_id===p.userId; }).forEach(function(m){
      ch=getChallenge_(m.challenge_id); if(!ch||ch.end_date<today4) return;
      var st=computeStats_(ch,p.userId);
      var byDate={}; tasksOf_(ch.challenge_id,p.userId).forEach(function(t){ byDate[t.date]=t; });
      var status=statusFor_(today4,ch,byDate);
      totalPen+=st.penalties;
      out.push({ challenge:ch, anonymous:!!m.anonymous, status:status, streak:st.currentStreak,
        best:st.bestStreak, optLeft:optLeft_(ch,p.userId), penalties:st.penalties, completion:null,
        deadlineOver:false });
    });
    var QUOTES=['Small progress is still progress.','You don\u2019t need motivation. You need consistency.',
      'One more day. Keep the streak alive! \uD83D\uDD25','Miss once, never twice.','Future you is watching.'];
    return { quote:{ text:QUOTES[Math.floor(Math.random()*QUOTES.length)], author:'ChallengeMate' }, tasks:out, totalPenalties:totalPen };
  }

  if(action==='detail'||action==='progress'){
    ch=getChallenge_(p.challengeId); if(!ch) return { error:'Challenge not found' };
    var mem=membersOf_(p.challengeId);
    var visible=mem.filter(function(m){ return !m.anonymous; });
    var lb=visible.map(function(m){ var s=computeStats_(ch,m.user_id);
      return { user_id:m.user_id, username:usernameOf_(m.user_id), anonymous:false, streak:s.currentStreak,
        best:s.bestStreak, done:s.done, penalties:s.penalties, completionPct:s.completionPct, isYou:m.user_id===p.userId }; });
    lb.sort(function(a,b){ return b.streak-a.streak || b.best-a.best || b.done-a.done; });
    var mine=null; mem.forEach(function(m){ if(m.user_id===p.userId) mine=m; });
    if(action==='progress'){
      if(!mine) return { error:'Not a member.' };
      var byDate2={}; tasksOf_(p.challengeId,p.userId).forEach(function(t){ byDate2[t.date]=t; });
      var statuses={}; range_(ch.start_date, ch.end_date<today_()?ch.end_date:today_()).forEach(function(k){ statuses[k]=statusFor_(k,ch,byDate2); });
      return { challenge:ch, stats:computeStats_(ch,p.userId), statuses:statuses, friends:lb };
    }
    var WEEKD=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var todayW=today_();
    var monday=addDays_(todayW,-((weekday_(todayW)+6)%7));
    var byD={}; if(mine) tasksOf_(p.challengeId,p.userId).forEach(function(t){ byD[t.date]=t; });
    var weekArr=range_(monday, addDays_(monday,6)).map(function(k){
      return { key:k, label:WEEKD[weekday_(k)], dayNum:Number(String(k).slice(8)),
        status: mine?statusFor_(k,ch,byD):'PENDING', isToday:k===todayW, isMain:weekday_(k)===Number(ch.main_vacation_day) };
    });
    var penEvents=[]; var penBal=0;
    if(mine){
      var removals=rows('Penalties').filter(function(x){ return x.challenge_id===p.challengeId&&x.user_id===p.userId; });
      var endP=ch.end_date<todayW?ch.end_date:todayW;
      range_(ch.start_date,endP).forEach(function(k){
        if(statusFor_(k,ch,byD)==='MISSED'){
          var removed=removals.some(function(r){ return r.date===k; });
          penEvents.push({ date:k, reason:'Missed task', points:Number(ch.penalty_points), removable:!removed });
          if(!removed) penBal+=Number(ch.penalty_points);
        }
      });
      removals.forEach(function(r){ penEvents.push({ date:r.date, reason:String(r.reason||'Penalty removed'), points:Number(r.points), removable:false }); penBal+=Number(r.points); });
      penEvents.sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); });
      penBal=Math.max(0,penBal);
    }
    return { challenge:ch, member:mine,
      participants:visible.map(function(m){ return { user_id:m.user_id, username:usernameOf_(m.user_id), role:m.role, isYou:m.user_id===p.userId }; }),
      hiddenCount:mem.length-visible.length, myStats:mine?computeStats_(ch,p.userId):null,
      week:weekArr, leaderboard:lb, iAmAnonymous:mine?!!mine.anonymous:false,
      penalties:{ events:penEvents, balance:penBal }, optLeft:mine?optLeft_(ch,p.userId):0 };
  }

  if(action==='profile'){
    u=rows('Users'); var me=null; for(i=0;i<u.length;i++) if(u[i].user_id===p.userId) me=u[i];
    if(!me) return { error:'User not found.' };
    return { user:me, global:{ currentStreak:0,bestStreak:0,done:0,missed:0,vacations:0,totalMinutes:0,
        completionPct:0,applicableDays:0,perfectWeeks:0,maxDayMinutes:0,comeback:false,penalties:0 },
      achievements:[], settings:{ user_id:p.userId, reminders_enabled:false, reminder_frequency:2, reminder_start:'09:00', reminder_end:'22:00' },
      friendPrefs:[], challengeCount:rows('Members').filter(function(m){ return m.user_id===p.userId; }).length };
  }

  if(action==='removePenalty'){
    ch=getChallenge_(p.challengeId);
    addRow('Penalties',{ penalty_id:'p_'+new Date().getTime(), challenge_id:p.challengeId, user_id:p.userId,
      date:p.date, points:-(Number(ch?ch.penalty_points:1)), reason:'Penalty removed', created_at:today_() });
    return { ok:true };
  }

  if(action==='saveSettings'||action==='saveFriendPrefs'||action==='createChallenge'||action==='listUsers'||action==='quote'){
    if(action==='createChallenge'){
      var cid='c_'+new Date().getTime();
      addRow('Challenges',{ challenge_id:cid, name:p.name, icon:p.icon||'book', description:p.description||'',
        rules:(p.rules||[]).join('\\n'), owner_id:p.userId, start_date:p.start_date, end_date:p.end_date,
        deadline:p.deadline||'23:00', penalty_points:p.penalty_points!=null?p.penalty_points:1,
        main_vacation_day:p.main_vacation_day!=null?p.main_vacation_day:5,
        optional_vacations_per_week:p.optional_vacations_per_week!=null?p.optional_vacations_per_week:1, created_at:today_() });
      addRow('Members',{ challenge_id:cid, user_id:p.userId, role:'owner', anonymous:false, joined_at:today_() });
      return { challenge_id:cid };
    }
    if(action==='listUsers') return rows('Users').map(function(x){ return { user_id:x.user_id, username:x.username }; });
    return { ok:true };
  }

  return { error:'Unknown action: '+action };
}

function doPost(e){
  var out;
  try{
    var body=JSON.parse(e.postData.contents||'{}');
    out=handle_(body.action, body.payload||{});
  }catch(err){ out={ error:String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(){ return doPost({ postData:{ contents:JSON.stringify({ action:'ping' }) } }); }
`;
