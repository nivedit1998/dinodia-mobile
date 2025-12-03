// src/screens/TenantDashboardScreen.tsx
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, Button } from 'react-native';
import { useSession } from '../store/sessionStore';
import { fetchDevicesForUser } from '../api/dinodia';
import type { UIDevice } from '../models/device';
import { getGroupLabel, sortLabels, normalizeLabel } from '../utils/deviceLabels';
import { logoutRemote } from '../api/auth';
import { DeviceCard } from '../components/DeviceCard';
import { DeviceDetail } from '../components/DeviceDetail';

function isDetailDevice(state: string) {
  const trimmed = (state ?? '').toString().trim();
  if (!trimmed) return false;
  const isUnavailable = trimmed.toLowerCase() === 'unavailable';
  const isNumeric = !Number.isNaN(Number(trimmed));
  return isUnavailable || isNumeric;
}

export function TenantDashboardScreen() {
  const { session, clearSession } = useSession();
  const userId = session.user?.id!;
  const [devices, setDevices] = useState<UIDevice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const isMountedRef = useRef(true);
  const [selected, setSelected] = useState<UIDevice | null>(null);
  const [headerArea, setHeaderArea] = useState<string>('Loading…');

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await fetchDevicesForUser(userId);
      if (!isMountedRef.current) return;
      setDevices(list);
      setSelected((prev) => (prev ? list.find((d) => d.entityId === prev.entityId) ?? prev : null));
      const firstArea = list.find((d) => (d.area ?? d.areaName ?? '').trim().length > 0);
      setHeaderArea(firstArea?.area ?? firstArea?.areaName ?? 'My Area');
      setError(null);
    } catch (err) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load devices';
      setError(message);
    }
  }, [userId]);

  useEffect(() => {
    void refreshDevices();
    const interval = setInterval(() => {
      void refreshDevices();
    }, 2000);
    return () => {
      clearInterval(interval);
    };
  }, [refreshDevices]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutRemote().catch(() => undefined);
    } finally {
      await clearSession();
      setLoggingOut(false);
    }
  };

  const visibleDevices = useMemo(
    () =>
      devices.filter((d) => {
        const areaName = (d.area ?? d.areaName ?? '').trim();
        const labels = Array.isArray(d.labels) ? d.labels : [];
        const hasLabel =
          normalizeLabel(d.label).length > 0 ||
          labels.some((lbl) => normalizeLabel(lbl).length > 0);
        const primary = !isDetailDevice(d.state);
        return areaName.length > 0 && hasLabel && primary;
      }),
    [devices]
  );

  const groups = useMemo(() => {
    const map = new Map<string, UIDevice[]>();
    for (const d of visibleDevices) {
      const key = getGroupLabel(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return map;
  }, [visibleDevices]);

  const sortedGroupNames = useMemo(
    () => sortLabels(Array.from(groups.keys())),
    [groups]
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await refreshDevices();
            } finally {
              setRefreshing(false);
            }
          }}
        />
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.header}>{headerArea}</Text>
        <Button
          title={loggingOut ? 'Logging out…' : 'Logout'}
          onPress={handleLogout}
          disabled={loggingOut}
        />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}

      {sortedGroupNames.map((group) => (
        <View key={group} style={styles.group}>
          <View style={styles.groupHeader}>
            <Text style={styles.groupTitle}>{group}</Text>
            {refreshing && <Text style={styles.refreshing}>Refreshing…</Text>}
          </View>
          <View style={styles.grid}>
            {groups.get(group)!.map((device) => (
              <DeviceCard
                key={device.entityId}
                device={device}
                isAdmin={false}
                onAfterCommand={refreshDevices}
                onOpenDetails={setSelected}
              />
            ))}
          </View>
        </View>
      ))}
      <DeviceDetail
        device={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
        onCommandComplete={refreshDevices}
        relatedDevices={
          selected && selected.label === 'Home Security'
            ? devices.filter((d) => d.label === 'Home Security')
            : undefined
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f7' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  header: { fontSize: 20, fontWeight: '600' },
  error: { color: 'red', marginBottom: 8 },
  group: { marginBottom: 24 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  refreshing: { fontSize: 12, color: '#9ca3af' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
