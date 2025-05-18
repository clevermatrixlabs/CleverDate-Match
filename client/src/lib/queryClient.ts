import { createClient } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';

// Create a client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 3,
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      onError: (error) => {
        console.error('Query error:', error);
      },
    },
    mutations: {
      retry: 2,
      retryDelay: 1000,
      onError: (error) => {
        console.error('Mutation error:', error);
      },
    },
  },
});

// Create the Supabase client with proper environment variable handling
let supabaseUrl = '';
let supabaseKey = '';

// Safely access env variables to prevent "process is not defined" errors
try {
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  supabaseKey = import.meta.env.VITE_SUPABASE_KEY;
} catch (e) {
  console.warn('Failed to load environment variables, using fallback');
  // Fallback values if needed
  if (!supabaseUrl) supabaseUrl = 'https://kdyuewasapwyvfricivy.supabase.co';
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

// API request helper function with improved error handling
export const apiRequest = async (method: string, endpoint: string, data?: any) => {
  try {
    const response = await fetch(`/api${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
      credentials: 'include',
    });

    // Handle non-JSON responses gracefully
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const jsonResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(jsonResponse.message || 'API request failed');
      }
      
      return jsonResponse;
    } else {
      const textResponse = await response.text();
      
      if (!response.ok) {
        throw new Error(textResponse || 'API request failed');
      }
      
      return { message: textResponse };
    }
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
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