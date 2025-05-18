
import { createClient } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';

// Create and export the query client instance
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Create the Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

// API request helper function
export const apiRequest = async (method: string, endpoint: string, data?: any) => {
  const response = await fetch(`/api${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'API request failed');
  }

  return response.json();
};

// Query functions
export const verifyEmailCode = async (code: string) => {
  return apiRequest('POST', '/verify/email', { code });
};

export const verifyPhoneCode = async (code: string) => {
  return apiRequest('POST', '/verify/phone', { code });
};

export const login = async (credentials: any) => {
  return apiRequest('POST', '/auth/login', credentials);
};

export const signup = async (userData: any) => {
  return apiRequest('POST', '/auth/signup', userData);
};

export const getCurrentUser = async () => {
  return apiRequest('GET', '/auth/me');
};
