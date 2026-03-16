import { createContext, useContext, ReactNode } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { User } from '@/types';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithPhone: (phone: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  registerWithPhone: (phone: string, password: string) => Promise<void>;
  sendOtp: (phone: string) => Promise<{ otp?: string }>;
  verifyOtp: (phone: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ['/api/auth/me'],
    queryFn: async ({ queryKey }) => {
      try {
        const res = await fetch(queryKey[0] as string, { credentials: 'include' });
        if (res.status === 401) return null;
        if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
        return await res.json();
      } catch {
        return null;
      }
    },
  });

  const handleAuthSuccess = (data: User) => {
    queryClient.setQueryData(['/api/auth/me'], data);
    if (!data.gender) {
      navigate('/create-profile');
    } else if (!data.isVerified) {
      navigate('/verify');
    } else {
      navigate('/app/');
    }
  };

  const loginEmailMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await apiRequest('POST', '/api/auth/login', { email, password });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Login failed');
      }
      return res.json() as Promise<User>;
    },
    onSuccess: handleAuthSuccess,
  });

  const loginPhoneMutation = useMutation({
    mutationFn: async ({ phone, password }: { phone: string; password: string }) => {
      const res = await apiRequest('POST', '/api/auth/login-phone', { phone, password });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Login failed');
      }
      return res.json() as Promise<User>;
    },
    onSuccess: handleAuthSuccess,
  });

  const registerEmailMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await apiRequest('POST', '/api/auth/register', { email, password, confirmPassword: password });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Registration failed');
      }
      return res.json() as Promise<User>;
    },
    onSuccess: handleAuthSuccess,
  });

  const registerPhoneMutation = useMutation({
    mutationFn: async ({ phone, password }: { phone: string; password: string }) => {
      const res = await apiRequest('POST', '/api/auth/register-phone', { phone, password, confirmPassword: password });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Registration failed');
      }
      return res.json() as Promise<User>;
    },
    onSuccess: handleAuthSuccess,
  });

  const sendOtpMutation = useMutation({
    mutationFn: async (phone: string) => {
      const res = await apiRequest('POST', '/api/auth/send-otp', { phone });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to send OTP');
      }
      return res.json();
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async ({ phone, otp }: { phone: string; otp: string }) => {
      const res = await apiRequest('POST', '/api/auth/verify-otp', { phone, otp });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Invalid OTP');
      }
      return res.json() as Promise<User>;
    },
    onSuccess: handleAuthSuccess,
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

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isAuthenticated: !!user,
        isLoading,
        loginWithEmail: async (email, password) => {
          await loginEmailMutation.mutateAsync({ email, password });
        },
        loginWithPhone: async (phone, password) => {
          await loginPhoneMutation.mutateAsync({ phone, password });
        },
        registerWithEmail: async (email, password) => {
          await registerEmailMutation.mutateAsync({ email, password });
        },
        registerWithPhone: async (phone, password) => {
          await registerPhoneMutation.mutateAsync({ phone, password });
        },
        sendOtp: async (phone) => {
          return sendOtpMutation.mutateAsync(phone);
        },
        verifyOtp: async (phone, otp) => {
          await verifyOtpMutation.mutateAsync({ phone, otp });
        },
        logout: async () => {
          await logoutMutation.mutateAsync();
        },
        updateUser: async (userData) => {
          await updateUserMutation.mutateAsync(userData);
        },
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
