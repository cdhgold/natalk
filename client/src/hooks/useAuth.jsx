import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.PROD ? 'http://211.188.63.148:3002' : 'http://localhost:3002';

export const useAuth = () => {
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const setupSocketListeners = useCallback((newSocket) => {
    newSocket.on('connect', () => {
      setIsConnected(true);
      setError(null);
    });
    newSocket.on('disconnect', () => setIsConnected(false));
    newSocket.on('connect_error', (err) => {
      setError(err.message);
      // Do not remove session on temporary connection errors
    });
    newSocket.on('session', (sessionData) => {
      const { userId, sessionToken, isAdmin, ...rest } = sessionData;
      localStorage.setItem('natalk-session', sessionToken);
      const [, roomId] = sessionToken.split(':');
      // Update user state with isAdmin status from server
      setUser({ id: userId, roomId: roomId, isAdmin, ...rest });
      setSocket(newSocket);
    });
    newSocket.on('force_disconnect', (message) => {
      newSocket.disconnect();
      localStorage.removeItem('natalk-session');
      setSocket(null);
      setUser(null);
      setError(message || "You have been disconnected from the room.");
    });
  }, []);

  const connectWithToken = useCallback((sessionToken) => {
    // Reconnecting no longer requires sending an admin token.
    const auth = { sessionToken };
    const newSocket = io(SERVER_URL, { auth });
    setupSocketListeners(newSocket);
  }, [setupSocketListeners]);

  useEffect(() => {
    const sessionToken = localStorage.getItem('natalk-session');
    if (sessionToken) {
      connectWithToken(sessionToken);
    }
    return () => {
      if (socket) socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback((roomIdentifier, credentials) => {
    if (socket) socket.disconnect();
    
    // The credentials object will contain either { password: '...' } or { email: '...' }
    const auth = { roomIdentifier, ...credentials };
    
    const newSocket = io(SERVER_URL, { auth });
    setupSocketListeners(newSocket);
  }, [socket, setupSocketListeners]);

  const logout = useCallback(() => {
    if (socket) socket.disconnect();
    setSocket(null);
    setUser(null);
    setIsConnected(false);
    localStorage.removeItem('natalk-session');
    // Also clear any legacy admin tokens if they exist
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('natalk-admin-')) {
        localStorage.removeItem(key);
      }
    });
  }, [socket]);

  return { user, socket, isConnected, error, login, logout };
};