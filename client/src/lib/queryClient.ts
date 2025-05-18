
import { QueryClient, QueryFunction } from "@tanstack/react-query";

type UnauthorizedBehavior = "returnNull" | "throw";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || 'API request failed');
  }
}

export const getQueryFn: <T>(options: {
  on401?: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401 = "returnNull" }) =>
  async ({ queryKey: [url] }) => {
    const res = await fetch(url as string, {
      credentials: "include",
    });
    
    if (on401 === "returnNull" && res.status === 401) {
      return null;
    }
    
    await throwIfResNotOk(res);
    return await res.json();
  };

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
