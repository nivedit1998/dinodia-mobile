// src/utils/deviceSections.ts
import type { UIDevice } from '../models/device';
import { getGroupLabel, sortLabels } from './deviceLabels';

export type DeviceRow = {
  key: string;
  devices: UIDevice[];
};

export type DeviceSection = {
  title: string;
  data: DeviceRow[];
};

export function buildDeviceSections(devices: UIDevice[]): DeviceSection[] {
  const groups = new Map<string, UIDevice[]>();

  for (const device of devices) {
    const label = getGroupLabel(device);
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(device);
  }

  const sections: DeviceSection[] = [];
  const sortedLabels = sortLabels(Array.from(groups.keys()));

  for (const label of sortedLabels) {
    const list = groups.get(label) ?? [];
    if (list.length === 0) continue;

    const rows: DeviceRow[] = [];
    for (let i = 0; i < list.length; i += 4) {
      const slice = list.slice(i, i + 4);
      const rowKey = `${label}-${slice.map((d) => d.entityId).join('|')}`;
      rows.push({ key: rowKey, devices: slice });
    }

    sections.push({ title: label, data: rows });
  }

  return sections;
}
