import { storage } from './storage';
import { generateEngagementPrompt } from './ai';
import { WebSocketServer } from 'ws';
import { Server } from 'http';

// Map to track active user connections
const userConnections = new Map<number, Set<WebSocket>>();

// Initialize WebSocket server
export function setupEngagementService(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  
  wss.on('connection', (ws: WebSocket & { isAlive?: boolean; userId?: number | null }) => {
    ws.isAlive = true;
    ws.userId = null;
    
    // Use addEventListener for compatibility
    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        
        // Handle authentication
        if (data.type === 'auth' && data.userId) {
          ws.userId = data.userId;
          
          // Add this connection to the user's set of connections
          if (!userConnections.has(ws.userId)) {
            userConnections.set(ws.userId, new Set());
          }
          userConnections.get(ws.userId)?.add(ws);
          
          console.log(`User ${ws.userId} authenticated via WebSocket`);
          
          // Send confirmation
          ws.send(JSON.stringify({ type: 'auth', success: true }));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });
    
    // Set up ping-pong to keep connection alive
    ws.addEventListener('pong', () => {
      ws.isAlive = true;
    });
    
    // Remove connection when closed
    ws.addEventListener('close', () => {
      if (ws.userId && userConnections.has(ws.userId)) {
        userConnections.get(ws.userId)?.delete(ws);
        
        // Clean up empty sets
        if (userConnections.get(ws.userId)?.size === 0) {
          userConnections.delete(ws.userId);
        }
        
        console.log(`User ${ws.userId} disconnected from WebSocket`);
      }
    });
  });
  
  // Start the engagement check interval
  startEngagementChecks();
  
  return wss;
}

// Start checking for inactive conversations
function startEngagementChecks() {
  // Check every 5 minutes
  setInterval(checkInactiveConversations, 5 * 60 * 1000);
}

// Check for inactive conversations and send nudges
async function checkInactiveConversations() {
  try {
    // Get all active matches
    const activeMatches = await storage.getAllActiveMatches();
    
    for (const match of activeMatches) {
      // Get latest messages for this match
      const messages = await storage.getMessages(match.id);
      
      if (messages.length === 0) continue;
      
      const latestMessage = messages[messages.length - 1];
      const now = new Date();
      const messageTime = new Date(latestMessage.timestamp);
      const hoursSinceLastMessage = (now.getTime() - messageTime.getTime()) / (1000 * 60 * 60);
      
      // If more than 5 hours have passed since the last message
      if (hoursSinceLastMessage >= 5) {
        // Get match participants
        const user1 = match.userId;
        const user2 = match.matchedUserId;
        
        // Generate suggestions based on conversation history
        const messageContents = messages.map(msg => msg.content);
        const suggestion = await generateEngagementPrompt(messageContents);
        
        // Send nudge to both users if they're connected
        const nudgePayload = JSON.stringify({
          type: 'engagement_nudge',
          matchId: match.id,
          lastActive: messageTime.toISOString(),
          hoursSince: Math.floor(hoursSinceLastMessage),
          suggestion
        });
        
        // Send to first user
        if (userConnections.has(user1)) {
          userConnections.get(user1)?.forEach(conn => {
            if (conn.readyState === WebSocket.OPEN) {
              conn.send(nudgePayload);
            }
          });
        }
        
        // Send to second user
        if (userConnections.has(user2)) {
          userConnections.get(user2)?.forEach(conn => {
            if (conn.readyState === WebSocket.OPEN) {
              conn.send(nudgePayload);
            }
          });
        }
      }
    }
  } catch (error) {
    console.error('Error checking inactive conversations:', error);
  }
}

// Send a message to a specific user
export function sendToUser(userId: number, data: any) {
  if (userConnections.has(userId)) {
    const connections = userConnections.get(userId);
    const payload = JSON.stringify(data);
    
    connections?.forEach(conn => {
      if (conn.readyState === WebSocket.OPEN) {
        conn.send(payload);
      }
    });
  }
}