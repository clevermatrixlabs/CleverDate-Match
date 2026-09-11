import { createContext, useContext, ReactNode } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { User } from '@/types';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  createFirebaseEmailAccount,
  signInFirebaseEmail,
  sendFirebasePasswordReset,
  isFirebaseConfigured,
  toFriendlyAuthError,
} from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithPhone: (phone: string, password: string) => Promise<void>;
  loginWithGoogle: (accessToken: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, country: string) => Promise<User>;
  forgotPassword: (email: string) => Promise<void>;
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
      if (!isFirebaseConfigured()) throw new Error('Sign-in is not available right now. Please try again later.');
      const firebaseUser = await signInFirebaseEmail(email, password);
      return apiRequest('POST', '/auth/firebase/sync', {
        idToken: await firebaseUser.getIdToken(),
      }) as Promise<User>;
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

  // Firebase creates the identity and sends the real verification link. The
  // local account is synced immediately so the user can finish their profile.
  const registerEmailMutation = useMutation({
    mutationFn: async ({ email, password, country }: { email: string; password: string; country: string }) => {
      if (!isFirebaseConfigured()) throw new Error('Account creation is not available right now. Please try again later.');
      const firebaseUser = await createFirebaseEmailAccount(email, password);
      return apiRequest('POST', '/auth/firebase/sync', {
        idToken: await firebaseUser.getIdToken(),
        country,
        allowUnverifiedEmail: true,
      }) as Promise<User>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/auth/me'], data);
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      if (!isFirebaseConfigured()) throw new Error('Password recovery is not available right now. Please try again later.');
      await sendFirebasePasswordReset(email);
      return { success: true };
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
        forgotPassword: async (email) => {
          await forgotPasswordMutation.mutateAsync(email);
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
