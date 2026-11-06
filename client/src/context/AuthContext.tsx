import { createContext, useContext, ReactNode } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { User } from '@/types';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  createFirebaseEmailAccount,
  signInFirebaseEmail,
  signInWithFirebaseGoogle,
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
  loginWithFirebaseGoogle: (intent?: 'login' | 'signup') => Promise<User>;
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
        const headers: Record<string, string> = {};
        const stored = localStorage.getItem('cleverdate_user');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed?.id) headers['X-User-Id'] = String(parsed.id);
            if (parsed?.email) headers['X-User-Email'] = parsed.email;
          } catch {}
        }
        try {
          const { auth } = await import('@/lib/firebase');
          const token = await auth?.currentUser?.getIdToken();
          if (token) headers['Authorization'] = `Bearer ${token}`;
        } catch {}

        const res = await fetch('/api/auth/me', { headers, credentials: 'include' });
        if (res.status === 401) {
          localStorage.removeItem('cleverdate_user');
          return null;
        }
        if (!res.ok) {
          if (stored) {
            try { return JSON.parse(stored); } catch {}
          }
          return null;
        }
        const freshUser = await res.json();
        if (freshUser) {
          localStorage.setItem('cleverdate_user', JSON.stringify(freshUser));
        }
        return freshUser;
      } catch {
        const stored = localStorage.getItem('cleverdate_user');
        if (stored) {
          try { return JSON.parse(stored); } catch {}
        }
        return null;
      }
    },
  });

  const completeAuth = (data: User) => {
    localStorage.setItem('cleverdate_user', JSON.stringify(data));
    queryClient.setQueryData(['/api/auth/me'], data);
    if (data.isVerified) {
      navigate('/app/');
    } else if (!data.gender) {
      navigate('/create-profile');
    } else {
      navigate('/verify');
    }
  };

  const loginEmailMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      try {
        return await apiRequest('POST', '/auth/login', { email, password }) as Promise<User>;
      } catch (localErr: any) {
        if (isFirebaseConfigured()) {
          try {
            const firebaseUser = await signInFirebaseEmail(email, password);
            return await apiRequest('POST', '/auth/firebase/sync', {
              idToken: await firebaseUser.getIdToken(),
            }) as Promise<User>;
          } catch (fbErr: any) {
            console.warn('Firebase sign-in error:', fbErr?.message);
          }
        }
        throw localErr;
      }
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

  const loginFirebaseGoogleMutation = useMutation({
    mutationFn: async (intent: 'login' | 'signup' = 'login') => {
      const firebaseUser = await signInWithFirebaseGoogle();
      const idToken = await firebaseUser.getIdToken();
      return await apiRequest('POST', '/auth/firebase/sync', {
        idToken,
        allowUnverifiedEmail: true,
        intent,
      }) as Promise<User>;
    },
    onSuccess: completeAuth,
  });

  const registerEmailMutation = useMutation({
    mutationFn: async ({ email, password, country }: { email: string; password: string; country: string }) => {
      // Query the database first before creating a new user account
      await apiRequest('POST', '/auth/check-email', { email });

      if (isFirebaseConfigured()) {
        try {
          const firebaseUser = await createFirebaseEmailAccount(email, password);
          return await apiRequest('POST', '/auth/firebase/sync', {
            idToken: await firebaseUser.getIdToken(),
            country,
            allowUnverifiedEmail: true,
            intent: 'signup',
          }) as Promise<User>;
        } catch (fbErr: any) {
          if (fbErr?.code === 'auth/email-already-in-use' || fbErr?.message?.toLowerCase().includes('already')) {
            throw new Error('An account is already linked to that email address. Please sign in instead.');
          }
          console.warn('Firebase email creation fallback:', fbErr?.message);
        }
      }
      return await apiRequest('POST', '/auth/register', {
        email,
        password,
        confirmPassword: password,
        country,
      }) as Promise<User>;
    },
    onSuccess: completeAuth,
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
      localStorage.removeItem('cleverdate_user');
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
        loginWithFirebaseGoogle: async (intent?: 'login' | 'signup') => {
          return await loginFirebaseGoogleMutation.mutateAsync(intent);
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
