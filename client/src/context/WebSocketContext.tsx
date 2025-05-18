import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from '@/hooks/use-toast';

interface WebSocketContextType {
  sendMessage: (data: any) => void;
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.close();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    let pingInterval: NodeJS.Timeout | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    // Function to create and set up a new WebSocket connection
    const setupWebSocket = () => {
      // Initialize WebSocket connection
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const newSocket = new WebSocket(wsUrl);
      
      // Connection established
      newSocket.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        
        // Send authentication message
        newSocket.send(JSON.stringify({
          type: 'auth',
          userId: user.id
        }));
        
        // Set up ping interval to keep connection alive
        pingInterval = setInterval(() => {
          if (newSocket.readyState === WebSocket.OPEN) {
            newSocket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000); // Every 30 seconds
      };

      // Connection closed
      newSocket.onclose = (event) => {
        console.log(`WebSocket disconnected: ${event.code} ${event.reason || ''}`);
        setIsConnected(false);
        
        // Clean up ping interval
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
        
        // Try to reconnect after a delay
        reconnectTimeout = setTimeout(() => {
          console.log('Attempting to reconnect WebSocket...');
          setupWebSocket();
        }, 5000); // Try to reconnect after 5 seconds
      };

      // Connection error
      newSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };

      // Message received
      newSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle different message types
          switch (data.type) {
            case 'auth':
              console.log('Authentication status:', data.success);
              break;
              
            case 'engagement_nudge':
              toast({
                title: "Reconnect with your match!",
                description: data.suggestion || `It's been ${data.hoursSince} hours since your last message.`,
                duration: 10000,
              });
              break;
              
            case 'new_match':
              toast({
                title: "New Match!",
                description: "You have a new match. Start chatting now!",
                variant: "default",
              });
              break;
              
            case 'new_message':
              toast({
                title: "New Message",
                description: "You have received a new message.",
                variant: "default",
              });
              break;
              
            // Handle ping response
            case 'pong':
              console.log('Received pong from server');
              break;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      setSocket(newSocket);
      return newSocket;
    };

    // Initial setup
    const newSocket = setupWebSocket();

    // Cleanup function
    return () => {
      // Clear intervals and timeouts
      if (pingInterval) {
        clearInterval(pingInterval);
      }
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      
      // Close WebSocket if it's open
      if (newSocket && newSocket.readyState === WebSocket.OPEN) {
        newSocket.close();
      }
    };
  }, [user]);

  // Function to send messages through WebSocket
  const sendMessage = (data: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    } else {
      console.error('WebSocket is not connected');
    }
  };

  return (
    <WebSocketContext.Provider value={{ sendMessage, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}