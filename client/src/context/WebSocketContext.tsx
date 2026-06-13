import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from '@/hooks/use-toast';

type MessageHandler = (data: any) => void;

interface WebSocketContextType {
  sendWsMessage: (data: any) => void;
  isConnected: boolean;
  addMessageHandler: (handler: MessageHandler) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const handlers = useRef<Set<MessageHandler>>(new Set());

  const addMessageHandler = useCallback((handler: MessageHandler) => {
    handlers.current.add(handler);
    return () => { handlers.current.delete(handler); };
  }, []); // stable reference — handlers.current is a ref, never changes

  useEffect(() => {
    if (!user) {
      socket?.close();
      setSocket(null);
      setIsConnected(false);
      return;
    }

    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const setupWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => {
        setIsConnected(true);
        ws.send(JSON.stringify({ type: 'auth', userId: user.id }));
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 30000);
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (pingInterval) clearInterval(pingInterval);
        reconnectTimeout = setTimeout(setupWebSocket, 5000);
      };

      ws.onerror = () => setIsConnected(false);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Dispatch to all subscribed handlers (MatchContext, etc.)
          handlers.current.forEach(h => h(data));

          // Built-in toast handling
          switch (data.type) {
            case 'engagement_nudge':
              toast({
                title: 'Reconnect with your match!',
                description: data.suggestion || `${data.hoursSince}h since your last message.`,
                duration: 10000,
              });
              break;
            case 'new_match':
              toast({ title: 'New Match! 🎉', description: 'You have a new match. Start chatting!' });
              break;
            case 'new_message':
              // Toasts are shown only when not in the messages tab (MatchContext suppresses when active)
              break;
          }
        } catch (e) {
          console.error('WS parse error', e);
        }
      };

      setSocket(ws);
      return ws;
    };

    const ws = setupWebSocket();

    return () => {
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [user?.id]);

  const sendWsMessage = (data: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  };

  return (
    <WebSocketContext.Provider value={{ sendWsMessage, isConnected, addMessageHandler }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket must be used within a WebSocketProvider');
  return ctx;
}
