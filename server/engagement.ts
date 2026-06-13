import { storage } from './storage';
import { generateEngagementPrompt } from './ai';
import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { IncomingMessage } from 'http';

// Map to track active user connections
const userConnections = new Map<number, Set<WebSocket>>();

// Live room — all viewers for the current stream
const liveViewers = new Map<WebSocket, { userId: number; userName: string; isHost: boolean }>();

// ── Broadcast helpers (exported for use in routes.ts) ─────────────────────
export function broadcastToLive(data: any) {
  const payload = JSON.stringify(data);
  liveViewers.forEach((_info, ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

export function broadcastLiveEnd() {
  broadcastToLive({ type: 'live:end' });
}

// Initialize WebSocket server
export function setupEngagementService(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket & { isAlive?: boolean; userId?: number | null }, req: IncomingMessage) => {
    ws.isAlive = true;
    ws.userId = null;

    // Reject if no session cookie and no token
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const clientToken = url.searchParams.get('token');
    const hasCookie = !!(req.headers.cookie && req.headers.cookie.includes('connect.sid'));
    if (!clientToken && !hasCookie) {
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
      ws.close();
      return;
    }

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        handleMessage(ws, data);
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.addEventListener('pong', () => { ws.isAlive = true; });

    ws.addEventListener('close', () => {
      // Remove from user connections
      if (ws.userId && userConnections.has(ws.userId)) {
        userConnections.get(ws.userId)?.delete(ws);
        if (userConnections.get(ws.userId)?.size === 0) userConnections.delete(ws.userId);
      }

      // Remove from live room and broadcast departure
      if (liveViewers.has(ws)) {
        const info = liveViewers.get(ws)!;
        liveViewers.delete(ws);
        if (!info.isHost) {
          broadcastToLive({ type: 'live:leave', userId: info.userId, userName: info.userName });
        }
      }
    });
  });

  startEngagementChecks();
  return wss;
}

async function handleMessage(ws: WebSocket & { userId?: number | null }, data: any) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  if (data.type === 'auth') {
    const claimedId = Number(data.userId);
    if (!Number.isInteger(claimedId) || claimedId <= 0) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid userId' }));
      return;
    }
    try {
      const user = await storage.getUser(claimedId);
      if (!user) { ws.send(JSON.stringify({ type: 'error', message: 'User not found' })); return; }
      ws.userId = claimedId;
      if (!userConnections.has(claimedId)) userConnections.set(claimedId, new Set());
      userConnections.get(claimedId)?.add(ws);
      ws.send(JSON.stringify({ type: 'auth', success: true }));
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Auth failed' }));
    }
    return;
  }

  // All other messages require auth
  if (!ws.userId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  const user = await storage.getUser(ws.userId);
  if (!user) return;
  const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || `User${user.id}`;

  // ── Live join ─────────────────────────────────────────────────────────────
  if (data.type === 'live:join') {
    const isHost = !!data.isHost;
    liveViewers.set(ws, { userId: ws.userId, userName, isHost });

    // Update viewer count in DB (non-host viewers only)
    if (!isHost) {
      try {
        const ls = await storage.getActiveLivestream();
        if (ls) {
          const newCount = (ls.viewerCount ?? 0) + 1;
          await storage.updateLivestreamStats(ls.id, { viewerCount: newCount });
          // Broadcast updated viewer count to all
          broadcastToLive({ type: 'live:viewer_count', count: newCount });
        }
      } catch {}
      broadcastToLive({ type: 'live:join', userId: ws.userId, userName, isHost: false });
    }
    return;
  }

  // ── Live leave ────────────────────────────────────────────────────────────
  if (data.type === 'live:leave') {
    if (liveViewers.has(ws)) {
      const info = liveViewers.get(ws)!;
      liveViewers.delete(ws);
      if (!info.isHost) {
        try {
          const ls = await storage.getActiveLivestream();
          if (ls) {
            const newCount = Math.max(0, (ls.viewerCount ?? 1) - 1);
            await storage.updateLivestreamStats(ls.id, { viewerCount: newCount });
            broadcastToLive({ type: 'live:viewer_count', count: newCount });
          }
        } catch {}
        broadcastToLive({ type: 'live:leave', userId: ws.userId, userName });
      }
    }
    return;
  }

  // ── Live message ──────────────────────────────────────────────────────────
  if (data.type === 'live:message') {
    const text = String(data.text || '').trim().slice(0, 200);
    if (!text) return;
    const isGuest = (liveViewers.get(ws)?.isHost) || false;
    broadcastToLive({
      type: 'live:message',
      userId: ws.userId,
      userName,
      text,
      avatar: user.profilePicture,
      isGuest,
    });
    return;
  }

  // ── Live like ─────────────────────────────────────────────────────────────
  if (data.type === 'live:like') {
    broadcastToLive({ type: 'live:like', userId: ws.userId });
    try {
      const ls = await storage.getActiveLivestream();
      if (ls) await storage.updateLivestreamStats(ls.id, { likeCount: (ls.likeCount ?? 0) + 1 });
    } catch {}
    return;
  }

  // ── Regular engagement nudges (existing feature) ───────────────────────
  // (all other message types are ignored safely)
}

// Start checking for inactive conversations
function startEngagementChecks() {
  setInterval(checkInactiveConversations, 5 * 60 * 1000);
}

async function checkInactiveConversations() {
  try {
    const activeMatches = await storage.getAllActiveMatches();
    for (const match of activeMatches) {
      const messages = await storage.getMessages(match.id);
      if (messages.length === 0) continue;
      const latestMessage = messages[messages.length - 1];
      const now = new Date();
      const messageTime = new Date(latestMessage.timestamp);
      const hoursSince = (now.getTime() - messageTime.getTime()) / (1000 * 60 * 60);
      if (hoursSince >= 5) {
        const messageContents = messages.map(m => m.content);
        const suggestion = await generateEngagementPrompt(messageContents);
        const nudge = JSON.stringify({
          type: 'engagement_nudge', matchId: match.id,
          lastActive: messageTime.toISOString(),
          hoursSince: Math.floor(hoursSince), suggestion,
        });
        [match.userId, match.matchedUserId].forEach(uid => {
          userConnections.get(uid)?.forEach(conn => {
            if (conn.readyState === WebSocket.OPEN) conn.send(nudge);
          });
        });
      }
    }
  } catch (error) {
    console.error('Error checking inactive conversations:', error);
  }
}

// Send a message to a specific user
export function sendToUser(userId: number, data: any) {
  const connections = userConnections.get(userId);
  if (!connections) return;
  const payload = JSON.stringify(data);
  connections.forEach(conn => {
    if (conn.readyState === WebSocket.OPEN) conn.send(payload);
  });
}
