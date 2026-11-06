import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Core API request helper — all calls go through Express backend
export const apiRequest = async (method: string, endpoint: string, data?: any) => {
  const url = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  try {
    const { auth } = await import('@/lib/firebase');
    const token = await auth?.currentUser?.getIdToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {}

  // Also attach stored session user identity token if present
  try {
    const storedUser = localStorage.getItem('cleverdate_user');
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      if (parsed?.id) headers['X-User-Id'] = String(parsed.id);
      if (parsed?.email) headers['X-User-Email'] = parsed.email;
    }
  } catch {}

  const response = await fetch(url, {
    method,
    headers,
    body: data !== undefined ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    let message = isJson ? (body as any)?.message : '';
    if (!message && typeof body === 'string') {
      const clean = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      message = clean || `Request failed (${response.status})`;
    }
    throw new Error(message || `Request failed (${response.status})`);
  }

  return body;
};
