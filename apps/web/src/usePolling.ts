import { useEffect, useRef } from 'react';

/**
 * Calls `fn` every `intervalMs` while the tab is visible. Pauses when the phone is locked or the tab is in the
 * background (saves data and battery), and runs once straight away when the vendor comes back to the tab.
 */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let running = false;

    const tick = async () => {
      if (running) return; // never overlap requests on a slow connection
      running = true;
      try {
        await fnRef.current();
      } finally {
        running = false;
      }
    };
    const start = () => {
      if (timer === null) timer = setInterval(() => void tick(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void tick();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled]);
}
