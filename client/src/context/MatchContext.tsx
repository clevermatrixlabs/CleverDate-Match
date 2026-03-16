import { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';
import { User, Match, Message } from '@/types';
import { useAuth } from './AuthContext';

interface MatchContextType {
  potentialMatches: User[];
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

export function MatchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  
  // Fetch potential matches
  const { 
    data: potentialMatches = [],
    isLoading: isLoadingMatches
  } = useQuery<User[]>({
    queryKey: ['/api/matches/potential'],
    queryFn: async ({ queryKey }) => {
      if (!user) return [];
      const res = await fetch(queryKey[0], { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    enabled: !!user
  });

  // Fetch current match
  const { 
    data: currentMatch,
    isLoading: isLoadingCurrentMatch
  } = useQuery<Match | null>({
    queryKey: ['/api/matches/current'],
    queryFn: async ({ queryKey }) => {
      if (!user) return null;
      const res = await fetch(queryKey[0], { credentials: 'include' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    enabled: !!user
  });

  // Determine the other user's ID in the match
  const otherUserId = currentMatch
    ? (currentMatch.userId === user?.id ? currentMatch.matchedUserId : currentMatch.userId)
    : null;

  // Fetch matched user details if we have a match
  const { 
    data: matchedUser,
    isLoading: isLoadingMatchedUser
  } = useQuery<User | null>({
    queryKey: ['/api/users', otherUserId],
    queryFn: async ({ queryKey }) => {
      if (!otherUserId) return null;
      const res = await fetch(`/api/users/${queryKey[1]}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    enabled: !!currentMatch && !!otherUserId
  });

  // Fetch messages for current match
  const { 
    data: messages = [],
    isLoading: isLoadingMessages
  } = useQuery<Message[]>({
    queryKey: ['/api/messages', currentMatch?.id],
    queryFn: async ({ queryKey }) => {
      if (!currentMatch) return [];
      const res = await fetch(`${queryKey[0]}/${queryKey[1]}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    enabled: !!currentMatch
  });

  // Send like mutation
  const likeMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest('POST', '/api/matches/like', { userId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/matches/potential'] });
      queryClient.invalidateQueries({ queryKey: ['/api/matches/current'] });
    }
  });

  // Send pass mutation
  const passMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest('POST', '/api/matches/pass', { userId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/matches/potential'] });
    }
  });

  // Send message mutation
  const messageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!currentMatch) throw new Error('No active match');
      const res = await apiRequest('POST', `/api/messages/${currentMatch.id}`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages', currentMatch?.id] });
    }
  });

  // Unmatch mutation
  const unmatchMutation = useMutation({
    mutationFn: async () => {
      if (!currentMatch) throw new Error('No active match');
      const res = await apiRequest('DELETE', `/api/matches/${currentMatch.id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/matches/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/matches/potential'] });
    }
  });

  const sendLike = async (userId: number) => {
    await likeMutation.mutateAsync(userId);
  };

  const sendPass = async (userId: number) => {
    await passMutation.mutateAsync(userId);
  };

  const sendMessage = async (content: string) => {
    await messageMutation.mutateAsync(content);
  };

  const unmatch = async () => {
    await unmatchMutation.mutateAsync();
  };

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
        unmatch
      }}
    >
      {children}
    </MatchContext.Provider>
  );
}

export function useMatch() {
  const context = useContext(MatchContext);
  if (context === undefined) {
    throw new Error('useMatch must be used within a MatchProvider');
  }
  return context;
}
