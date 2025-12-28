import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { ChatRoom } from './components/ChatRoom';
import { LoginForm } from './components/LoginForm';
import { CreateRoomForm } from './components/CreateRoomForm';

function App() {
  const { user, socket, isConnected, error, login, logout } = useAuth();
  const [view, setView] = useState('login'); // 'login' or 'create'

  // 사용자가 인증되고 소켓이 연결되면 채팅방을 보여줍니다.
  if (user && isConnected) {
    return <ChatRoom user={user} socket={socket} onLogout={logout} />;
  }

  const handleRoomCreated = (roomId, password, adminToken) => {
    // 방 생성 후, adminToken을 roomId와 함께 localStorage에 저장하고 바로 로그인 시도
    localStorage.setItem(`natalk-admin-${roomId}`, adminToken);
    login(roomId, password);
  };

  if (view === 'create') {
    return (
      <CreateRoomForm
        onRoomCreated={handleRoomCreated}
        onSwitchToLogin={() => setView('login')}
      />
    );
  }

  // 기본적으로 로그인 폼을 보여줍니다.
  return <LoginForm onLogin={login} error={error} onSwitchToCreate={() => setView('create')} />;
}

export default App;