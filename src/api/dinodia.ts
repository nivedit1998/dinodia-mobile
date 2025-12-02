// src/api/dinodia.ts
import { supabase } from './supabaseClient';
import type { User } from '../models/user';
import type { Role } from '../models/roles';
import type { HaConnection, HaConnection as HaConnectionModel } from '../models/haConnection';
import type { AccessRule } from '../models/accessRule';
import type { UIDevice, DeviceOverride } from '../models/device';
import { getDevicesWithMetadata, EnrichedDevice, HaConnectionLike } from './ha';
import { classifyDeviceByLabel } from '../utils/labelCatalog';

type MaybeArray<T> = T | T[] | null | undefined;

type UserWithRelations = User & {
  haConnection?: MaybeArray<HaConnectionModel>;
  ownedHaConnection?: MaybeArray<HaConnectionModel>;
  accessRules?: AccessRule[];
};

const firstOrNull = <T>(value: MaybeArray<T>): T | null => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0]! : null;
  }
  return value ?? null;
};

async function fetchUserWithRelations(userId: number): Promise<UserWithRelations | null> {
  const { data, error } = await supabase
    .from('User')
    .select(
      `
      id,
      username,
      role,
      haConnectionId,
      haConnection:HaConnection!AssignedHaConnection(*),
      ownedHaConnection:HaConnection!OwnedHaConnection(*),
      accessRules:AccessRule(*)
    `
    )
    .eq('id', userId)
    .single();

  if (error) throw error;
  return (data ?? null) as UserWithRelations | null;
}

// This mimics src/lib/haConnection.getUserWithHaConnection
export async function getUserWithHaConnection(
  userId: number
): Promise<{ user: UserWithRelations; haConnection: HaConnection }> {
  let user = await fetchUserWithRelations(userId);
  if (!user) throw new Error('User not found');

  let haConnection =
    (firstOrNull(user.haConnection) ||
      firstOrNull(user.ownedHaConnection)) as HaConnection | null;

  if (!haConnection && user.haConnectionId) {
    const { data, error } = await supabase
      .from('HaConnection')
      .select('*')
      .eq('id', user.haConnectionId)
      .single();
    if (error) throw error;
    haConnection = data as HaConnection;
  }

  if (!haConnection && user.role === 'TENANT') {
    // Find any admin with a connection
    const { data: admins, error } = await supabase
      .from('User')
      .select(
        `
        id,
        haConnectionId,
        ownedHaConnection:HaConnection!OwnedHaConnection (id)
      `
      )
      .eq('role', 'ADMIN')
      .limit(1);
    if (error) throw error;

    type AdminRow = {
      id: number;
      haConnectionId: number | null;
      ownedHaConnection: MaybeArray<{ id: number }>;
    };
    const admin = admins?.[0] as AdminRow | undefined;
    const adminOwned = firstOrNull(admin?.ownedHaConnection);
    const adminHaConnectionId = admin?.haConnectionId ?? adminOwned?.id ?? null;

    if (admin && !admin.haConnectionId && adminHaConnectionId) {
      await supabase
        .from('User')
        .update({ haConnectionId: adminHaConnectionId })
        .eq('id', admin.id);
    }

    if (adminHaConnectionId) {
      await supabase
        .from('User')
        .update({ haConnectionId: adminHaConnectionId })
        .eq('id', user.id);

      const { data: ha, error: errHa } = await supabase
        .from('HaConnection')
        .select('*')
        .eq('id', adminHaConnectionId)
        .single();
      if (errHa) throw errHa;

      haConnection = ha as HaConnection;
      user = (await fetchUserWithRelations(userId))!;
    }
  }

  if (!user || !haConnection) {
    throw new Error('HA connection not configured');
  }

  return { user, haConnection };
}

export async function fetchDevicesForUser(userId: number): Promise<UIDevice[]> {
  const { user, haConnection } = await getUserWithHaConnection(userId);
  const haLike: HaConnectionLike = {
    baseUrl: haConnection.baseUrl,
    longLivedToken: haConnection.longLivedToken,
  };

  // 1) Fetch devices from HA
  let enriched: EnrichedDevice[] = [];
  try {
    enriched = await getDevicesWithMetadata(haLike);
  } catch (err) {
    console.error('Failed to fetch devices from HA:', err);
    throw new Error('Failed to fetch HA devices');
  }

  // 2) Load overrides
  const { data: dbDevices, error } = await supabase
    .from('Device')
    .select('*')
    .eq('haConnectionId', haConnection.id);
  if (error) throw error;

  const overrideMap = new Map<string, DeviceOverride>();
  (dbDevices ?? []).forEach((d: any) => {
    overrideMap.set(d.entityId, d as DeviceOverride);
  });

  // 3) Apply overrides and shape
  const devices: UIDevice[] = enriched.map((d) => {
    const override = overrideMap.get(d.entityId);
    const name = override?.name ?? d.name;
    const areaName = override?.area ?? d.areaName ?? null;
    const labels = override?.label ? [override.label] : d.labels;
    const labelCategory =
      classifyDeviceByLabel(labels) ?? d.labelCategory ?? null;
    const primaryLabel =
      labels.length > 0 && labels[0] ? String(labels[0]) : null;
    const label = override?.label ?? primaryLabel ?? labelCategory ?? null;

    return {
      entityId: d.entityId,
      name,
      state: d.state,
      area: areaName,
      areaName,
      labels,
      label,
      labelCategory,
      domain: d.domain,
      attributes: d.attributes ?? {},
    };
  });

  // 4) Tenant filtering by AccessRule
  if (user.role === 'TENANT') {
    const rules = (user.accessRules ?? []) as AccessRule[];
    const result = devices.filter(
      (d) =>
        d.areaName !== null && rules.some((r) => r.area === d.areaName)
    );
    return result;
  }

  return devices;
}

export async function updateDeviceOverride(params: {
  adminId: number;
  entityId: string;
  name: string;
  area: string;
  label: string;
}): Promise<void> {
  const { haConnection } = await getUserWithHaConnection(params.adminId);

  const cleanArea = params.area.trim() === '' ? null : params.area.trim();
  const cleanLabel = params.label.trim() === '' ? null : params.label.trim();

  const { error } = await supabase.from('Device').upsert(
    {
      haConnectionId: haConnection.id,
      entityId: params.entityId,
      name: params.name,
      area: cleanArea,
      label: cleanLabel,
    },
    {
      onConflict: 'haConnectionId,entityId',
    } as any
  );
  if (error) throw error;
}

export async function createTenant(params: {
  adminId: number;
  username: string;
  passwordHash: string; // You will hash server-side if you expose a secure endpoint
  area: string;
}): Promise<void> {
  const { haConnection } = await getUserWithHaConnection(params.adminId);

  // In practice, you should not send `passwordHash` from the client; instead call a secure endpoint.
  const { data: tenant, error } = await supabase
    .from('User')
    .insert({
      username: params.username,
      passwordHash: params.passwordHash,
      role: 'TENANT',
      haConnectionId: haConnection.id,
    })
    .select('id')
    .single();

  if (error) throw error;

  const tenantId = (tenant as { id: number }).id;
  const { error: errAccess } = await supabase
    .from('AccessRule')
    .insert({
      userId: tenantId,
      area: params.area,
    });

  if (errAccess) throw errAccess;
}

export async function updateHaSettings(params: {
  adminId: number;
  haUsername: string;
  haBaseUrl: string;
  haPassword?: string;
  haLongLivedToken?: string;
}): Promise<HaConnection> {
  const { haConnection } = await getUserWithHaConnection(params.adminId);
  const normalizedBaseUrl = normalizeHaBaseUrl(params.haBaseUrl);

  const updateData: Partial<HaConnection> = {
    haUsername: params.haUsername.trim(),
    baseUrl: normalizedBaseUrl,
  };
  if (params.haPassword && params.haPassword.length > 0) {
    (updateData as any).haPassword = params.haPassword;
  }
  if (params.haLongLivedToken && params.haLongLivedToken.length > 0) {
    (updateData as any).longLivedToken = params.haLongLivedToken;
  }

  const { data, error } = await supabase
    .from('HaConnection')
    .update(updateData)
    .eq('id', haConnection.id)
    .select('*')
    .single();
  if (error) throw error;

  return data as HaConnection;
}

function normalizeHaBaseUrl(value: string): string {
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid HA base URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('HA base URL must start with http:// or https://');
  }
  return trimmed.replace(/\/+$/, '');
}
