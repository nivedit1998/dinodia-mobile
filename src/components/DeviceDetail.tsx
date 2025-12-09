// src/components/DeviceDetail.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import type { UIDevice } from '../models/device';
import { getPrimaryLabel } from '../utils/deviceLabels';
import { handleDeviceCommand } from '../utils/haCommands';
import { useSession } from '../store/sessionStore';
import { getDevicePreset, isDeviceActive } from './deviceVisuals';

type Props = {
  device: UIDevice | null;
  visible: boolean;
  onClose: () => void;
  onCommandComplete?: () => void | Promise<void>;
  relatedDevices?: UIDevice[];
  linkedSensors?: UIDevice[];
};

export function DeviceDetail({
  device,
  visible,
  onClose,
  onCommandComplete,
  relatedDevices,
  linkedSensors,
}: Props) {
  const { session, haMode } = useSession();
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [cameraRefreshToken, setCameraRefreshToken] = useState<number>(Date.now());

  const label = device ? getPrimaryLabel(device) : null;
  const preset = useMemo(() => getDevicePreset(label), [label]);
  const active = device ? isDeviceActive(label, device) : false;
  const area = device?.area ?? device?.areaName ?? '';
  const sensors = linkedSensors ?? [];

  const connection = session.haConnection;

  const ha = device && connection
    ? (() => {
        const rawUrl =
          haMode === 'cloud' ? connection.cloudUrl ?? '' : connection.baseUrl ?? '';
        const cleaned = rawUrl.trim().replace(/\/+$/, '');
        if (!cleaned) return null;
        return { baseUrl: cleaned, longLivedToken: connection.longLivedToken };
      })()
    : null;

  useEffect(() => {
    if (label === 'Doorbell' || label === 'Home Security') {
      const id = setInterval(() => setCameraRefreshToken(Date.now()), 15000);
      return () => clearInterval(id);
    }
    return;
  }, [label]);

  const buildCameraUrl = (entityId: string) =>
    ha
      ? `${ha.baseUrl}/api/camera_proxy/${encodeURIComponent(entityId)}?token=${encodeURIComponent(
          ha.longLivedToken
        )}&ts=${cameraRefreshToken}`
      : '';

  async function sendCommand(command: string, value?: number) {
    if (!device) return;
    if (!ha) {
      Alert.alert(
        'Unavailable',
        haMode === 'cloud'
          ? 'Cloud control is not configured for this home.'
          : 'Local Home Assistant connection is not available.'
      );
      return;
    }
    if (pendingCommand) return;
    setPendingCommand(command);
    try {
      await handleDeviceCommand({ ha, entityId: device.entityId, command, value });
      if (onCommandComplete) await Promise.resolve(onCommandComplete());
    } catch (err) {
      console.log('device detail command error', err);
    } finally {
      setPendingCommand(null);
    }
  }

  const attrs = device?.attributes ?? {};
  const brightnessPct = getBrightnessPct(attrs);
  const volumePct = getVolumePct(attrs);
  const secondary = device ? getSecondaryLine(device) : '';

  const headerBg = active ? preset.accent[0] : '#e5e7eb';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View />
      </Pressable>
      <View style={styles.sheet}>
        <View style={styles.handleBarWrapper}>
          <View style={styles.handleBar} />
        </View>
        <View style={[styles.header, { backgroundColor: headerBg }]}>
          <View>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.title}>{device?.name ?? ''}</Text>
            <Text style={styles.subtitle}>{area || 'Unassigned area'}</Text>
            <Text style={styles.secondary}>{secondary}</Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: preset.iconActiveBackground }]}>
            <Text style={styles.headerIconText}>{preset.icon}</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {device &&
            renderControls({
              device,
              label,
              brightnessPct,
              volumePct,
              pendingCommand,
              onCommand: sendCommand,
              cameraUrlBuilder: buildCameraUrl,
              relatedDevices,
            })}
          {device && sensors.length > 0 && renderLinkedSensors(sensors)}
        </ScrollView>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function renderControls(opts: {
  device: UIDevice;
  label: string | null;
  brightnessPct: number | null;
  volumePct: number | null;
  pendingCommand: string | null;
  onCommand: (command: string, value?: number) => Promise<void>;
  cameraUrlBuilder: (entityId: string) => string;
  relatedDevices?: UIDevice[];
}) {
  const {
    device,
    label,
    brightnessPct,
    volumePct,
    pendingCommand,
    onCommand,
    cameraUrlBuilder,
    relatedDevices,
  } = opts;
  const state = (device.state ?? '').toString();
  const attrs = device.attributes ?? {};

  switch (label) {
    case 'Light':
      return (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => onCommand('light/toggle')}
            disabled={!!pendingCommand}
          >
            <Text style={styles.primaryButtonText}>
              {state === 'on' ? 'Turn off' : 'Turn on'}
            </Text>
          </TouchableOpacity>
          {brightnessPct !== null && (
            <View style={styles.sliderBlock}>
              <Text style={styles.sliderLabel}>Brightness {brightnessPct}%</Text>
              <Slider
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={brightnessPct}
                onSlidingComplete={(val) => {
                  onCommand('light/set_brightness', val);
                }}
                minimumTrackTintColor="#f59e0b"
                maximumTrackTintColor="#e5e7eb"
                thumbTintColor="#f59e0b"
              />
            </View>
          )}
        </View>
      );
    case 'Blind':
      return (
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.secondaryButton, styles.buttonAlt]}
            onPress={() => onCommand('blind/open')}
            disabled={!!pendingCommand}
          >
            <Text style={styles.secondaryButtonText}>Open</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, styles.buttonAlt]}
            onPress={() => onCommand('blind/close')}
            disabled={!!pendingCommand}
          >
            <Text style={styles.secondaryButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    case 'Spotify':
      return (
        <View style={styles.section}>
          {typeof attrs.entity_picture === 'string' && attrs.entity_picture.length > 0 && (
            <Image source={{ uri: attrs.entity_picture }} style={styles.artwork} />
          )}
          <Text style={styles.titleSm}>{String(attrs.media_title ?? 'Track')}</Text>
          <Text style={styles.subtitleSm}>{attrs.media_artist ? String(attrs.media_artist) : ''}</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => onCommand('media/previous')}
              disabled={!!pendingCommand}
            >
              <Text style={styles.secondaryButtonText}>Prev</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => onCommand('media/play_pause')}
              disabled={!!pendingCommand}
            >
              <Text style={styles.primaryButtonText}>
                {state === 'playing' ? 'Pause' : 'Play'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => onCommand('media/next')}
              disabled={!!pendingCommand}
            >
              <Text style={styles.secondaryButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    case 'TV':
    case 'Speaker':
      return (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() =>
              onCommand(label === 'TV' ? 'tv/toggle_power' : 'speaker/toggle_power')
            }
            disabled={!!pendingCommand}
          >
            <Text style={styles.primaryButtonText}>
              {state === 'on' ? 'Power off' : 'Power on'}
            </Text>
          </TouchableOpacity>
          {volumePct !== null && (
            <View style={styles.sliderBlock}>
              <Text style={styles.sliderLabel}>Volume {volumePct}%</Text>
              <Slider
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={volumePct}
                onSlidingComplete={(val) => {
                  onCommand('media/volume_set', val);
                }}
                minimumTrackTintColor="#4f46e5"
                maximumTrackTintColor="#e5e7eb"
                thumbTintColor="#4f46e5"
              />
            </View>
          )}
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => onCommand('media/volume_down')}
              disabled={!!pendingCommand}
            >
              <Text style={styles.secondaryButtonText}>Volume -</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => onCommand('media/volume_up')}
              disabled={!!pendingCommand}
            >
              <Text style={styles.secondaryButtonText}>Volume +</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    case 'Boiler': {
      const target = attrs.temperature ?? attrs.target_temp;
      const current = attrs.current_temperature;
      return (
        <View style={styles.section}>
          <Text style={styles.titleSm}>
            Target: {typeof target === 'number' ? target : '—'}°
          </Text>
          <Text style={styles.subtitleSm}>
            Current: {typeof current === 'number' ? current : '—'}°
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => onCommand('boiler/temp_down')}
              disabled={!!pendingCommand}
            >
              <Text style={styles.secondaryButtonText}>-</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => onCommand('boiler/temp_up')}
              disabled={!!pendingCommand}
            >
              <Text style={styles.secondaryButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    case 'Motion Sensor': {
      const activeMotion = ['on', 'motion', 'detected', 'open'].includes(state.toLowerCase());
      return (
        <View style={styles.section}>
          <View
            style={[
              styles.motionBadge,
              { backgroundColor: activeMotion ? '#10b981' : '#d1d5db' },
            ]}
          >
            <Text style={styles.motionText}>
              {activeMotion ? 'Motion detected' : 'No motion'}
            </Text>
          </View>
        </View>
      );
    }
    case 'Doorbell': {
      const url = cameraUrlBuilder(device.entityId);
      return (
        <View style={styles.section}>
          <View style={styles.cameraCard}>
            <Image source={{ uri: url }} style={styles.cameraImage} resizeMode="cover" />
          </View>
        </View>
      );
    }
    case 'Home Security': {
      const cams = relatedDevices ?? [];
      if (!cams.length) {
        return (
          <View style={styles.section}>
            <Text style={styles.secondary}>No cameras available.</Text>
          </View>
        );
      }
      return (
        <View style={styles.section}>
          <View style={styles.cameraGrid}>
            {cams.map((cam) => (
              <View key={cam.entityId} style={styles.cameraTile}>
                <Image
                  source={{ uri: cameraUrlBuilder(cam.entityId) }}
                  style={styles.cameraThumb}
                  resizeMode="cover"
                />
                <Text style={styles.cameraName} numberOfLines={1}>
                  {cam.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      );
    }
    default:
      return (
        <View style={styles.section}>
          <Text style={styles.secondary}>No interactive controls available.</Text>
        </View>
      );
  }
}

function renderLinkedSensors(sensors: UIDevice[]) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>Linked sensors</Text>
      <View style={styles.sensorList}>
        {sensors.map((sensor) => (
          <View key={sensor.entityId} style={styles.sensorRow}>
            <View style={styles.sensorDot} />
            <View style={styles.sensorTextGroup}>
              <Text style={styles.sensorName} numberOfLines={1}>
                {sensor.name}
              </Text>
              <Text style={styles.sensorValue}>{formatSensorValue(sensor)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function getBrightnessPct(attrs: Record<string, any>): number | null {
  if (typeof attrs.brightness_pct === 'number') return Math.round(attrs.brightness_pct);
  if (typeof attrs.brightness === 'number') return Math.round((attrs.brightness / 255) * 100);
  return null;
}

function getVolumePct(attrs: Record<string, any>): number | null {
  if (typeof attrs.volume_level === 'number') return Math.round(attrs.volume_level * 100);
  return null;
}

function getSecondaryLine(device: UIDevice): string {
  const state = (device.state ?? '').toString();
  const attrs = device.attributes ?? {};
  const label = getPrimaryLabel(device);
  if (label === 'Light') {
    const pct = getBrightnessPct(attrs);
    if (pct !== null) return `${pct}% brightness`;
    return state === 'on' ? 'On' : 'Off';
  }
  if (label === 'Spotify' || label === 'TV' || label === 'Speaker') {
    if (typeof attrs.media_title === 'string') return attrs.media_title;
    return state === 'playing' ? 'Playing' : state === 'paused' ? 'Paused' : state;
  }
  return state;
}

function formatSensorValue(sensor: UIDevice): string {
  const state = (sensor.state ?? '').toString();
  const attrs = sensor.attributes ?? {};
  const unit =
    attrs && typeof (attrs as Record<string, unknown>).unit_of_measurement === 'string'
      ? String((attrs as Record<string, unknown>).unit_of_measurement)
      : '';
  if (!state) return '—';
  if (state.toLowerCase() === 'unavailable') return 'Unavailable';
  if (unit) return `${state} ${unit}`.trim();
  return state.charAt(0).toUpperCase() + state.slice(1);
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    position: 'absolute',
    top: 80,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#f9fafb',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  handleBarWrapper: {
    paddingTop: 8,
    alignItems: 'center',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#6b7280' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', marginTop: 2 },
  subtitle: { fontSize: 13, color: '#4b5563', marginTop: 4 },
  secondary: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: { fontSize: 22, color: '#fff' },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  section: { marginBottom: 18 },
  sectionHeading: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 10 },
  row: { flexDirection: 'row', columnGap: 10 },
  primaryButton: {
    backgroundColor: '#111827',
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#e5e7eb',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonAlt: { backgroundColor: '#eef2ff' },
  secondaryButtonText: { color: '#111827', fontSize: 14, fontWeight: '600' },
  sliderBlock: { marginTop: 12 },
  sliderLabel: { fontSize: 13, color: '#111827', marginBottom: 6 },
  titleSm: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 8 },
  subtitleSm: { fontSize: 13, color: '#4b5563', marginTop: 4 },
  artwork: {
    width: '100%',
    height: 170,
    borderRadius: 18,
    marginBottom: 12,
    backgroundColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  motionBadge: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  motionText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sensorList: { gap: 8 },
  sensorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  sensorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#60a5fa',
    marginRight: 12,
  },
  sensorTextGroup: { flex: 1 },
  sensorName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  sensorValue: { fontSize: 12, color: '#4b5563', marginTop: 2 },
  closeBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  closeText: { fontSize: 15, color: '#111827', fontWeight: '600' },
  cameraCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  cameraImage: { width: '100%', height: 240, backgroundColor: '#f3f4f6' },
  cameraGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  cameraTile: {
    width: '48%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    overflow: 'hidden',
    marginBottom: 10,
  },
  cameraThumb: { width: '100%', height: 140, backgroundColor: '#f3f4f6' },
  cameraName: { padding: 8, fontSize: 12, color: '#111827' },
});
