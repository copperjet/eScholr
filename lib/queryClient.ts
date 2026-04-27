/**
 * Centralised React Query client + AsyncStorage persistence.
 *
 * Goals:
 *   - Zero perceptible loading states on cold start (hydrate from disk).
 *   - Stale-while-revalidate everywhere (placeholderData: keepPreviousData).
 *   - Long gcTime so persisted entries survive 24h.
 *   - Offline-first network mode so cached data renders even with flaky networks.
 */
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Bump this when the cache shape changes to invalidate all persisted entries.
export const CACHE_BUSTER = 'v1.0.0';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays "fresh" for 5 minutes — no refetch during this window.
      staleTime: 1000 * 60 * 5,
      // Keep cached data for 24h so persisted cache stays useful across app restarts.
      gcTime: 1000 * 60 * 60 * 24,
      retry: 2,
      // On filter/tab switches and query-key changes, render previous data instantly
      // instead of flashing a skeleton while the new query resolves.
      placeholderData: (prev: unknown) => prev,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // Render from cache first even if offline, fetch in background.
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 1,
      networkMode: 'offlineFirst',
    },
  },
});

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'escholr-rq-cache',
  throttleTime: 1000,
});
