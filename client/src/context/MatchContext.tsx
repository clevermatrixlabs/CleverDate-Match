import { createContext, useContext, ReactNode, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { MatchCandidate, Match, Message, User } from '@/types';
import { useAuth } from './AuthContext';
import { useWebSocket } from './WebSocketContext';

export type MatchDiscoveryState =
  | 'idle'
  | 'searching'
  | 'revealed'
  | 'no_matches';

export interface DailyMatchStatus {
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  dailyLimitReached: boolean;
  hasActiveMatch: boolean;
}

interface MatchContextType {
  potentialMatches: MatchCandidate[];
  currentMatch: Match | null;
  matchedUser: User | null;
  messages: Message[];
  isLoadingMatches: boolean;
  isLoadingMessages: boolean;
  hasActiveMatch: boolean;
  hasActiveSubscription: boolean;
  isTrialActive: boolean;
  dailyStatus: DailyMatchStatus;
  discoveryState: MatchDiscoveryState;
  triggerMatchDiscovery: () => Promise<void>;
  resetDiscovery: () => void;
  sendLike: (userId: number) => Promise<{ isMatched?: boolean }>;
  sendPass: (userId: number) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  unmatch: () => Promise<void>;
}

const MatchContext = createContext<MatchContextType | undefined>(undefined);

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_CANDIDATES: MatchCandidate[] = [];
const DEFAULT_DAILY_STATUS: DailyMatchStatus = {
  dailyLimit: 5,
  usedToday: 0,
  remainingToday: 5,
  dailyLimitReached: false,
  hasActiveMatch: false,
};

export function MatchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { addMessageHandler } = useWebSocket();
  const [discoveryState, setDiscoveryState] = useState<MatchDiscoveryState>('idle');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Reset discovery state when user changes
  useEffect(() => {
    setDiscoveryState('idle');
  }, [user?.id]);

  // Check trial & subscription status
  const isTrialActive = Boolean(
    (user as any)?.trialActivated &&
      (!(user as any)?.trialExpiresAt || new Date((user as any).trialExpiresAt).getTime() > Date.now())
  );

  const hasActiveSubscription = Boolean(
    (user?.subscriptionTier &&
      user.subscriptionTier !== 'none' &&
      (!user.subscriptionExpiry || new Date(user.subscriptionExpiry).getTime() > Date.now())) ||
      isTrialActive
  );

  // ── Daily match status (5/day limit) ────────────────────────────────────────
  const { data: dailyStatus = DEFAULT_DAILY_STATUS } = useQuery<DailyMatchStatus>({
    queryKey: ['/api/matches/daily-status'],
    queryFn: async () => {
      if (!user || !user.id) return DEFAULT_DAILY_STATUS;
      try {
        return await apiRequest('GET', '/matches/daily-status');
      } catch {
        return DEFAULT_DAILY_STATUS;
      }
    },
    enabled: Boolean(user && user.id),
  });

  // ── Potential matches ───────────────────────────────────────────────────────
  const {
    data: potentialMatches = EMPTY_CANDIDATES,
    isLoading: isLoadingMatches,
    refetch: refetchPotentialMatches,
  } = useQuery<MatchCandidate[]>({
    queryKey: ['/api/matches/potential'],
    queryFn: async ({ queryKey }) => {
      if (!user || !user.id) return [];
      try {
        return await apiRequest('GET', queryKey[0] as string);
      } catch {
        return [];
      }
    },
    enabled: Boolean(user && user.id && hasActiveSubscription),
  });

  // ── Current match ───────────────────────────────────────────────────────────
  const { data: currentMatch = null, isLoading: isLoadingCurrentMatch } =
    useQuery<Match | null>({
      queryKey: ['/api/matches/current'],
      queryFn: async ({ queryKey }) => {
        if (!user || !user.id) return null;
        try {
          return await apiRequest('GET', queryKey[0] as string);
        } catch {
          return null;
        }
      },
      enabled: Boolean(user && user.id),
    });

  // ── Matched user ────────────────────────────────────────────────────────────
  const otherUserId = currentMatch
    ? currentMatch.userId === user?.id
      ? currentMatch.matchedUserId
      : currentMatch.userId
    : null;

  const { data: matchedUser = null, isLoading: isLoadingMatchedUser } =
    useQuery<User | null>({
      queryKey: ['/api/users', otherUserId],
      queryFn: async ({ queryKey }) => {
        if (!otherUserId) return null;
        try {
          return await apiRequest('GET', `/users/${queryKey[1]}`);
        } catch {
          return null;
        }
      },
      enabled: !!currentMatch && !!otherUserId,
    });

  // ── Messages ────────────────────────────────────────────────────────────────
  const { data: fetchedMessages = EMPTY_MESSAGES, isLoading: isLoadingMessages } =
    useQuery<Message[]>({
      queryKey: ['/api/messages', currentMatch?.id],
      queryFn: async ({ queryKey }) => {
        if (!currentMatch) return [];
        try {
          return await apiRequest('GET', `/messages/${queryKey[1]}`);
        } catch {
          return [];
        }
      },
      enabled: !!currentMatch,
    });

  const [extraMessages, setExtraMessages] = useState<Message[]>([]);

  useEffect(() => {
    setExtraMessages([]);
  }, [currentMatch?.id]);

  useEffect(() => {
    if (!currentMatch) return;
    const matchId = currentMatch.id;

    return addMessageHandler((data: any) => {
      if (data.type === 'chat_message' && data.message?.matchId === matchId) {
        setExtraMessages(prev => {
          if (prev.some(m => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
    });
  }, [currentMatch?.id, addMessageHandler]);

  const messages = useMemo(() => {
    const serverIds = new Set(fetchedMessages.map(m => m.id));
    const newExtras = extraMessages.filter(m => !serverIds.has(m.id));
    return [...fetchedMessages, ...newExtras];
  }, [fetchedMessages, extraMessages]);

  const hasActiveMatch = !!currentMatch && currentMatch.status === 'accepted';

  // ── Match Discovery State Machine ───────────────────────────────────────────
  const triggerMatchDiscovery = useCallback(async () => {
    if (!user || discoveryState === 'searching') return;

    // 1. Check trial / active subscription status before proceeding
    if (!hasActiveSubscription) {
      setDiscoveryState('idle');
      return;
    }

    // 2. Check if user already has an active 1-on-1 match
    if (hasActiveMatch || dailyStatus.hasActiveMatch) {
      setDiscoveryState('idle');
      return;
    }

    // 3. Check current daily match count (5/day limit)
    if (dailyStatus.dailyLimitReached || dailyStatus.remainingToday <= 0) {
      setDiscoveryState('idle');
      return;
    }

    setDiscoveryState('searching');
    const resultPromise = refetchPotentialMatches();

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await resultPromise;
        const list = res.data || [];
        setDiscoveryState(list.length > 0 ? 'revealed' : 'no_matches');
      } catch {
        setDiscoveryState('no_matches');
      }
    }, 2600);
  }, [
    user,
    discoveryState,
    hasActiveSubscription,
    hasActiveMatch,
    dailyStatus.hasActiveMatch,
    dailyStatus.dailyLimitReached,
    dailyStatus.remainingToday,
    refetchPotentialMatches,
  ]);

  const resetDiscovery = useCallback(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setDiscoveryState('idle');
  }, []);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const likeMutation = useMutation({
    mutationFn: (userId: number) => apiRequest('POST', '/matches/like', { userId }),
    onSuccess: () => {
      setDiscoveryState('idle');
      queryClient.invalidateQueries({ queryKey: ['/api/matches/potential'] });
      queryClient.invalidateQueries({ queryKey: ['/api/matches/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/matches/daily-status'] });
    },
  });

  const passMutation = useMutation({
    mutationFn: (userId: number) => apiRequest('POST', '/matches/pass', { userId }),
    onSuccess: () => {
      setDiscoveryState('idle');
      queryClient.invalidateQueries({ queryKey: ['/api/matches/potential'] });
      queryClient.invalidateQueries({ queryKey: ['/api/matches/daily-status'] });
    },
  });

  const unmatchMutation = useMutation({
    mutationFn: () => {
      if (!currentMatch) throw new Error('No active match');
      return apiRequest('DELETE', `/matches/${currentMatch.id}`, {});
    },
    onSuccess: () => {
      setDiscoveryState('idle');
      queryClient.invalidateQueries({ queryKey: ['/api/matches/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/matches/potential'] });
      queryClient.invalidateQueries({ queryKey: ['/api/matches/daily-status'] });
    },
  });

  // ── Actions ─────────────────────────────────────────────────────────────────
  const sendLike = useCallback(async (userId: number) => {
    return await likeMutation.mutateAsync(userId);
  }, []); // eslint-disable-line

  const sendPass = useCallback(async (userId: number) => {
    await passMutation.mutateAsync(userId);
  }, []); // eslint-disable-line

  const sendMessage = useCallback(async (content: string) => {
    if (!currentMatch || !user) throw new Error('No active match');

    const tempId = -(Date.now());
    const optimistic: Message = {
      id: tempId,
      matchId: currentMatch.id,
      senderId: user.id,
      recipientId: otherUserId ?? 0,
      content,
      timestamp: new Date().toISOString(),
      isRead: false,
    };
    setExtraMessages(prev => [...prev, optimistic]);

    try {
      const saved: Message = await apiRequest('POST', `/messages/${currentMatch.id}`, { content });
      setExtraMessages(prev => {
        const without = prev.filter(m => m.id !== tempId);
        if (without.some(m => m.id === saved.id)) return without;
        return [...without, saved];
      });
    } catch (err) {
      setExtraMessages(prev => prev.filter(m => m.id !== tempId));
      throw err;
    }
  }, [currentMatch?.id, user?.id, otherUserId]); // eslint-disable-line

  const unmatch = useCallback(async () => {
    await unmatchMutation.mutateAsync();
  }, []); // eslint-disable-line

  return (
    <MatchContext.Provider
      value={{
        potentialMatches,
        currentMatch,
        matchedUser,
        messages,
        isLoadingMatches: isLoadingMatches || isLoadingCurrentMatch || isLoadingMatchedUser,
        isLoadingMessages,
        hasActiveMatch,
        hasActiveSubscription,
        isTrialActive,
        dailyStatus,
        discoveryState,
        triggerMatchDiscovery,
        resetDiscovery,
        sendLike,
        sendPass,
        sendMessage,
        unmatch,
      }}
    >
      {children}
    </MatchContext.Provider>
  );
}

export function useMatch() {
  const context = useContext(MatchContext);
  if (context === undefined) throw new Error('useMatch must be used within a MatchProvider');
  return context;
}
