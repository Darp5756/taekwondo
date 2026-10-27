const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'tkd_token';

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* almacenamiento no disponible */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  },
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Error ${status}`);
    this.status = status;
    this.details = body?.details;
  }

  // Errores de validación indexados por campo: { nombre: 'Campo obligatorio' }
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(this.details.map((d) => [d.field, d.message]));
  }
}

export async function api(path, { method = 'GET', body, params } = {}) {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      ).toString()
    : '';
  const token = tokenStore.get();
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}/api${path}${qs}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: 'No se pudo conectar con el servidor' });
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) {
      tokenStore.clear();
      window.dispatchEvent(new Event('auth:logout'));
    }
    throw new ApiError(res.status, data);
  }
  return data;
}
