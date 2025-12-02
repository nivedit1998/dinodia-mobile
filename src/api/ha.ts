// src/api/ha.ts
import { classifyDeviceByLabel, LabelCategory } from '../utils/labelCatalog';

export type HaConnectionLike = {
  baseUrl: string;
  longLivedToken: string;
};

export type HAState = {
  entity_id: string;
  state: string;
  attributes: {
    friendly_name?: string;
    [key: string]: unknown;
  };
};

export type TemplateDeviceMeta = {
  entity_id: string;
  area_name: string | null;
  labels: string[];
};

export type EnrichedDevice = {
  entityId: string;
  name: string;
  state: string;
  areaName: string | null;
  labels: string[];
  labelCategory: LabelCategory | null;
  domain: string;
  attributes: Record<string, unknown>;
};

function buildHaUrl(baseUrl: string, path: string): string {
  if (path.startsWith('/')) {
    return `${baseUrl}${path}`;
  }
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  return `${normalizedBase}/${path}`;
}

function describeNetworkFailure(baseUrl: string, path: string, err: unknown): Error {
  const url = buildHaUrl(baseUrl, path);
  const original = err instanceof Error ? err.message : String(err);
  const hints: string[] = [];
  try {
    const parsed = new URL(baseUrl);
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith('.local')) {
      hints.push(
        'Android devices often cannot resolve .local hostnames. Update the HA URL to use the IP address (e.g., http://192.168.1.10:8123) in the Admin settings.'
      );
    }
    if (parsed.protocol === 'http:') {
      hints.push(
        'Ensure your device is on the same LAN as Home Assistant and that cleartext HTTP traffic is allowed.'
      );
    }
  } catch {
    // ignore parsing issues; baseUrl should already be valid
  }
  const hintText = hints.length > 0 ? ` ${hints.join(' ')}` : '';
  return new Error(`HA network error while calling ${url}: ${original}.${hintText}`);
}

async function callHomeAssistantAPI<T>(
  ha: HaConnectionLike,
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = buildHaUrl(ha.baseUrl, path);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${ha.longLivedToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
  } catch (err) {
    throw describeNetworkFailure(ha.baseUrl, path, err);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HA API error ${res.status} at ${url}: ${text}`);
  }
  return (await res.json()) as T;
}

async function renderHomeAssistantTemplate<T>(
  ha: HaConnectionLike,
  template: string
): Promise<T> {
  const path = '/api/template';
  const url = buildHaUrl(ha.baseUrl, path);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ha.longLivedToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ template }),
    });
  } catch (err) {
    throw describeNetworkFailure(ha.baseUrl, path, err);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HA template error ${res.status} at ${url}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function getDevicesWithMetadata(
  ha: HaConnectionLike
): Promise<EnrichedDevice[]> {
  const states = await callHomeAssistantAPI<HAState[]>(ha, '/api/states');

  const template = `{% set ns = namespace(result=[]) %}
{% for s in states %}
  {% set item = {
    "entity_id": s.entity_id,
    "area_name": area_name(s.entity_id),
    "labels": (labels(s.entity_id) | map('label_name') | list)
  } %}
  {% set ns.result = ns.result + [item] %}
{% endfor %}
{{ ns.result | tojson }}`;

  let meta: TemplateDeviceMeta[] = [];
  try {
    meta = await renderHomeAssistantTemplate<TemplateDeviceMeta[]>(ha, template);
  } catch {
    meta = [];
  }

  const metaByEntity = new Map<string, TemplateDeviceMeta>();
  for (const m of meta) {
    metaByEntity.set(m.entity_id, m);
  }

  return states.map((s) => {
    const domain = s.entity_id.split('.')[0] || '';
    const metaEntry = metaByEntity.get(s.entity_id);
    const labels = (metaEntry?.labels ?? []).filter(
      (label): label is string =>
        typeof label === 'string' && label.trim().length > 0
    );
    const labelCategory =
      classifyDeviceByLabel(labels) ?? classifyDeviceByLabel([domain]);

    return {
      entityId: s.entity_id,
      name: s.attributes.friendly_name ?? s.entity_id,
      state: s.state,
      areaName: metaEntry?.area_name ?? null,
      labels,
      labelCategory,
      domain,
      attributes: s.attributes ?? {},
    };
  });
}

export async function callHaService(
  ha: HaConnectionLike,
  domain: string,
  service: string,
  data: Record<string, unknown> = {}
) {
  const path = `/api/services/${domain}/${service}`;
  const url = buildHaUrl(ha.baseUrl, path);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ha.longLivedToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch (err) {
    throw describeNetworkFailure(ha.baseUrl, path, err);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HA service error ${res.status} at ${url}: ${text}`);
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchHaState(
  ha: HaConnectionLike,
  entityId: string
): Promise<HAState> {
  return callHomeAssistantAPI<HAState>(ha, `/api/states/${entityId}`);
}
