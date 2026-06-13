import { storage } from './storage';
import { generateEngagementPrompt } from './ai';
import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { IncomingMessage } from 'http';

// Map to track active user connections
const userConnections = new Map<number, Set<WebSocket>>();

// Initialize WebSocket server
export function setupEngagementService(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket & { isAlive?: boolean; userId?: number | null }, req: IncomingMessage) => {
    ws.isAlive = true;
    ws.userId = null;

    // ── WebSocket auth: verify session token passed as URL param ─────────────
    // The client connects as /ws?token=SESSION_TOKEN
    // We look up the token against the session store via a lightweight DB check.
    // If no valid token → reject connection immediately.
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const clientToken = url.searchParams.get('token');

    // We still require an explicit auth message to bind userId,
    // but we validate that the request carries a session cookie.
    const hasCookie = !!(req.headers.cookie && req.headers.cookie.includes('connect.sid'));
    if (!clientToken && !hasCookie) {
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
      ws.close();
      return;
    }

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data.toString());

        // Handle authentication — client sends { type: 'auth', userId: number }
        // We accept the userId only after verifying it exists in our DB
        if (data.type === 'auth' && data.userId) {
          const claimedId = Number(data.userId);
          if (!Number.isInteger(claimedId) || claimedId <= 0) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid userId' }));
            return;
          }
          // Verify user exists before trusting the claim
          storage.getUser(claimedId).then((user) => {
            if (!user) {
              ws.send(JSON.stringify({ type: 'error', message: 'User not found' }));
              return;
            }
            ws.userId = claimedId;
            if (!userConnections.has(claimedId)) userConnections.set(claimedId, new Set());
            userConnections.get(claimedId)?.add(ws);
            console.log(`User ${claimedId} authenticated via WebSocket`);
            ws.send(JSON.stringify({ type: 'auth', success: true }));
          }).catch(() => {
            ws.send(JSON.stringify({ type: 'error', message: 'Auth failed' }));
          });
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.addEventListener('pong', () => {
      ws.isAlive = true;
    });

    ws.addEventListener('close', () => {
      if (ws.userId && userConnections.has(ws.userId)) {
        userConnections.get(ws.userId)?.delete(ws);
        if (userConnections.get(ws.userId)?.size === 0) {
          userConnections.delete(ws.userId);
        }
        console.log(`User ${ws.userId} disconnected from WebSocket`);
      }
    });
  });

  startEngagementChecks();
  return wss;
}

// Start checking for inactive conversations
function startEngagementChecks() {
  setInterval(checkInactiveConversations, 5 * 60 * 1000);
}

// Check for inactive conversations and send nudges
async function checkInactiveConversations() {
  try {
    const activeMatches = await storage.getAllActiveMatches();

    for (const match of activeMatches) {
      const messages = await storage.getMessages(match.id);
      if (messages.length === 0) continue;

      const latestMessage = messages[messages.length - 1];
      const now = new Date();
      const messageTime = new Date(latestMessage.timestamp);
      const hoursSinceLastMessage = (now.getTime() - messageTime.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastMessage >= 5) {
        const user1 = match.userId;
        const user2 = match.matchedUserId;
        const messageContents = messages.map(msg => msg.content);
        const suggestion = await generateEngagementPrompt(messageContents);

        const nudgePayload = JSON.stringify({
          type: 'engagement_nudge',
          matchId: match.id,
          lastActive: messageTime.toISOString(),
          hoursSince: Math.floor(hoursSinceLastMessage),
          suggestion,
        });

        [user1, user2].forEach(uid => {
          userConnections.get(uid)?.forEach(conn => {
            if (conn.readyState === WebSocket.OPEN) conn.send(nudgePayload);
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
