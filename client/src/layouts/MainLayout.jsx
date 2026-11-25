import Navbar from '../components/Navbar';
import AIAssistant from '../components/AIAssistant';
import PageLoader from '../components/PageLoader';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Compass, Target, MessageCircle, UserRound, LogOut } from 'lucide-react';
import { Suspense, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

function DemoModeBanner() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  if (!user?.isDemo) return null;

  return (
    <div className="border-b border-amber-200/90 dark:border-amber-900/60 bg-gradient-to-r from-amber-50 via-orange-50/90 to-emerald-50/80 dark:from-amber-950/60 dark:via-stone-900 dark:to-emerald-950/50">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-amber-950 dark:text-amber-200 font-medium">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-600 text-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide shrink-0">
            <Compass size={11} /> One-Time Demo
          </span>
          <span>
            You are surfing with a temporary guest pass (ends when you close this tab or after 2h).
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="rounded-lg bg-amber-700 hover:bg-amber-800 text-white px-2.5 py-1 text-[11px] font-bold transition cursor-pointer"
          >
            Sign in with Google
          </button>
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/');
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-white/80 dark:bg-stone-900/60 px-2.5 py-1 text-[11px] font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100/70 transition cursor-pointer"
          >
            <LogOut size={12} /> Exit
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileBottomNav() {
  const { pathname } = useLocation();
  if (pathname === '/login' || pathname === '/register') return null;
  const items = [[Home, 'Home', '/'], [Compass, 'Explore', '/colleges'], [Target, 'GATE', '/gate'], [MessageCircle, 'Community', '/doubts'], [UserRound, 'Profile', '/profile']];
  return <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Mobile navigation">{items.map(([Icon,label,to]) => { const on = to === '/' ? pathname === '/' : pathname.startsWith(to); return <Link key={label} to={to} className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold ${on ? 'text-indigo-600' : 'text-slate-500'}`}><Icon size={19} strokeWidth={on ? 2.5 : 2}/>{label}</Link>; })}</nav>;
}

export default function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col relative bg-grid-pattern">
      <div className="fixed inset-0 radial-gradient-bg pointer-events-none -z-10"></div>
      <Navbar />
      <DemoModeBanner />
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:pb-8 animate-fade-in">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      
      <AIAssistant />

      {/* Simple Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 mt-auto glass-panel">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-center text-sm text-slate-500 dark:text-slate-400">
          <span>© {new Date().getFullYear()} NOTESX. All rights reserved.</span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700">·</span>
          <Link to="/privacy" className="font-medium hover:text-slate-800 dark:hover:text-slate-200 hover:underline transition">
            Privacy Policy
          </Link>
        </div>
      </footer>
      <MobileBottomNav />
    </div>
  );
}
