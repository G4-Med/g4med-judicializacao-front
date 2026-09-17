import { DEFAULT_GROUP, type UserGroup, normalizeGroupName } from './permissions';

export interface AuthProfile {
  username: string;
  group: UserGroup;
  rawGroup: string;
  linkedMedicoIds: number[];
  isSuperuser: boolean;
}

const AUTH_PROFILE_KEY = 'auth_profile';

function parseJsonSafe<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const decoded = atob(normalized + padding);
  try {
    return decodeURIComponent(
      decoded
        .split('')
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
  } catch {
    return decoded;
  }
}

function decodeJwtPayload(token: string | null): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    return JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstValidString(values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      const nestedName = extractString(nested.name ?? nested.group_name ?? nested.role ?? nested.perfil);
      if (nestedName) return nestedName;
    }
    if (Array.isArray(value)) {
      const nestedArrayValue = firstValidString(value);
      if (nestedArrayValue) return nestedArrayValue;
    }
  }

  return '';
}

function extractLinkedMedicoIds(values: unknown[]): number[] {
  const ids = new Set<number>();

  const pushValue = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      ids.add(value);
      return;
    }

    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
      ids.add(Number(value));
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(pushValue);
      return;
    }

    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      pushValue(nested.id ?? nested.medico_id ?? nested.medicoId);
    }
  };

  values.forEach(pushValue);
  return Array.from(ids);
}

function buildProfileFromSources(
  source?: Record<string, unknown> | null,
  options?: { useStoredFallback?: boolean }
): AuthProfile {
  const useStoredFallback = options?.useStoredFallback ?? true;
  const tokenPayload = decodeJwtPayload(localStorage.getItem('access_token'));
  const localProfile = useStoredFallback
    ? parseJsonSafe<Partial<AuthProfile>>(localStorage.getItem(AUTH_PROFILE_KEY))
    : null;

  const rawGroup =
    firstValidString([
      source?.group_name,
      source?.group,
      source?.role,
      source?.perfil,
      source?.groups,
      source?.user_group,
      tokenPayload?.group_name,
      tokenPayload?.group,
      tokenPayload?.role,
      tokenPayload?.perfil,
      tokenPayload?.groups,
      tokenPayload?.user_group,
      ...(useStoredFallback
        ? [
            localProfile?.rawGroup,
            localStorage.getItem('user_group'),
            localStorage.getItem('group_name'),
          ]
        : []),
    ]) || DEFAULT_GROUP;

  const normalizedGroup = normalizeGroupName(rawGroup) ?? DEFAULT_GROUP;
  const isSuperuser = Boolean(
    source?.is_superuser ??
      tokenPayload?.is_superuser ??
      localProfile?.isSuperuser
  );

  return {
    username:
      extractString(source?.username) ||
      extractString(tokenPayload?.username) ||
      extractString(tokenPayload?.user_name) ||
      extractString(tokenPayload?.preferred_username) ||
      extractString(localProfile?.username) ||
      '',
    group: isSuperuser ? 'ADMIN' : normalizedGroup,
    rawGroup,
    linkedMedicoIds: extractLinkedMedicoIds([
      source?.medico_ids,
      source?.medicos,
      source?.linked_medicos,
      source?.medico_id,
      tokenPayload?.medico_ids,
      tokenPayload?.medicos,
      tokenPayload?.linked_medicos,
      tokenPayload?.medico_id,
      ...(useStoredFallback
        ? [localProfile?.linkedMedicoIds, parseJsonSafe(localStorage.getItem('linked_medico_ids'))]
        : []),
    ]),
    isSuperuser,
  };
}

export function persistAuthProfile(source?: Record<string, unknown> | null) {
  const profile = buildProfileFromSources(source, { useStoredFallback: false });
  localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export function readAuthProfile() {
  return buildProfileFromSources();
}

export function clearAuthProfile() {
  localStorage.removeItem(AUTH_PROFILE_KEY);
  localStorage.removeItem('user_group');
  localStorage.removeItem('group_name');
  localStorage.removeItem('linked_medico_ids');
}
