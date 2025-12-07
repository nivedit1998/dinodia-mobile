// src/screens/TenantDashboardScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Button, SectionList, Alert, NativeModules, TouchableOpacity } from 'react-native';
import { useSession } from '../store/sessionStore';
import type { UIDevice } from '../models/device';
import { normalizeLabel } from '../utils/deviceLabels';
import { logoutRemote } from '../api/auth';
import { DeviceCard } from '../components/DeviceCard';
import type { DeviceCardSize } from '../components/DeviceCard';
import { DeviceDetail } from '../components/DeviceDetail';
import { useDevices, clearDeviceCacheForUserAndMode } from '../store/deviceStore';
import type { HaMode } from '../api/dinodia';
import { buildDeviceSections, DeviceRow, DeviceSection } from '../utils/deviceSections';
import { getPrimaryLabel } from '../utils/deviceLabels';
import { HeaderMenu } from '../components/HeaderMenu';

const { InlineWifiSetupLauncher } = NativeModules as {
  InlineWifiSetupLauncher?: { open?: () => void };
};

function isDetailDevice(state: string) {
  const trimmed = (state ?? '').toString().trim();
  if (!trimmed) return false;
  const isUnavailable = trimmed.toLowerCase() === 'unavailable';
  const isNumeric = !Number.isNaN(Number(trimmed));
  return isUnavailable || isNumeric;
}

export function TenantDashboardScreen() {
  const { session, clearSession, haMode, setHaMode } = useSession();
  const userId = session.user?.id!;
  const { devices, refreshing, error, refreshDevices, lastUpdated } = useDevices(userId, haMode);
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selected, setSelected] = useState<UIDevice | null>(null);
  const isCloud = haMode === 'cloud';

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

  useEffect(() => {
    setSelected(null);
  }, [haMode]);

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
  const handleToggleMode = useCallback(() => {
    const nextMode: HaMode = isCloud ? 'home' : 'cloud';
    void clearDeviceCacheForUserAndMode(userId, nextMode)
      .catch(() => undefined)
      .then(() => {
        setHaMode(nextMode);
      });
  }, [isCloud, setHaMode, userId]);

  const handleOpenWifiSetup = useCallback(() => {
    if (InlineWifiSetupLauncher && typeof InlineWifiSetupLauncher.open === 'function') {
      InlineWifiSetupLauncher.open();
    } else {
      Alert.alert('Wi-Fi', 'Wi-Fi setup is not available on this device.');
    }
  }, []);

  useEffect(() => {
    // When mode changes, force a non-background refresh for the new mode.
    void refreshDevices();
  }, [haMode, refreshDevices]);

  const showRefreshingLabel = refreshing && devices.length === 0;

  const renderDeviceRow = useCallback(
    ({ item }: { item: DeviceRow }) => (
      <View style={styles.deviceRow}>
        {item.devices.map((device) => {
          const label = getPrimaryLabel(device);
          const size: DeviceCardSize = label === 'Spotify' ? 'medium' : 'small';
          return (
            <View key={device.entityId} style={styles.cardWrapper}>
              <DeviceCard
                device={device}
                isAdmin={false}
                size={size}
                onAfterCommand={handleBackgroundRefresh}
                onOpenDetails={handleOpenDetails}
              />
            </View>
          );
        })}
      </View>
    ),
    [handleBackgroundRefresh, handleOpenDetails]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: DeviceSection }) => (
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{section.title}</Text>
        {showRefreshingLabel && <Text style={styles.refreshing}>Refreshing…</Text>}
      </View>
    ),
    [showRefreshingLabel]
  );

  const isColdStart = !lastUpdated && devices.length === 0 && !error;
  const showErrorEmpty = !!error && devices.length === 0;
  const modeLabel = isCloud ? 'Cloud Mode' : 'Home Mode';

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
              <Text style={styles.header}>{`${headerArea} • ${modeLabel}`}</Text>
              <TouchableOpacity
                style={styles.menuIconButton}
                onPress={() => setMenuVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.menuIconText}>⋯</Text>
              </TouchableOpacity>
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {isColdStart
                ? 'Loading devices…'
                : showErrorEmpty
                ? 'Unable to reach devices. Please check your connection or HA URL.'
                : 'No devices available.'}
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
      <HeaderMenu
        visible={menuVisible}
        isCloud={isCloud}
        onClose={() => setMenuVisible(false)}
        onToggleMode={handleToggleMode}
        onOpenWifi={handleOpenWifiSetup}
        onLogout={handleLogout}
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
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  headerButton: { flexShrink: 0 },
  headerButtonSpacing: { marginLeft: 8 },
  header: { fontSize: 20, fontWeight: '600' },
  error: { color: 'red', marginBottom: 8 },
  menuIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
  },
  menuIconText: { fontSize: 20, color: '#111827', marginTop: -2 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  groupTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  refreshing: { fontSize: 12, color: '#9ca3af' },
  deviceRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  cardWrapper: { width: '25%', paddingHorizontal: 4, paddingVertical: 6 },
  cardPlaceholder: { width: '25%', paddingHorizontal: 4, paddingVertical: 6 },
  emptyState: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { color: '#6b7280' },
});
