import { useEffect } from 'react';
import {
  loadBookPage,
  loadCollectionPage,
  loadLibraryPage,
} from './pageLoaders';

// Warm static modules only. Private records stay in the user-scoped query path.
export function usePreloadPages(userId: string | undefined) {
  useEffect(() => {
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean };
      }
    ).connection;
    if (!userId || connection?.saveData) return;
    const preload = () => {
      void Promise.allSettled([
        loadLibraryPage(),
        loadBookPage(),
        loadCollectionPage(),
      ]);
    };
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(preload, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(preload, 750);
    return () => window.clearTimeout(timer);
  }, [userId]);
}
