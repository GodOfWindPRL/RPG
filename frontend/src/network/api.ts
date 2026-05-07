import type { Character } from '../core/types';

const API_BASE = '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error(
        response.ok
          ? 'Server returned invalid JSON'
          : `Request failed (${response.status}). Response was not JSON.`,
      );
    }
  }

  if (!response.ok) {
    const errMsg =
      parsed && typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new Error(errMsg);
  }

  if (parsed === undefined) {
    throw new Error(
      'Empty response from server. Start the backend (e.g. port 4000) and use dev server proxy, or check the API URL.',
    );
  }

  return parsed as T;
}

export function register(email: string, password: string) {
  return request<{ token: string; user: { id: string; email: string } }>('/api/rpg/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string) {
  return request<{ token: string; user: { id: string; email: string } }>('/api/rpg/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function listCharacters(token: string) {
  return request<Character[]>('/api/rpg/player/characters', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createCharacter(token: string, name: string, className: string) {
  return request('/api/rpg/player/characters', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, className }),
  });
}

export function bootstrap(token: string, characterId: string) {
  return request(`/api/rpg/game/bootstrap/${characterId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function allocateStat(token: string, characterId: string, stat: 'str' | 'agi' | 'vit' | 'mag') {
  return request<{ character: Character }>('/api/rpg/game/stats/allocate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ characterId, stat }),
  });
}


export function resetCharacter(token: string, characterId: string) {
  return request<{ character: Character; skills: any[]; inventoryItems: any[] }>(
    '/api/rpg/game/character/reset',
    {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ characterId }),
    },
  );
}
