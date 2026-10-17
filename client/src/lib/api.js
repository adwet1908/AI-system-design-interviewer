const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function apiFetch(path, { token, ...options } = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  return res;
}

export async function apiJson(path, { token, ...options } = {}) {
  const res = await apiFetch(path, { token, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export { API_URL };
