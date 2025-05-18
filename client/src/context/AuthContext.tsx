import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { User } from '@/types';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();

  const { 
    data: user, 
    isLoading,
    error 
  } = useQuery<User | null>({ 
    queryKey: ['/api/auth/me'],
    queryFn: async ({ queryKey }) => {
      try {
        const res = await fetch(queryKey[0], { credentials: 'include' });
        if (res.status === 401) return null;
        if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
        return await res.json();
      } catch (err) {
        console.error('Error fetching user:', err);
        return null;
      }
    }
  });

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await apiRequest('POST', '/api/auth/login', { username, password });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/auth/me'], data);
      navigate('/app');
    },
  });

  const registerMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await apiRequest('POST', '/api/auth/register', { username, password });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/auth/me'], data);
      navigate('/verify');
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/auth/logout', {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/auth/me'], null);
      navigate('/');
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (userData: Partial<User>) => {
      const res = await apiRequest('PATCH', '/api/users/me', userData);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/auth/me'], data);
    },
  });

  const login = async (username: string, password: string) => {
    await loginMutation.mutateAsync({ username, password });
  };

  const register = async (username: string, password: string) => {
    await registerMutation.mutateAsync({ username, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const updateUser = async (userData: Partial<User>) => {
    await updateUserMutation.mutateAsync(userData);
  };

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        updateUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
