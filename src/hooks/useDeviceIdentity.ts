import { useState, useEffect } from 'react';

export function useDeviceIdentity(): string {
  const [identity, setIdentity] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('currentUser');
      if (saved === 'P' || saved === 'R') {
        return saved;
      }
    } catch {
      /* storage can't be read: ask who's using this phone */
    }
    return 'P'; // Default to Peter
  });

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'currentUser' && (e.newValue === 'P' || e.newValue === 'R')) {
        setIdentity(e.newValue);
      }
    };

    // Sent by setCurrentDeviceIdentity when "who's using this phone" changes in Settings.
    const handleCustomChange = (e: Event) => {
      setIdentity((e as CustomEvent<'P' | 'R'>).detail);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('currentUserChanged', handleCustomChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('currentUserChanged', handleCustomChange);
    };
  }, []);

  return identity;
}

export function setCurrentDeviceIdentity(identity: 'P' | 'R') {
  try {
    localStorage.setItem('currentUser', identity);
  } catch {
    /* storage blocked: remembered until the app is closed */
  }
  window.dispatchEvent(new CustomEvent('currentUserChanged', { detail: identity }));
}
