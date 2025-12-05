// src/components/DeviceCard.tsx
import React, { memo, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import type { UIDevice } from '../models/device';
import { getPrimaryLabel } from '../utils/deviceLabels';
import { handleDeviceCommand } from '../utils/haCommands';
import { useSession } from '../store/sessionStore';
import { getDevicePreset, isDeviceActive } from './deviceVisuals';

type Props = {
  device: UIDevice;
  isAdmin: boolean;
  onAfterCommand?: () => Promise<void> | void;
  onOpenDetails?: (device: UIDevice) => void;
};

export const DeviceCard = memo(function DeviceCard({ device, onAfterCommand, onOpenDetails }: Props) {
  const label = getPrimaryLabel(device);
  const { session } = useSession();
  const [pending, setPending] = useState(false);
  const ha = {
    baseUrl: session.haConnection!.baseUrl,
    longLivedToken: session.haConnection!.longLivedToken,
  };

  const primaryAction = getPrimaryAction(label, device);
  const preset = useMemo(() => getDevicePreset(label), [label]);
  const active = useMemo(() => isDeviceActive(label, device), [label, device]);
  const secondaryText = useMemo(() => getSecondaryLine(device), [device]);

  async function onPrimaryPress() {
    if (!primaryAction) return;
    if (pending) return;
    setPending(true);
    try {
      await handleDeviceCommand({
        ha,
        entityId: device.entityId,
        command: primaryAction.command,
        value: primaryAction.value,
      });
      if (onAfterCommand) await Promise.resolve(onAfterCommand());
    } catch (err) {
      console.log('device command error', err);
      Alert.alert(
        'Action failed',
        err instanceof Error ? err.message : 'Unable to send command'
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onOpenDetails && onOpenDetails(device)}
      style={[
        styles.card,
        {
          backgroundColor: active ? preset.gradient[0] : preset.inactiveBackground,
          borderColor: active ? 'rgba(0,0,0,0.08)' : '#e5e7eb',
          opacity: active ? 1 : 0.82,
        },
      ]}
    >
      <View style={styles.topRow}>
        <Text style={[styles.label, { color: active ? '#0f172a' : '#9ca3af' }]}>{label}</Text>
        <TouchableOpacity
          onPress={primaryAction ? onPrimaryPress : undefined}
          activeOpacity={0.8}
          disabled={!primaryAction || pending}
          style={[
            styles.iconButton,
            {
              backgroundColor: active ? preset.iconActiveBackground : preset.iconInactiveBackground,
              opacity: pending ? 0.6 : 1,
            },
          ]}
        >
          {pending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.icon}>{preset.icon}</Text>}
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
        <Text style={[styles.name, { color: active ? '#0f172a' : '#94a3b8' }]}>{device.name}</Text>
        <Text style={[styles.secondary, { color: active ? '#475569' : '#9ca3af' }]} numberOfLines={1}>
          {secondaryText}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

type PrimaryAction = { command: string; value?: number } | null;

function getPrimaryAction(label: string, device: UIDevice): PrimaryAction {
  switch (label) {
    case 'Light':
      return { command: 'light/toggle' };
    case 'Blind': {
      const normalized = device.state.toLowerCase();
      const isOpen = normalized === 'open' || normalized === 'opening' || normalized === 'on';
      return { command: isOpen ? 'blind/close' : 'blind/open' };
    }
    case 'Spotify':
      return { command: 'media/play_pause' };
    case 'TV':
      return { command: 'tv/toggle_power' };
    case 'Speaker':
      return { command: 'speaker/toggle_power' };
    default:
      return null;
  }
}

function getSecondaryLine(device: UIDevice): string {
  const state = (device.state ?? '').toString();
  const attrs = device.attributes ?? {};
  const label = getPrimaryLabel(device);
  if (label === 'Light') {
    const pct =
      typeof attrs.brightness_pct === 'number'
        ? Math.round(attrs.brightness_pct)
        : typeof attrs.brightness === 'number'
        ? Math.round((attrs.brightness / 255) * 100)
        : null;
    if (pct !== null) return `${pct}% brightness`;
    return state === 'on' ? 'On' : 'Off';
  }
  if (label === 'Spotify' || label === 'TV' || label === 'Speaker') {
    if (typeof attrs.media_title === 'string') {
      return attrs.media_title;
    }
    return state === 'playing' ? 'Playing' : state === 'paused' ? 'Paused' : state;
  }
  if (label === 'Boiler') {
    const target = attrs.temperature ?? attrs.target_temp;
    const current = attrs.current_temperature;
    if (typeof target === 'number' && typeof current === 'number') {
      return `Target ${target}° • Now ${current}°`;
    }
    if (typeof target === 'number') return `Target ${target}°`;
  }
  if (label === 'Blind') {
    return state || 'Idle';
  }
  if (label === 'Motion Sensor') {
    const active = ['on', 'motion', 'detected', 'open'].includes(state.toLowerCase());
    return active ? 'Motion detected' : 'No motion';
  }
  return state || 'Unknown';
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 24,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  iconButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  icon: { fontSize: 18, color: '#fff' },
  body: { marginTop: 12 },
  name: { fontSize: 16, fontWeight: '600', color: '#111827' },
  secondary: { fontSize: 12, color: '#4b5563', marginTop: 4 },
});
