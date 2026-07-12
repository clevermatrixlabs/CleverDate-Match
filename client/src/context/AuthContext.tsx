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
  loginWithGoogle: (accessToken: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, country: string) => Promise<User & { emailCodeSent?: boolean }>;
  registerWithPhone: (phone: string, password: string, country: string) => Promise<void>;
  sendOtp: (phone: string) => Promise<{ otp?: string }>;
  verifyOtp: (phone: string, otp: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  completeAuth: (user: User) => void;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.status === 401) return null;
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
  });

  const completeAuth = (data: User) => {
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
      return apiRequest('POST', '/auth/login', { email, password }) as Promise<User>;
    },
    onSuccess: completeAuth,
  });

  const loginPhoneMutation = useMutation({
    mutationFn: async ({ phone, password }: { phone: string; password: string }) => {
      return apiRequest('POST', '/auth/login-phone', { phone, password }) as Promise<User>;
    },
    onSuccess: completeAuth,
  });

  const loginGoogleMutation = useMutation({
    mutationFn: async (accessToken: string) => {
      return apiRequest('POST', '/auth/google', { accessToken }) as Promise<User>;
    },
    onSuccess: completeAuth,
  });

  // Register does NOT auto-navigate — caller decides (may need email verification first)
  const registerEmailMutation = useMutation({
    mutationFn: async ({ email, password, country }: { email: string; password: string; country: string }) => {
      return apiRequest('POST', '/auth/register', { email, password, confirmPassword: password, country }) as Promise<User & { emailCodeSent?: boolean }>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/auth/me'], data);
    },
  });

  const registerPhoneMutation = useMutation({
    mutationFn: async ({ phone, password, country }: { phone: string; password: string; country: string }) => {
      return apiRequest('POST', '/auth/register-phone', { phone, password, confirmPassword: password, country }) as Promise<User>;
    },
    onSuccess: completeAuth,
  });

  const sendOtpMutation = useMutation({
    mutationFn: async (phone: string) => {
      return apiRequest('POST', '/auth/send-otp', { phone }) as Promise<{ otp?: string }>;
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async ({ phone, otp }: { phone: string; otp: string }) => {
      return apiRequest('POST', '/auth/verify-otp', { phone, otp }) as Promise<User>;
    },
    onSuccess: completeAuth,
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      return apiRequest('POST', '/auth/forgot-password', { email });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ email, code, newPassword }: { email: string; code: string; newPassword: string }) => {
      return apiRequest('POST', '/auth/reset-password', { email, code, newPassword });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/auth/logout', {});
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/auth/me'], null);
      navigate('/');
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (userData: Partial<User>) => {
      return apiRequest('PATCH', '/users/me', userData) as Promise<User>;
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
        loginWithGoogle: async (accessToken) => {
          await loginGoogleMutation.mutateAsync(accessToken);
        },
        registerWithEmail: async (email, password, country) => {
          return registerEmailMutation.mutateAsync({ email, password, country });
        },
        registerWithPhone: async (phone, password, country) => {
          await registerPhoneMutation.mutateAsync({ phone, password, country });
        },
        sendOtp: async (phone) => {
          return sendOtpMutation.mutateAsync(phone);
        },
        verifyOtp: async (phone, otp) => {
          await verifyOtpMutation.mutateAsync({ phone, otp });
        },
        forgotPassword: async (email) => {
          await forgotPasswordMutation.mutateAsync(email);
        },
        resetPassword: async (email, code, newPassword) => {
          await resetPasswordMutation.mutateAsync({ email, code, newPassword });
        },
        completeAuth,
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
