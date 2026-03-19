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

// Core API request helper — all calls go through Express, not Supabase directly
export const apiRequest = async (method: string, endpoint: string, data?: any) => {
  const response = await fetch(`/api${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data !== undefined ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = isJson ? (body as any).message : body;
    throw new Error(message || `Request failed (${response.status})`);
  }

  return body;
};
