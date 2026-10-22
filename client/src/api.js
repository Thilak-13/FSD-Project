import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(null, (err) => {
  if (err.response?.status === 401 && !err.config.url.includes('/auth/login')) {
    localStorage.clear();
    location.href = '/login';
  }
  return Promise.reject(err);
});

export const errMsg = (e) => e.response?.data?.error || e.message;

// Authenticated file download (attachments, CSV).
export async function download(url, filename) {
  const { data } = await api.get(url, { responseType: 'blob' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(data), download: filename });
  a.click();
  URL.revokeObjectURL(a.href);
}

// GET url on mount / when url changes. Returns [data, reload, error].
export function useLoad(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const latest = useRef(0);
  // Ignore responses that arrive after a newer request (e.g. quickly changing report dates).
  const reload = useCallback(() => {
    const n = ++latest.current;
    return api.get(url).then((r) => { if (n === latest.current) { setData(r.data); setError(''); } }, (e) => n === latest.current && setError(errMsg(e)));
  }, [url]);
  useEffect(() => { reload(); }, [reload]);
  return [data, reload, error];
}

export default api;
