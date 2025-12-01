// src/screens/AdminDashboardScreen.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useSession } from '../store/sessionStore';
import { fetchDevicesForUser } from '../api/dinodia';
import type { UIDevice } from '../models/device';
import { getGroupLabel, sortLabels, normalizeLabel } from '../utils/deviceLabels';
import { DeviceCard } from '../components/DeviceCard';

export function AdminDashboardScreen() {
  const { session } = useSession();
  const userId = session.user?.id!;
  const [devices, setDevices] = useState<UIDevice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const list = await fetchDevicesForUser(userId);
      setDevices(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleDevices = useMemo(
    () =>
      devices.filter((d) => {
        const areaName = (d.area ?? d.areaName ?? '').trim();
        const labels = Array.isArray(d.labels) ? d.labels : [];
        const hasLabel =
          normalizeLabel(d.label).length > 0 ||
          labels.some((lbl) => normalizeLabel(lbl).length > 0);
        return areaName.length > 0 && hasLabel;
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
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Text style={styles.header}>Welcome, {session.user?.username}</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {sortedGroupNames.map((group) => (
        <View key={group} style={styles.group}>
          <Text style={styles.groupTitle}>{group}</Text>
          <View style={styles.grid}>
            {groups.get(group)!.map((device) => (
              <DeviceCard key={device.entityId} device={device} isAdmin />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { fontSize: 20, fontWeight: '600', marginBottom: 16 },
  error: { color: 'red', marginBottom: 8 },
  group: { marginBottom: 24 },
  groupTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
