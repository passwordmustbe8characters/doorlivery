// Tiny history-based router: four screens don't need a library.
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'list'; page: number }
  | { name: 'new' }
  | { name: 'detail'; id: string }
  | { name: 'login' };

export function parseRoute(pathname: string, search: string): Route {
  if (pathname === '/login') return { name: 'login' };
  if (pathname === '/deliveries/new') return { name: 'new' };
  const m = /^\/deliveries\/([0-9a-f-]{36})$/i.exec(pathname);
  if (m) return { name: 'detail', id: m[1]! };
  const page = Number(new URLSearchParams(search).get('page'));
  return { name: 'list', page: Number.isInteger(page) && page > 0 ? page : 1 };
}

export function navigate(to: string, replace = false) {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export function useRoute(): Route {
  const read = () => parseRoute(location.pathname, location.search);
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const onPop = () => setRoute(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return route;
}

/** Plain <a> that navigates without a full page load (still works with middle-click / new tab). */
export function linkHandler(to: string) {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
}
