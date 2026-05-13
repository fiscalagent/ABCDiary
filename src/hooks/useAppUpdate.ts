import { useState, useEffect, useCallback } from 'react';

const CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes

export function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`);
      if (!res.ok) return;
      const { version } = await res.json() as { version: string };
      if (version !== __APP_VERSION__) {
        setUpdateAvailable(true);
      }
    } catch {
      // network unavailable — ignore
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, CHECK_INTERVAL);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [check]);

  const applyUpdate = useCallback(() => {
    window.location.reload();
  }, []);

  return { updateAvailable, applyUpdate };
}
