import React, { useEffect, useMemo, useState } from 'react';
import { getSession, clearSession, Session } from './lib/auth';
import { api } from './lib/api';
import Login from './pages/Login';
import Register from './pages/Register';
import UserHome from './pages/UserHome';
import AdminHome from './pages/AdminHome';
import SupervisorHome from './pages/SupervisorHome';
import TopBar from './components/TopBar';
import { getLang, setLang } from './i18n';

type Route = 'login' | 'register' | 'home';

function getRoute(): Route {
  const p = location.pathname.replace('/', '');
  if (p === 'register') return 'register';
  if (p === 'login' || p === '') return 'login';
  if (p === 'home') return 'home';
  return 'login';
}

function nav(to: Route) {
  history.pushState({}, '', to === 'login' ? '/' : `/${to}`);
  window.dispatchEvent(new Event('popstate'));
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute());
  const [session, setSession] = useState<Session | null>(getSession());
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    const onPop = () => setRoute(getRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    // sync language changes
    const onLang = () => setRoute((r) => r);
    window.addEventListener('ps_lang_changed', onLang);
    return () => window.removeEventListener('ps_lang_changed', onLang);
  }, []);

  useEffect(() => {
    (async () => {
      if (!session) return setMe(null);
      try {
        const data = await api<any>('/api/me');
        setMe(data);
        if (data?.lang) setLang(data.lang);
      } catch {
        setMe(null);
      }
    })();
  }, [session]);

  const content = useMemo(() => {
    if (!session) {
      if (route === 'register') return <Register onDone={() => nav('login')} />;
      return <Login onLogin={(s) => { setSession(s); nav('home'); }} onRegister={() => nav('register')} />;
    }

    if (route !== 'home') nav('home');

    if (session.user.role === 'supervisor') return <SupervisorHome me={me} />;
    if (session.user.role === 'admin') return <AdminHome me={me} />;
    return <UserHome me={me} />;
  }, [session, route, me]);

  return (
    <div className="container">
      <TopBar
        session={session}
        me={me}
        onLogout={() => {
          clearSession();
          setSession(null);
          nav('login');
        }}
        onLangChange={async (lang) => {
          try {
            await api('/api/me/lang', { method: 'PUT', body: JSON.stringify({ lang }) });
            setLang(lang as any);
          } catch {}
        }}
      />
      {content}
    </div>
  );
}
