// src/store/deviceStore.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDevicesForUser } from '../api/dinodia';
import type { UIDevice } from '../models/device';
import { loadJson, saveJson } from '../utils/storage';

type DeviceCacheEntry = {
  devices: UIDevice[];
  updatedAt: number;
};

type RefreshOptions = {
  background?: boolean;
};

const memoryCache = new Map<number, DeviceCacheEntry>();
const inFlight = new Map<number, Promise<DeviceCacheEntry>>();
const cacheKey = (userId: number) => `dinodia_devices_${userId}`;

async function readFromStorage(userId: number): Promise<DeviceCacheEntry | null> {
  const existing = memoryCache.get(userId);
  if (existing) return existing;

  try {
    const stored = await loadJson<DeviceCacheEntry>(cacheKey(userId));
    if (
      stored &&
      Array.isArray((stored as any).devices) &&
      typeof (stored as any).updatedAt === 'number'
    ) {
      memoryCache.set(userId, stored);
      return stored;
    }
  } catch {
    // Ignore storage errors; we'll fetch fresh data below
  }

  return null;
}

async function persistCache(userId: number, entry: DeviceCacheEntry): Promise<void> {
  memoryCache.set(userId, entry);
  try {
    await saveJson(cacheKey(userId), entry);
  } catch {
    // Ignore storage write failures to avoid blocking UI
  }
}

async function fetchAndCacheDevices(userId: number): Promise<DeviceCacheEntry> {
  const ongoing = inFlight.get(userId);
  if (ongoing) {
    return ongoing;
  }

  const request = (async () => {
    const devices = await fetchDevicesForUser(userId);
    const entry: DeviceCacheEntry = { devices, updatedAt: Date.now() };
    await persistCache(userId, entry);
    return entry;
  })();

  inFlight.set(userId, request);
  try {
    return await request;
  } finally {
    inFlight.delete(userId);
  }
}

export function useDevices(userId: number) {
  const initial = useMemo(() => memoryCache.get(userId) ?? null, [userId]);
  const [devices, setDevices] = useState<UIDevice[]>(initial?.devices ?? []);
  const [lastUpdated, setLastUpdated] = useState<number | null>(initial?.updatedAt ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const updateState = useCallback(
    (entry: DeviceCacheEntry | null) => {
      if (!mountedRef.current || !entry) return;
      setDevices(entry.devices);
      setLastUpdated(entry.updatedAt);
    },
    []
  );

  const refreshDevices = useCallback(
    async (opts: RefreshOptions = {}): Promise<UIDevice[] | null> => {
      const silent = opts.background === true;
      if (!silent) setRefreshing(true);
      try {
        const entry = await fetchAndCacheDevices(userId);
        updateState(entry);
        setError(null);
        return entry.devices;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load devices';
        if (mountedRef.current) setError(message);
        return null;
      } finally {
        if (mountedRef.current && !silent) setRefreshing(false);
      }
    },
    [updateState, userId]
  );

  useEffect(() => {
    const cached = memoryCache.get(userId);
    if (cached) {
      setDevices(cached.devices);
      setLastUpdated(cached.updatedAt);
    } else {
      setDevices([]);
      setLastUpdated(null);
    }
    setError(null);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readFromStorage(userId);
      if (cancelled || !mountedRef.current) return;
      updateState(cached);
      await refreshDevices({ background: true });
    })();

    const interval = setInterval(() => {
      void refreshDevices({ background: true });
    }, 12000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshDevices, updateState, userId]);

  return {
    devices,
    lastUpdated,
    refreshing,
    error,
    refreshDevices,
  };
}
