import { createContext, useContext, ReactNode, useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';
import { MatchCandidate, Match, Message, User } from '@/types';
import { useAuth } from './AuthContext';
import { useWebSocket } from './WebSocketContext';

interface MatchContextType {
  potentialMatches: MatchCandidate[];
  currentMatch: Match | null;
  matchedUser: User | null;
  messages: Message[];
  isLoadingMatches: boolean;
  isLoadingMessages: boolean;
  hasActiveMatch: boolean;
  sendLike: (userId: number) => Promise<void>;
  sendPass: (userId: number) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  unmatch: () => Promise<void>;
}

const MatchContext = createContext<MatchContextType | undefined>(undefined);

// Stable empty array — avoids new reference on every render
const EMPTY_MESSAGES: Message[] = [];
const EMPTY_CANDIDATES: MatchCandidate[] = [];

export function MatchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { addMessageHandler } = useWebSocket();

  // ── Potential matches ───────────────────────────────────────────────────────
  const { data: potentialMatches = EMPTY_CANDIDATES, isLoading: isLoadingMatches } =
    useQuery<MatchCandidate[]>({
      queryKey: ['/api/matches/potential'],
      queryFn: async ({ queryKey }) => {
        if (!user) return [];
        const res = await fetch(queryKey[0] as string, { credentials: 'include' });
        if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
        return res.json();
      },
      enabled: !!user,
    });

  // ── Current match ───────────────────────────────────────────────────────────
  const { data: currentMatch = null, isLoading: isLoadingCurrentMatch } =
    useQuery<Match | null>({
      queryKey: ['/api/matches/current'],
      queryFn: async ({ queryKey }) => {
        if (!user) return null;
        const res = await fetch(queryKey[0] as string, { credentials: 'include' });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
        return res.json();
      },
      enabled: !!user,
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
        const res = await fetch(`/api/users/${queryKey[1]}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
        return res.json();
      },
      enabled: !!currentMatch && !!otherUserId,
    });

  // ── Messages ────────────────────────────────────────────────────────────────
  // Server-fetched baseline
  const { data: fetchedMessages = EMPTY_MESSAGES, isLoading: isLoadingMessages } =
    useQuery<Message[]>({
      queryKey: ['/api/messages', currentMatch?.id],
      queryFn: async ({ queryKey }) => {
        if (!currentMatch) return [];
        const res = await fetch(`${queryKey[0]}/${queryKey[1]}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
        return res.json();
      },
      enabled: !!currentMatch,
    });

  // Extra messages received via WebSocket or optimistic updates
  // (not yet confirmed / not in the server fetch)
  const [extraMessages, setExtraMessages] = useState<Message[]>([]);

  // Clear extra messages when the match changes
  useEffect(() => {
    setExtraMessages([]);
  }, [currentMatch?.id]);

  // Subscribe to WebSocket chat_message events
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

  // Merge server messages + extras (deduplicate by id)
  const messages = useMemo(() => {
    const serverIds = new Set(fetchedMessages.map(m => m.id));
    const newExtras = extraMessages.filter(m => !serverIds.has(m.id));
    return [...fetchedMessages, ...newExtras];
  }, [fetchedMessages, extraMessages]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const likeMutation = useMutation({
    mutationFn: (userId: number) => apiRequest('POST', '/matches/like', { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/matches/potential'] });
      queryClient.invalidateQueries({ queryKey: ['/api/matches/current'] });
    },
  });

  const passMutation = useMutation({
    mutationFn: (userId: number) => apiRequest('POST', '/matches/pass', { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/matches/potential'] });
    },
  });

  const unmatchMutation = useMutation({
    mutationFn: () => {
      if (!currentMatch) throw new Error('No active match');
      return apiRequest('DELETE', `/matches/${currentMatch.id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/matches/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/matches/potential'] });
    },
  });

  // ── Actions ─────────────────────────────────────────────────────────────────
  const sendLike = useCallback(async (userId: number) => {
    await likeMutation.mutateAsync(userId);
  }, []); // eslint-disable-line

  const sendPass = useCallback(async (userId: number) => {
    await passMutation.mutateAsync(userId);
  }, []); // eslint-disable-line

  const sendMessage = useCallback(async (content: string) => {
    if (!currentMatch || !user) throw new Error('No active match');

    // Optimistic: show immediately for the sender
    const tempId = -(Date.now()); // negative → guaranteed not to clash with DB ids
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
      // Replace optimistic entry with the confirmed server message
      setExtraMessages(prev => {
        const without = prev.filter(m => m.id !== tempId);
        if (without.some(m => m.id === saved.id)) return without;
        return [...without, saved];
      });
    } catch (err) {
      // Roll back on error
      setExtraMessages(prev => prev.filter(m => m.id !== tempId));
      throw err;
    }
  }, [currentMatch?.id, user?.id, otherUserId]); // eslint-disable-line

  const unmatch = useCallback(async () => {
    await unmatchMutation.mutateAsync();
  }, []); // eslint-disable-line

  const hasActiveMatch = !!currentMatch && currentMatch.status === 'accepted';

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
