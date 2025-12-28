import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.PROD ? 'http://211.188.63.148:3002' : 'http://localhost:3002';

/**
 * @description NaTalk 인증 및 소켓 연결을 관리하는 React Custom Hook
 * 1. localStorage에 저장된 세션 토큰으로 자동 로그인 시도
 * 2. 로그인/로그아웃 기능 제공
 * 3. 소켓 연결 상태 및 오류 관리
 */
export const useAuth = () => {
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const setupSocketListeners = useCallback((newSocket) => {
    newSocket.on('connect', () => {
      setIsConnected(true);
      setError(null); // 연결 성공 시 에러 초기화
    });
    newSocket.on('disconnect', () => setIsConnected(false));
    newSocket.on('connect_error', (err) => {
      setError(err.message);
      // 토큰 인증 실패 시 로컬 스토리지 정리
      localStorage.removeItem('natalk-session');
    });
    newSocket.on('session', ({ userId, sessionToken, roomName, inviteCode }) => {
      localStorage.setItem('natalk-session', sessionToken);
      const [, roomId] = sessionToken.split(':');
      setUser({ id: userId, roomId: roomId, roomName: roomName, inviteCode: inviteCode });
      setSocket(newSocket);
    });
    // '강퇴' 기능을 위한 이벤트 리스너
    newSocket.on('force_disconnect', () => {
      newSocket.disconnect();
      localStorage.removeItem('natalk-session');
      setSocket(null);
      setUser(null);
      setError("방에서 강퇴당했습니다.");
    });
  }, []);

  const connectWithToken = useCallback((sessionToken) => {
    const newSocket = io(SERVER_URL, { auth: { sessionToken } });
    setupSocketListeners(newSocket);
  }, [setupSocketListeners]);

  // 앱 로드 시 자동 로그인 처리
  useEffect(() => {
    const sessionToken = localStorage.getItem('natalk-session');
    if (sessionToken) {
      connectWithToken(sessionToken);
    }
    return () => {
      if (socket) socket.disconnect();
    };
  }, [connectWithToken]); // 의존성 배열 수정

  const login = useCallback((roomIdentifier, password) => {
    if (socket) socket.disconnect();
    const newSocket = io(SERVER_URL, { auth: { roomId: roomIdentifier, password } });
    setupSocketListeners(newSocket);
  }, [socket, setupSocketListeners]);

  const logout = useCallback(() => {
    if (socket) socket.disconnect();
    setSocket(null);
    setUser(null);
    setIsConnected(false);
    localStorage.removeItem('natalk-session');
  }, [socket]);

  return { user, socket, isConnected, error, login, logout };
};