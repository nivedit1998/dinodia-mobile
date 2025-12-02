// src/components/DeviceCard.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import type { UIDevice } from '../models/device';
import { getPrimaryLabel } from '../utils/deviceLabels';
import { handleDeviceCommand } from '../utils/haCommands';
import { useSession } from '../store/sessionStore';

type Props = {
  device: UIDevice;
  isAdmin: boolean;
  onAfterCommand?: () => Promise<void> | void;
};

export function DeviceCard({ device, onAfterCommand }: Props) {
  const label = getPrimaryLabel(device);
  const area = device.area ?? device.areaName ?? '';
  const { session } = useSession();
  const ha = {
    baseUrl: session.haConnection!.baseUrl,
    longLivedToken: session.haConnection!.longLivedToken,
  };

  const primaryAction = getPrimaryAction(label, device);

  async function onPrimaryPress() {
    if (!primaryAction) return;
    try {
      await handleDeviceCommand({
        ha,
        entityId: device.entityId,
        command: primaryAction.command,
        value: primaryAction.value,
      });
      if (onAfterCommand) {
        await Promise.resolve(onAfterCommand());
      }
    } catch (err) {
      console.log('device command error', err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
          ? err
          : 'Unable to send command';
      Alert.alert('Action failed', message);
    }
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={primaryAction ? onPrimaryPress : undefined}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.name}>{device.name}</Text>
      <Text style={styles.area}>{area}</Text>
      <Text style={styles.state}>{String(device.state)}</Text>
    </TouchableOpacity>
  );
}

type PrimaryAction = { command: string; value?: number } | null;

function getPrimaryAction(label: string, device: UIDevice): PrimaryAction {
  switch (label) {
    case 'Light':
      return { command: 'light/toggle' };
    case 'Blind': {
      const normalized = device.state.toLowerCase();
      const isOpen =
        normalized === 'open' ||
        normalized === 'opening' ||
        normalized === 'on';
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

const styles = StyleSheet.create({
  card: {
    width: '47%',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    elevation: 2,
  },
  label: { fontSize: 10, textTransform: 'uppercase', color: '#666' },
  name: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  area: { fontSize: 12, color: '#666', marginTop: 2 },
  state: { fontSize: 12, color: '#999', marginTop: 4 },
});
