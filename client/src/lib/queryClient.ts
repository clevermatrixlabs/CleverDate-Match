
import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'API request failed');
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      queryFn: getQueryFn({ on401: "throw" }),
    },
    mutations: {
      retry: false,
    },
  },
});

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401?: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401 = "returnNull" }) =>
  async ({ queryKey: [url] }) => {
    const res = await fetch(url as string, {
      credentials: "include",
    });
    await throwIfResNotOk(res);
    return await res.json();
  };

export async function apiRequest(
  method: string,
  endpoint: string,
  data?: any,
  headers: HeadersInit = {}
) {
  const baseUrl = import.meta.env.VITE_API_URL || '';

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
    ...(data ? { body: JSON.stringify(data) } : {}),
  });

  return response;
}
