import { useCallback, useEffect, useState } from 'react';
import { en } from '@doorlivery/shared';
import { api, setUnauthorizedHandler, type Me } from './api';
import { linkHandler, navigate, useRoute } from './router';
import { LoginPage } from './pages/LoginPage';
import { DeliveryListPage } from './pages/DeliveryListPage';
import { NewDeliveryPage } from './pages/NewDeliveryPage';
import { DeliveryDetailPage } from './pages/DeliveryDetailPage';

const t = en.vendor;

export function App() {
  const route = useRoute();
  // undefined = still checking the session, null = logged out
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const loadMe = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setMe(null));
    void loadMe();
  }, [loadMe]);

  // Keep the URL in step with the session.
  useEffect(() => {
    if (me === null && route.name !== 'login') navigate('/login', true);
    if (me && route.name === 'login') navigate('/', true);
  }, [me, route.name]);

  if (me === undefined) return <div className="center muted">…</div>;
  if (me === null) return <LoginPage onLoggedIn={loadMe} />;

  async function logout() {
    try {
      await api.logout();
    } finally {
      setMe(null);
    }
  }

  return (
    <>
      <header className="topbar">
        <a href="/" onClick={linkHandler('/')} className="brand">
          {t.appName}
        </a>
        <span className="who">{me.business_name}</span>
        <button type="button" className="link" onClick={logout}>
          {t.nav.logout}
        </button>
      </header>
      <main className="page">
        {route.name === 'new' && <NewDeliveryPage />}
        {route.name === 'detail' && <DeliveryDetailPage id={route.id} />}
        {route.name === 'list' && <DeliveryListPage page={route.page} />}
      </main>
    </>
  );
}
