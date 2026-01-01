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

  const handleRoomCreated = (roomId, credentials) => {
    // 방 생성 후, 생성자는 이메일을 사용하여 방장으로 바로 로그인합니다.
    login(roomId, credentials);
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