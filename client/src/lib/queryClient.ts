import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export const getQueryFn = async ({ queryKey }: { queryKey: string[] }) => {
  const [endpoint] = queryKey;
  const response = await fetch(`/api/${endpoint}`);
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
};

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'API request failed');
  }
}

export async function apiRequest(
  method: string,
  endpoint: string,
  body?: unknown,
  headers: HeadersInit = {}
) {
  const baseUrl = import.meta.env.VITE_API_URL || '';

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(response);
  return response.json();
}