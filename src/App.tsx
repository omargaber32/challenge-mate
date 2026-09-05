import { useEffect, useState } from "react";
import { api } from "./services/api";
import type { User } from "./types";
import { ToastProvider } from "./components/ui";
import { Ambient, BottomNav, SideNav, Wordmark, applyTheme, THEME_KEY, type TabId } from "./components/chrome";
import { FlameFill } from "./components/icons";
import { startNotifyEngine, stopNotifyEngine } from "./utils/notify";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import ChallengesPage from "./pages/ChallengesPage";
import ChallengeDetailPage from "./pages/ChallengeDetailPage";
import ProgressPage from "./pages/ProgressPage";
import ProfilePage from "./pages/ProfilePage";

function Splash() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center">
      <Ambient />
      <div className="relative z-10 flex flex-col items-center">
        <span className="relative inline-flex">
          <span className="anim-glow absolute inset-0 rounded-full bg-ember-500/40 blur-2xl" />
          <FlameFill className="anim-flicker relative h-16 w-16 text-ember-500" />
        </span>
        <div className="mt-5">
          <Wordmark />
        </div>
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.28em] text-bone-600">
          lighting the streaks…
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<TabId>("home");
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    // theme (also set pre-paint by the inline script in index.html)
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved) applyTheme(saved);
    } catch {
      /* ignore */
    }
    const u = api.sessionUser();
    setUser(u);
    if (u) startNotifyEngine(u);
    const t = setTimeout(() => setBooting(false), 850);
    return () => {
      clearTimeout(t);
      stopNotifyEngine();
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab, detailId]);

  const logout = () => {
    stopNotifyEngine();
    api.logout();
    setUser(null);
    setTab("home");
    setDetailId(null);
  };

  if (booting) return <Splash />;

  return (
    <ToastProvider>
      {user ? (
        <div className="relative min-h-dvh md:pl-60">
          <Ambient />
          <SideNav tab={tab} onChange={(t) => { setTab(t); setDetailId(null); }} username={user.username} connected={!!api.workerConfigured} />

          {/*
            Shell is a flex column: content grows, the mobile nav sits in-flow
            after it (sticky while scrolling) — so page content can NEVER end
            up underneath the bar.
          */}
          <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col md:max-w-[680px] lg:max-w-[760px]">
            <main className="flex-1 px-4 pb-8 pt-4 md:px-8 md:pb-12 md:pt-8">
              {detailId ? (
                <ChallengeDetailPage user={user} challengeId={detailId} onBack={() => setDetailId(null)} />
              ) : tab === "home" ? (
                <HomePage
                  user={user}
                  onOpenChallenge={setDetailId}
                  onGoChallenges={() => setTab("challenges")}
                  onGoProfile={() => setTab("profile")}
                />
              ) : tab === "challenges" ? (
                <ChallengesPage user={user} onOpen={setDetailId} />
              ) : tab === "progress" ? (
                <ProgressPage user={user} />
              ) : (
                <ProfilePage user={user} onLogout={logout} />
              )}
            </main>
            {!detailId && <BottomNav tab={tab} onChange={setTab} />}
          </div>
        </div>
      ) : (
        <AuthPage
          onAuthed={(u) => {
            setUser(u);
            startNotifyEngine(u);
          }}
        />
      )}
    </ToastProvider>
  );
}
