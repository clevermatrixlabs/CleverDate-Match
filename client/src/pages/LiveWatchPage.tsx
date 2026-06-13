import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Heart, Send, Users, Gift } from 'lucide-react';

// ── Gift types ────────────────────────────────────────────────────────────────
const LIVE_GIFTS = [
  { id: 'rose',    emoji: '🌹', name: 'Rose',    cost: 1 },
  { id: 'heart',   emoji: '💖', name: 'Heart',   cost: 2 },
  { id: 'star',    emoji: '⭐', name: 'Star',    cost: 5 },
  { id: 'crown',   emoji: '👑', name: 'Crown',   cost: 10 },
  { id: 'diamond', emoji: '💎', name: 'Diamond', cost: 20 },
  { id: 'rocket',  emoji: '🚀', name: 'Rocket',  cost: 50 },
];

type ChatMsg = {
  id: string;
  userId: number;
  userName: string;
  avatar?: string;
  text?: string;
  giftEmoji?: string;
  giftName?: string;
  isSystem?: boolean;
  isGuest?: boolean;
};

type FloatingGift = { id: string; emoji: string; x: number };
type FloatingHeart = { id: string; x: number; color: string };

type LiveState = {
  id: number;
  title: string;
  viewerCount: number;
  likeCount: number;
  totalGifts: string;
  hostId: number;
  guestIds: number[];
};

type HostInfo = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  profilePicture: string | null;
};

export default function LiveWatchPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [floatingGifts, setFloatingGifts] = useState<FloatingGift[]>([]);
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeart[]>([]);
  const [showGiftPanel, setShowGiftPanel] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [guestIds, setGuestIds] = useState<number[]>([]);
  const [liveEnded, setLiveEnded] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const msgIdRef = useRef(0);

  // ── Fetch active livestream ────────────────────────────────────────────────
  const liveQuery = useQuery<LiveState>({
    queryKey: ['/api/live/current'],
    queryFn: async () => {
      const r = await fetch('/api/live/current', { credentials: 'include' });
      if (!r.ok) throw new Error('No active live');
      return r.json();
    },
  });

  const live = liveQuery.data;

  // ── Fetch host info ────────────────────────────────────────────────────────
  const hostQuery = useQuery<HostInfo>({
    queryKey: ['/api/users', live?.hostId],
    enabled: !!live?.hostId,
    queryFn: async () => {
      const r = await fetch(`/api/users/${live!.hostId}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
  });

  // Fetch guest user info
  const guestQueries = useQuery<HostInfo[]>({
    queryKey: ['/api/live/guests', guestIds],
    enabled: guestIds.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        guestIds.map(id => fetch(`/api/users/${id}`, { credentials: 'include' }).then(r => r.json()))
      );
      return results;
    },
  });

  // ── Gift mutation ──────────────────────────────────────────────────────────
  const giftMutation = useMutation({
    mutationFn: async ({ giftId }: { giftId: string }) =>
      apiRequest('POST', '/api/live/gift', { giftId }),
    onSuccess: (_, vars) => {
      const gift = LIVE_GIFTS.find(g => g.id === vars.giftId)!;
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      // WS broadcasts to all; our own animation fires via WS echo
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Gift failed', description: e?.message }),
  });

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !live) return;

    const token = Math.random().toString(36).slice(2);
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', userId: user.id }));
      ws.send(JSON.stringify({ type: 'live:join', livestreamId: live.id }));
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        handleWsMessage(data);
      } catch {}
    };

    ws.onclose = () => {};

    return () => {
      ws.send(JSON.stringify({ type: 'live:leave', livestreamId: live?.id }));
      ws.close();
    };
  }, [user?.id, live?.id]);

  const nextId = () => String(++msgIdRef.current);

  const addMsg = useCallback((msg: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev.slice(-80), { ...msg, id: nextId() }]);
    setTimeout(() => chatRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50);
  }, []);

  const addFloatingGift = useCallback((emoji: string) => {
    const id = nextId();
    setFloatingGifts(prev => [...prev, { id, emoji, x: 20 + Math.random() * 60 }]);
    setTimeout(() => setFloatingGifts(prev => prev.filter(g => g.id !== id)), 3000);
  }, []);

  const addFloatingHeart = useCallback(() => {
    const id = nextId();
    const colors = ['#ff4d6d','#ff6b6b','#ff85a1','#ffa8c5','#ff70a6'];
    setFloatingHearts(prev => [...prev, { id, x: 15 + Math.random() * 70, color: colors[Math.floor(Math.random()*colors.length)] }]);
    setTimeout(() => setFloatingHearts(prev => prev.filter(h => h.id !== id)), 2500);
  }, []);

  const handleWsMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'live:message':
        addMsg({ userId: data.userId, userName: data.userName, text: data.text, avatar: data.avatar, isGuest: data.isGuest });
        break;
      case 'live:gift':
        addMsg({ userId: data.userId, userName: data.userName, giftEmoji: data.giftEmoji, giftName: data.giftName, avatar: data.avatar });
        addFloatingGift(data.giftEmoji);
        break;
      case 'live:like':
        setLikeCount(c => c + 1);
        addFloatingHeart();
        break;
      case 'live:viewer_count':
        setViewerCount(data.count);
        break;
      case 'live:guest_added':
        setGuestIds(prev => prev.includes(data.userId) ? prev : [...prev, data.userId]);
        addMsg({ userId: 0, userName: 'System', text: `${data.userName} joined as a guest! 🎉`, isSystem: true });
        if (data.userId === user?.id) setIsGuest(true);
        break;
      case 'live:end':
        setLiveEnded(true);
        break;
      case 'live:join':
        addMsg({ userId: 0, userName: 'System', text: `${data.userName} joined ❤️`, isSystem: true });
        break;
    }
  }, [addMsg, addFloatingGift, addFloatingHeart, user?.id]);

  const sendChat = () => {
    if (!chatInput.trim() || !wsRef.current || !live) return;
    wsRef.current.send(JSON.stringify({
      type: 'live:message',
      livestreamId: live.id,
      text: chatInput.trim(),
    }));
    setChatInput('');
  };

  const sendLike = () => {
    if (!wsRef.current || !live) return;
    wsRef.current.send(JSON.stringify({ type: 'live:like', livestreamId: live.id }));
    addFloatingHeart();
    setLikeCount(c => c + 1);
  };

  const sendGift = (gift: typeof LIVE_GIFTS[number]) => {
    if (!wsRef.current || !live) return;
    giftMutation.mutate({ giftId: gift.id });
    setShowGiftPanel(false);
  };

  // ── Loading / ended / no live states ──────────────────────────────────────
  if (liveQuery.isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p>Loading live...</p>
        </div>
      </div>
    );
  }

  if (liveEnded || liveQuery.isError || !live) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <div className="text-6xl">📴</div>
        <h2 className="text-white text-2xl font-bold">Live has ended</h2>
        <p className="text-white/60 text-sm">Thanks for watching!</p>
        <Button onClick={() => navigate('/app/')} className="bg-pink-600 hover:bg-pink-700">
          Go back to app
        </Button>
      </div>
    );
  }

  const host = hostQuery.data;
  const guests = guestQueries.data || [];
  const hostName = host ? `${host.firstName ?? ''} ${host.lastName ?? ''}`.trim() || 'Host' : 'Host';
  const displayViewers = viewerCount || live.viewerCount || 0;
  const displayLikes = likeCount || live.likeCount || 0;

  return (
    <div className="min-h-screen bg-black relative overflow-hidden select-none" style={{ maxHeight: '100dvh' }}>

      {/* ── Background gradient ── */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a0533] via-[#0d0020] to-black" />

      {/* ── Host & guests video area ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
        {/* Pulsing live ring */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-pink-500/30 animate-ping scale-110" />
          <div className="w-36 h-36 rounded-full border-4 border-pink-500 overflow-hidden relative z-10 shadow-2xl shadow-pink-500/40">
            {host?.profilePicture ? (
              <img src={host.profilePicture} alt={hostName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-4xl font-bold text-white">
                {hostName[0]?.toUpperCase()}
              </div>
            )}
          </div>
          {/* LIVE badge */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full z-20 animate-pulse">
            LIVE
          </div>
        </div>
        <p className="text-white font-semibold text-lg drop-shadow-lg">{hostName}</p>

        {/* Guests row */}
        {guests.length > 0 && (
          <div className="flex gap-3 mt-1">
            {guests.map((g) => {
              const gName = `${g?.firstName ?? ''} ${g?.lastName ?? ''}`.trim() || 'Guest';
              return (
                <div key={g.id} className="flex flex-col items-center gap-1">
                  <div className="w-20 h-20 rounded-full border-2 border-yellow-400 overflow-hidden shadow-lg shadow-yellow-400/30">
                    {g?.profilePicture ? (
                      <img src={g.profilePicture} alt={gName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-2xl font-bold text-white">
                        {gName[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="text-white/80 text-xs">{gName}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Floating gift animations ── */}
      {floatingGifts.map(g => (
        <div
          key={g.id}
          className="absolute bottom-40 text-4xl pointer-events-none"
          style={{ left: `${g.x}%`, animation: 'floatUp 3s ease-out forwards' }}
        >
          {g.emoji}
        </div>
      ))}

      {/* ── Floating hearts ── */}
      {floatingHearts.map(h => (
        <div
          key={h.id}
          className="absolute bottom-32 text-2xl pointer-events-none"
          style={{ left: `${h.x}%`, color: h.color, animation: 'floatUp 2.5s ease-out forwards' }}
        >
          ❤️
        </div>
      ))}

      {/* ── Top bar ── */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-safe pt-4 z-20">
        <div className="flex items-center gap-2">
          <div className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">LIVE</div>
          <div className="bg-black/50 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 backdrop-blur-sm">
            <Users className="h-3 w-3" /> {displayViewers}
          </div>
          <div className="bg-black/50 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 backdrop-blur-sm">
            <Heart className="h-3 w-3 text-red-400" /> {displayLikes.toLocaleString()}
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="text-white hover:bg-white/20 rounded-full"
          onClick={() => navigate('/app/')}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* ── Stream title ── */}
      <div className="absolute top-14 left-4 right-16 z-20">
        <p className="text-white font-semibold text-sm drop-shadow">{live.title}</p>
        {isGuest && (
          <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block">
            🌟 You're a Guest
          </span>
        )}
      </div>

      {/* ── Chat + bottom controls ── */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        {/* Gift panel */}
        {showGiftPanel && (
          <div className="bg-black/90 backdrop-blur-sm border-t border-white/10 px-4 py-4">
            <p className="text-white/60 text-xs mb-3 font-medium">Send a gift 🎁</p>
            <div className="grid grid-cols-6 gap-2">
              {LIVE_GIFTS.map(g => (
                <button
                  key={g.id}
                  onClick={() => sendGift(g)}
                  disabled={giftMutation.isPending}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-white/10 transition-colors active:scale-95"
                >
                  <span className="text-2xl">{g.emoji}</span>
                  <span className="text-white text-xs">{g.name}</span>
                  <span className="text-yellow-400 text-xs font-bold">${g.cost}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat scroll area */}
        <div
          ref={chatRef}
          className="h-40 overflow-y-auto px-4 py-2 space-y-1.5 scrollbar-hide"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}
        >
          {messages.map(m => (
            <div key={m.id} className="flex items-start gap-2 animate-fadeIn">
              {m.isSystem ? (
                <p className="text-white/50 text-xs italic">{m.text}</p>
              ) : m.giftEmoji ? (
                <div className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-500/20 to-pink-500/20 rounded-full px-3 py-1 border border-yellow-500/30">
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white">
                    {m.userName[0]?.toUpperCase()}
                  </div>
                  <span className="text-white text-xs font-semibold">{m.userName}</span>
                  <span className="text-white/70 text-xs">sent</span>
                  <span className="text-lg">{m.giftEmoji}</span>
                  <span className="text-yellow-300 text-xs font-bold">{m.giftName}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-pink-500/40 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {m.userName[0]?.toUpperCase()}
                  </div>
                  <span className={`text-xs font-semibold ${m.isGuest ? 'text-yellow-400' : 'text-white/80'}`}>{m.userName}</span>
                  {m.isGuest && <span className="text-yellow-400 text-xs">🌟</span>}
                  <span className="text-white/90 text-xs">{m.text}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Input row */}
        <div className="flex items-center gap-2 px-3 pb-safe pb-4 pt-2">
          <Input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            placeholder="Say something..."
            className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-full text-sm h-9 focus-visible:ring-pink-500"
          />
          <Button
            size="icon"
            variant="ghost"
            className="rounded-full h-9 w-9 text-white hover:bg-white/10"
            onClick={sendChat}
          >
            <Send className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="rounded-full h-9 w-9 text-white hover:bg-white/10"
            onClick={() => setShowGiftPanel(s => !s)}
          >
            <Gift className="h-4 w-4 text-yellow-400" />
          </Button>
          <button
            onClick={sendLike}
            className="rounded-full h-9 w-9 bg-red-500/20 flex items-center justify-center text-lg hover:bg-red-500/40 transition-colors active:scale-90"
          >
            ❤️
          </button>
        </div>
      </div>

      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-200px) scale(0.5); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .pt-safe { padding-top: env(safe-area-inset-top, 0px); }
        .pb-safe { padding-bottom: env(safe-area-inset-bottom, 0px); }
      `}</style>
    </div>
  );
}
