// src/screens/TenantDashboardScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Button, SectionList } from 'react-native';
import { useSession } from '../store/sessionStore';
import type { UIDevice } from '../models/device';
import { normalizeLabel } from '../utils/deviceLabels';
import { logoutRemote } from '../api/auth';
import { DeviceCard } from '../components/DeviceCard';
import { DeviceDetail } from '../components/DeviceDetail';
import { useDevices } from '../store/deviceStore';
import { buildDeviceSections, DeviceRow, DeviceSection } from '../utils/deviceSections';

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
  const { devices, refreshing, error, refreshDevices, lastUpdated } = useDevices(userId);
  const [loggingOut, setLoggingOut] = useState(false);
  const [selected, setSelected] = useState<UIDevice | null>(null);

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

  useEffect(() => {
    if (!selected) return;
    const updated = devices.find((d) => d.entityId === selected.entityId);
    if (updated && updated !== selected) {
      setSelected(updated);
    }
  }, [devices, selected]);

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

  const headerArea = useMemo(() => {
    const firstArea = visibleDevices.find((d) => (d.area ?? d.areaName ?? '').trim().length > 0);
    return firstArea?.area ?? firstArea?.areaName ?? 'My Area';
  }, [visibleDevices]);

  const sections = useMemo(() => buildDeviceSections(visibleDevices), [visibleDevices]);

  const handleRefresh = useCallback(() => {
    void refreshDevices();
  }, [refreshDevices]);
  const handleBackgroundRefresh = useCallback(() => {
    void refreshDevices({ background: true });
  }, [refreshDevices]);
  const handleOpenDetails = useCallback((device: UIDevice) => setSelected(device), []);
  const handleCloseDetails = useCallback(() => setSelected(null), []);
  const handleCommandComplete = useCallback(
    () => handleBackgroundRefresh(),
    [handleBackgroundRefresh]
  );

  const renderDeviceRow = useCallback(
    ({ item }: { item: DeviceRow }) => (
      <View style={styles.deviceRow}>
        {item.devices.map((device) => (
          <View key={device.entityId} style={styles.cardWrapper}>
            <DeviceCard
              device={device}
              isAdmin={false}
              onAfterCommand={handleBackgroundRefresh}
              onOpenDetails={handleOpenDetails}
            />
          </View>
        ))}
        {item.devices.length === 1 && <View style={styles.cardPlaceholder} />}
      </View>
    ),
    [handleBackgroundRefresh, handleOpenDetails]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: DeviceSection }) => (
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{section.title}</Text>
        {refreshing && <Text style={styles.refreshing}>Refreshing…</Text>}
      </View>
    ),
    [refreshing]
  );

  const isColdStart = !lastUpdated && devices.length === 0 && !error;

  return (
    <>
      <SectionList
        style={styles.list}
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={renderDeviceRow}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            <View style={styles.headerRow}>
              <Text style={styles.header}>{headerArea}</Text>
              <Button
                title={loggingOut ? 'Logging out…' : 'Logout'}
                onPress={handleLogout}
                disabled={loggingOut}
              />
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {isColdStart ? 'Loading devices…' : 'No devices available.'}
            </Text>
          </View>
        }
        refreshing={refreshing}
        onRefresh={handleRefresh}
        stickySectionHeadersEnabled={false}
        initialNumToRender={10}
        windowSize={5}
        removeClippedSubviews
      />
      <DeviceDetail
        device={selected}
        visible={!!selected}
        onClose={handleCloseDetails}
        onCommandComplete={handleCommandComplete}
        relatedDevices={
          selected && selected.label === 'Home Security'
            ? devices.filter((d) => d.label === 'Home Security')
            : undefined
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f5f5f7' },
  listContent: { padding: 16, backgroundColor: '#f5f5f7' },
  headerContainer: { marginBottom: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  header: { fontSize: 20, fontWeight: '600' },
  error: { color: 'red', marginBottom: 8 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  groupTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  refreshing: { fontSize: 12, color: '#9ca3af' },
  deviceRow: { flexDirection: 'row', marginBottom: 12 },
  cardWrapper: { flex: 1, marginRight: 8 },
  cardPlaceholder: { flex: 1, marginRight: 8 },
  emptyState: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { color: '#6b7280' },
});
