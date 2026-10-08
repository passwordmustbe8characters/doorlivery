import { useCallback, useEffect, useState } from 'react';
import { en } from '@doorlivery/shared';
import { api, setUnauthorizedHandler, type Me } from './api';
import { CardSkeleton, Icon } from './components';
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

  // Tab title follows the screen.
  useEffect(() => {
    const titles = { list: t.list.title, new: t.form.title, detail: t.list.title, login: t.login.submit };
    document.title = `${titles[route.name]} · ${t.appName}`;
  }, [route.name]);

  if (me === undefined) {
    // Shaped like the list it is about to show, instead of a spinner.
    return (
      <main className="page" aria-busy="true">
        <div className="stack-100">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </main>
    );
  }
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
      <a className="skip-link" href="#main">
        {t.skipToContent}
      </a>
      <header className="topbar">
        <a href="/" onClick={linkHandler('/')} className="brand-mark" aria-label={`${t.appName}: ${t.nav.deliveries}`}>
          <span className="logo">
            <Icon name="mapPin" size={18} />
          </span>
          {t.appName}
        </a>
        <span className="who">{me.business_name}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
          <Icon name="signOut" />
          <span>{t.nav.logout}</span>
        </button>
      </header>
      <main className="page" id="main" key={route.name === 'detail' ? route.id : route.name}>
        <div className="appear">
          {route.name === 'new' && <NewDeliveryPage />}
          {route.name === 'detail' && <DeliveryDetailPage id={route.id} business={me.business_name} />}
          {route.name === 'list' && <DeliveryListPage page={route.page} business={me.business_name} />}
        </div>
      </main>
    </>
  );
}
