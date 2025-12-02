// src/config/demoData.ts
import type { AccessRule } from '../models/accessRule';
import type { UIDevice } from '../models/device';
import type { HaConnection } from '../models/haConnection';
import type { Role } from '../models/roles';

export type DemoUserRecord = {
  id: number;
  username: string;
  password: string;
  role: Role;
  haConnection: HaConnection;
  accessRules?: AccessRule[];
  devices?: UIDevice[];
};

const DEMO_HA_CONNECTION: HaConnection = {
  id: -100,
  baseUrl: 'https://demo.home-assistant.local',
  haUsername: 'demo',
  haPassword: 'demo',
  longLivedToken: 'demo-token',
  ownerId: -1,
};

const BASE_DEMO_DEVICES: UIDevice[] = [
  {
    entityId: 'light.living_room_lamp',
    name: 'Living Room Lamp',
    state: 'off',
    area: 'Living Room',
    areaName: 'Living Room',
    label: 'Lighting',
    labelCategory: 'Lighting',
    labels: ['Lighting'],
    domain: 'light',
    attributes: { brightness: 0 },
  },
  {
    entityId: 'switch.garage_fan',
    name: 'Garage Fan',
    state: 'on',
    area: 'Garage',
    areaName: 'Garage',
    label: 'HVAC',
    labelCategory: 'Climate',
    labels: ['HVAC'],
    domain: 'switch',
    attributes: { current_power_w: 75 },
  },
  {
    entityId: 'sensor.outdoor_temperature',
    name: 'Outdoor Temperature',
    state: '24',
    area: 'Outdoor',
    areaName: 'Outdoor',
    label: 'Environment',
    labelCategory: 'Sensors',
    labels: ['Environment'],
    domain: 'sensor',
    attributes: { unit_of_measurement: '°C' },
  },
];

const DEMO_USERS: DemoUserRecord[] = [
  {
    id: -1,
    username: 'admin',
    password: 'admin123',
    role: 'ADMIN',
    haConnection: DEMO_HA_CONNECTION,
    devices: BASE_DEMO_DEVICES,
  },
  {
    id: -2,
    username: 'tenant',
    password: 'tenant123',
    role: 'TENANT',
    haConnection: DEMO_HA_CONNECTION,
    accessRules: [{ id: -21, userId: -2, area: 'Living Room' }],
    devices: BASE_DEMO_DEVICES.filter(
      (device) => device.area === 'Living Room' || device.area === null
    ),
  },
];

export function getDemoUserByCredentials(username: string, password: string) {
  const normalized = username.trim().toLowerCase();
  return DEMO_USERS.find(
    (u) => u.username.toLowerCase() === normalized && u.password === password
  );
}

export function getDemoUserById(id: number) {
  return DEMO_USERS.find((u) => u.id === id);
}

export function getDemoDevicesForUser(userId: number): UIDevice[] {
  return getDemoUserById(userId)?.devices ?? [];
}

export function getDemoAccessRules(userId: number): AccessRule[] {
  return getDemoUserById(userId)?.accessRules ?? [];
}

export function hasDemoUsers(): boolean {
  return DEMO_USERS.length > 0;
}
