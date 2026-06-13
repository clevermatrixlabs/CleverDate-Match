import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Radio, Users, Heart, DollarSign,
  Send, UserPlus, StopCircle, Mic,
} from 'lucide-react';

type ChatMsg = {
  id: string;
  userName: string;
  text?: string;
  giftEmoji?: string;
  giftName?: string;
  isSystem?: boolean;
};

type Viewer = { userId: number; userName: string; avatar?: string };

export default function LiveStudioPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [isLive, setIsLive] = useState(false);
  const [liveId, setLiveId] = useState<number | null>(null);
  const [streamTitle, setStreamTitle] = useState("Clever Date Match Live 🔴");
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [guests, setGuests] = useState<number[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [totalGifts, setTotalGifts] = useState(0);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);

  const chatRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const msgIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Redirect non-admins
  useEffect(() => {
    if (user && !(user as any).isAdmin) navigate('/app/');
  }, [user]);

  // Elapsed timer
  useEffect(() => {
    if (isLive) {
      setStartTime(new Date());
      timerRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isLive]);

  const fmtTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  };

  const nextId = () => String(++msgIdRef.current);
  const addMsg = useCallback((msg: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev.slice(-100), { ...msg, id: nextId() }]);
    setTimeout(() => chatRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50);
  }, []);

  // ── Go Live ────────────────────────────────────────────────────────────────
  const goLiveMutation = useMutation({
    mutationFn: async () => apiRequest('POST', '/api/live/start', { title: streamTitle }),
    onSuccess: (data: any) => {
      setIsLive(true);
      setLiveId(data.id);
      connectWs(data.id);
      toast({ title: '🔴 You are live!', description: 'Your audience can now join.' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Failed to go live', description: e?.message }),
  });

  const endLiveMutation = useMutation({
    mutationFn: async () => apiRequest('POST', '/api/live/end', { id: liveId }),
    onSuccess: () => {
      setIsLive(false);
      setLiveId(null);
      wsRef.current?.close();
      toast({ title: 'Stream ended', description: `${viewerCount} viewers, ${likeCount} likes, $${totalGifts} gifts` });
      navigate('/admin');
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Failed to end', description: e?.message }),
  });

  const inviteMutation = useMutation({
    mutationFn: async (userId: number) =>
      apiRequest('POST', `/api/live/invite/${userId}`, { livestreamId: liveId }),
    onSuccess: (_, userId) => {
      toast({ title: 'Invitation sent!' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Invite failed', description: e?.message }),
  });

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const connectWs = (id: number) => {
    if (!user) return;
    const token = Math.random().toString(36).slice(2);
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', userId: user.id }));
      ws.send(JSON.stringify({ type: 'live:join', livestreamId: id, isHost: true }));
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        handleWsMsg(data);
      } catch {}
    };
  };

  const handleWsMsg = useCallback((data: any) => {
    switch (data.type) {
      case 'live:message':
        addMsg({ userName: data.userName, text: data.text });
        break;
      case 'live:gift':
        addMsg({ userName: data.userName, giftEmoji: data.giftEmoji, giftName: data.giftName });
        setTotalGifts(t => t + (data.giftCost || 0));
        break;
      case 'live:like':
        setLikeCount(c => c + 1);
        break;
      case 'live:join':
        if (!data.isHost) {
          setViewers(prev => prev.find(v => v.userId === data.userId)
            ? prev
            : [...prev, { userId: data.userId, userName: data.userName }]
          );
          setViewerCount(c => c + 1);
          addMsg({ userName: 'System', text: `${data.userName} joined ❤️`, isSystem: true });
        }
        break;
      case 'live:leave':
        setViewers(prev => prev.filter(v => v.userId !== data.userId));
        setViewerCount(c => Math.max(0, c - 1));
        break;
      case 'live:guest_added':
        setGuests(prev => prev.includes(data.userId) ? prev : [...prev, data.userId]);
        addMsg({ userName: 'System', text: `${data.userName} is now a guest! 🌟`, isSystem: true });
        break;
    }
  }, [addMsg]);

  const sendHostMessage = () => {
    if (!chatInput.trim() || !wsRef.current || !liveId) return;
    wsRef.current.send(JSON.stringify({
      type: 'live:message',
      livestreamId: liveId,
      text: chatInput.trim(),
      isHost: true,
    }));
    setChatInput('');
  };

  const userName = user ? `${(user as any).firstName ?? ''} ${(user as any).lastName ?? ''}`.trim() || 'Tim' : 'Tim';
  const profilePic = (user as any)?.profilePicture;

  if (!user || !(user as any).isAdmin) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white">Access denied.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Header ── */}
      <header className="bg-gradient-to-r from-pink-700 via-red-700 to-pink-700 px-4 py-3 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <Radio className="h-5 w-5 text-white animate-pulse" />
          <div>
            <h1 className="font-bold text-base">Live Studio</h1>
            <p className="text-xs text-white/70">Clever Date Match</p>
          </div>
        </div>
        {isLive && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-400 rounded-full animate-ping" />
            <span className="text-sm font-mono font-bold">{fmtTime(elapsedSecs)}</span>
          </div>
        )}
        <Button variant="ghost" size="sm" className="text-white/70 hover:text-white" onClick={() => navigate('/admin')}>
          ← Back
        </Button>
      </header>

      <div className="max-w-5xl mx-auto p-4 grid lg:grid-cols-3 gap-4">

        {/* ── Left: Preview + controls ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Stream preview */}
          <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-[#1a0533] via-[#0d0020] to-black aspect-video flex flex-col items-center justify-center shadow-2xl">
            {isLive && (
              <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
                <Badge className="bg-red-600 text-white border-0 animate-pulse text-xs">🔴 LIVE</Badge>
                <Badge className="bg-black/60 text-white border-0 text-xs backdrop-blur-sm">
                  <Users className="h-3 w-3 mr-1 inline" />{viewerCount}
                </Badge>
              </div>
            )}

            {/* Host avatar + guests */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                {isLive && <div className="absolute inset-0 rounded-full bg-pink-500/40 animate-ping scale-125" />}
                <div className="w-28 h-28 rounded-full border-4 border-pink-500 overflow-hidden relative z-10 shadow-2xl">
                  {profilePic ? (
                    <img src={profilePic} alt={userName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-4xl font-bold">
                      {userName[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-white font-bold text-lg drop-shadow-lg">{userName}</p>
              {guests.length > 0 && (
                <div className="flex gap-3">
                  {guests.map(gId => (
                    <div key={gId} className="flex flex-col items-center gap-1">
                      <div className="w-16 h-16 rounded-full border-2 border-yellow-400 bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-xl font-bold shadow-lg">
                        G
                      </div>
                      <span className="text-yellow-400 text-xs">Guest</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!isLive && (
              <div className="mt-6 text-center">
                <p className="text-white/50 text-sm">Your stream preview</p>
                <p className="text-white/30 text-xs mt-1">Avatar-based — no camera required</p>
              </div>
            )}
          </div>

          {/* Stream title + go live controls */}
          {!isLive ? (
            <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Stream title</label>
                <Input
                  value={streamTitle}
                  onChange={e => setStreamTitle(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white"
                  placeholder="What's your live about?"
                />
              </div>
              <Button
                onClick={() => goLiveMutation.mutate()}
                disabled={goLiveMutation.isPending}
                className="w-full bg-gradient-to-r from-pink-600 to-red-600 hover:from-pink-500 hover:to-red-500 text-white font-bold h-12 text-lg shadow-lg"
              >
                <Radio className="h-5 w-5 mr-2" />
                {goLiveMutation.isPending ? 'Starting...' : 'Go Live Now'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: <Users className="h-4 w-4 text-blue-400" />, value: viewerCount, label: 'Viewers' },
                  { icon: <Heart className="h-4 w-4 text-red-400" />, value: likeCount.toLocaleString(), label: 'Likes' },
                  { icon: <DollarSign className="h-4 w-4 text-yellow-400" />, value: `$${totalGifts}`, label: 'Gifts' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-900 rounded-xl p-3 text-center">
                    <div className="flex justify-center mb-1">{s.icon}</div>
                    <p className="text-xl font-bold">{s.value}</p>
                    <p className="text-xs text-gray-400">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Host message input */}
              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendHostMessage()}
                  placeholder="Send a message to viewers..."
                  className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-500"
                />
                <Button onClick={sendHostMessage} className="bg-pink-600 hover:bg-pink-500">
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {/* End stream */}
              <Button
                onClick={() => {
                  if (confirm('End your live stream? This cannot be undone.')) endLiveMutation.mutate();
                }}
                disabled={endLiveMutation.isPending}
                variant="destructive"
                className="w-full"
              >
                <StopCircle className="h-4 w-4 mr-2" />
                {endLiveMutation.isPending ? 'Ending...' : 'End Stream'}
              </Button>
            </div>
          )}
        </div>

        {/* ── Right: Chat + Viewers ── */}
        <div className="space-y-4">
          {/* Live chat */}
          <div className="bg-gray-900 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
              <Mic className="h-4 w-4 text-pink-400" />
              <span className="font-semibold text-sm">Live Chat</span>
              <Badge className="ml-auto bg-gray-800 text-gray-300 border-0 text-xs">{messages.length}</Badge>
            </div>
            <div ref={chatRef} className="h-64 overflow-y-auto p-3 space-y-2 scrollbar-hide">
              {messages.length === 0 && (
                <p className="text-gray-500 text-xs text-center pt-8">Chat will appear here when viewers join.</p>
              )}
              {messages.map(m => (
                <div key={m.id} className="text-sm">
                  {m.isSystem ? (
                    <p className="text-gray-500 text-xs italic text-center">{m.text}</p>
                  ) : m.giftEmoji ? (
                    <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2 py-1">
                      <span className="text-yellow-400 font-semibold text-xs">{m.userName}</span>
                      <span className="text-gray-400 text-xs">sent</span>
                      <span>{m.giftEmoji}</span>
                      <span className="text-yellow-300 text-xs font-bold">{m.giftName}</span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-pink-500/30 flex items-center justify-center text-xs font-bold text-pink-300 flex-shrink-0 mt-0.5">
                        {m.userName[0]?.toUpperCase()}
                      </div>
                      <div>
                        <span className="text-pink-300 text-xs font-semibold mr-1">{m.userName}</span>
                        <span className="text-gray-200 text-xs">{m.text}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Viewers / invite panel */}
          {isLive && (
            <div className="bg-gray-900 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                <span className="font-semibold text-sm">Viewers</span>
                <Badge className="ml-auto bg-gray-800 text-gray-300 border-0 text-xs">{viewers.length}</Badge>
              </div>
              <div className="max-h-52 overflow-y-auto scrollbar-hide">
                {viewers.length === 0 ? (
                  <p className="text-gray-500 text-xs text-center py-6">Waiting for viewers...</p>
                ) : (
                  viewers.map(v => (
                    <div key={v.userId} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/50 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {v.userName[0]?.toUpperCase()}
                      </div>
                      <span className="text-sm text-gray-200 flex-1 truncate">{v.userName}</span>
                      {!guests.includes(v.userId) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 px-2"
                          onClick={() => inviteMutation.mutate(v.userId)}
                          disabled={inviteMutation.isPending}
                        >
                          <UserPlus className="h-3.5 w-3.5 mr-1" />
                          Invite
                        </Button>
                      ) : (
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Guest 🌟</Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
