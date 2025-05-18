import { QueryClient } from '@tanstack/react-query';

// Create the query client instance
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

// API request helper function
export async function apiRequest(
  method: string,
  endpoint: string,
  body?: any,
  headers?: HeadersInit
) {
  const options: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(endpoint, options);
  if (!response.ok) {
      throw new Error(await response.text());
  }
  return response.json();
}