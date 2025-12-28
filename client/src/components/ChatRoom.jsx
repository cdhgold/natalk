import React, { useState, useEffect, useRef, Fragment } from 'react';
import { ProfileSetupModal } from './ProfileSetupModal';

const API_URL = import.meta.env.PROD ? 'http://211.188.63.148:3002' : 'http://localhost:3002';

// 말풍선 컴포넌트
function MessageBubble({ message, isOwn }) {
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // 내가 보낸 메시지
  if (isOwn) {
    return (
      <div className="flex justify-end">
        <div className="flex items-end max-w-xs space-x-2 md:max-w-md">
          <span className="mb-1 text-xs text-gray-500 self-end">{formatTime(message.timestamp)}</span>
          <p className="px-4 py-2 text-black rounded-lg bg-natalk-yellow rounded-br-none">
            {message.message}
          </p>
        </div>
      </div>
    );
  }

  // 다른 사람이 보낸 메시지
  return (
    <div className="flex items-start space-x-3">
      {/* 3단계: 동그란 프로필 이미지 */}
      <img
        className="w-10 h-10 rounded-full"
        src={message.profileImage || `https://i.pravatar.cc/40?u=${message.userId}`}
        alt="profile"
      />
      <div className="flex flex-col items-start">
        {/* 3단계: 말풍선 위 작은 이름 */}
        <span className="text-sm text-gray-700">{message.nickname || message.userId.substring(0, 5)}</span>
        <div className="flex items-end space-x-2">
          <p className="px-4 py-2 text-black bg-white rounded-lg rounded-bl-none">
            {message.message}
          </p>
          <span className="mb-1 text-xs text-gray-500 self-end">{formatTime(message.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

// 참여자 목록을 보여주는 사이드바 컴포넌트
function ParticipantsSidebar({
  participants,
  currentUser,
  isAdmin,
  onKick,
  onClose,
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose}>
      <div
        className="fixed top-0 right-0 h-full w-64 sm:w-80 bg-white shadow-lg p-4 z-50 transform transition-transform"
        onClick={(e) => e.stopPropagation()} // 사이드바 내부 클릭 시 닫히지 않도록 함
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">참여자 목록 ({participants.length})</h2>
          <button onClick={onClose} className="text-2xl font-bold">&times;</button>
        </div>
        <ul>
          {participants.map((participant) => (
            <li key={participant.id} className="flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
              <div className="flex items-center overflow-hidden">
                <img
                  className="w-8 h-8 rounded-full mr-3 flex-shrink-0"
                  src={participant.profileImage || `https://i.pravatar.cc/40?u=${participant.id}`}
                  alt="participant"
                />
                <span className="text-sm truncate">{participant.nickname}</span>
              </div>
              {isAdmin && currentUser.id !== participant.id && (
                <button
                  onClick={() => onKick(participant.id)}
                  className="px-2 py-1 text-xs text-white bg-red-600 rounded-md hover:bg-red-700 flex-shrink-0 ml-2"
                >
                  강퇴
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// 초대 정보 모달 컴포넌트
function InviteModal({ roomName, inviteCode, onClose }) {
  const inviteText = `방 이름: ${roomName}\n초대 코드: ${inviteCode}\n\n위 정보와 설정하신 비밀번호를 공유하여 친구를 초대하세요.`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteText).then(() => {
      alert('초대 정보가 클립보드에 복사되었습니다.');
    }, () => {
      alert('복사에 실패했습니다.');
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl text-left w-full max-w-sm mx-4">
        <h2 className="text-xl font-bold mb-4">초대하기</h2>
        <div className="bg-gray-100 p-4 rounded-md mb-6">
          <p className="text-gray-800">
            방 이름: <span className="font-semibold">{roomName}</span>
          </p>
          <p className="text-gray-800">
            초대 코드: <span className="font-semibold">{inviteCode}</span>
          </p>
          <p className="text-sm text-gray-600 mt-2">
            위 정보와 방 비밀번호를 함께 전달해주세요.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            대화내용은24시간만 유지됩니다.
          </p>
        </div>
        <button onClick={copyToClipboard} className="w-full py-2 mb-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 font-bold">
          초대 정보 복사
        </button>
        <button onClick={onClose} className="w-full py-1 text-sm text-gray-600 hover:underline">
          닫기
        </button>
      </div>
    </div>
  );
}

// 채팅방 전체 컴포넌트
export function ChatRoom({ socket, user, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  // 컴포넌트 마운트 시 방장인지 확인
  useEffect(() => {
    const adminToken = localStorage.getItem(`natalk-admin-${user.roomId}`);
    if (adminToken) {
      setIsAdmin(true);
    }

    // 서버에서 받은 user 정보 기반으로 프로필 설정 모달 표시 여부 결정
    // user.skipProfileSetup: '다시 보지 않기' 설정 값
    // user.nickname.startsWith('익명-'): 프로필이 설정되지 않은 기본 상태인지 확인
    if (user && !user.skipProfileSetup && user.nickname?.startsWith('익명-')) {
      setShowProfileSetup(true);
    }
  }, [user]);

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (message) => setMessages((prev) => [...prev, message]);
    const handleSystemMessage = (text) => setMessages((prev) => [...prev, { type: 'system', text }]);
    
    // 서버로부터 이전 대화 기록을 받아 상태에 설정
    socket.on('chat_history', (history) => {
      setMessages(history);
    });

    // 참여자 목록 업데이트 수신
    socket.on('update_user_list', (userList) => {
      console.log(userList);
      setParticipants(userList);
    });

    socket.on('receive_message', handleReceiveMessage);
    socket.on('user_joined', (data) => handleSystemMessage(data.message));
    socket.on('user_left', (data) => handleSystemMessage(data.message));
    socket.on('system_message', (text) => handleSystemMessage(`[공지] ${text}`));

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('user_joined');
      socket.off('user_left');
      socket.off('system_message');
      socket.off('update_user_list');
      socket.off('chat_history');
    };
  }, [socket]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() && socket) {
      socket.emit('send_message', { message: newMessage });
      setNewMessage('');
    }
  };

  const handleDestroyRoom = async () => {
    if (!window.confirm('정말로 이 방을 삭제하시겠습니까? 모든 대화 내용이 영구적으로 사라집니다.')) {
      return;
    }

    const adminToken = localStorage.getItem(`natalk-admin-${user.roomId}`);
    if (!adminToken) {
      alert('관리자 토큰을 찾을 수 없습니다.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/room/${user.roomId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ adminToken }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || '방 삭제에 실패했습니다.');
      }
      alert('방이 성공적으로 삭제되었습니다.');
    } catch (error) {
      alert(error.message);
    }
  };

  const handleKickUser = (targetUserId) => {
    if (!window.confirm(`사용자(${targetUserId.substring(0, 8)}...)님을 강퇴하시겠습니까?`)) {
      return;
    }
    const adminToken = localStorage.getItem(`natalk-admin-${user.roomId}`);
    if (socket && adminToken) {
      socket.emit('kick_user', { targetUserId, adminToken });
    } else {
      alert('강퇴 권한을 확인할 수 없습니다.');
    }
  };

  const handleProfileSet = ({ nickname, profileImage, skipFuture }) => {
    // 서버에 프로필 정보와 '다시 보지 않기' 설정을 한번에 전송
    socket.emit('set_profile', { nickname, profileImage, skipFuture });
    setShowProfileSetup(false);
  };

  const handleProfileSkip = () => {
    // '나중에 하기'를 누르면, 다시 묻지 않도록 서버에 설정을 영구 저장합니다.
    socket.emit('set_profile_skip', { skipFuture: true });
    setShowProfileSetup(false);
  };

  return (
    <Fragment>
      {showInviteModal && isAdmin && (
        <InviteModal
          roomName={user.roomName}
          inviteCode={user.inviteCode}
          onClose={() => setShowInviteModal(false)}
        />
      )}
      {showProfileSetup && <ProfileSetupModal onProfileSet={handleProfileSet} onSkip={handleProfileSkip} />}
      {showParticipants && (
        <ParticipantsSidebar
          participants={participants}
          currentUser={user}
          isAdmin={isAdmin}
          onKick={handleKickUser}
          onClose={() => setShowParticipants(false)}
        />
      )}
      <div className="flex flex-col h-screen bg-natalk-bg">
        <header className="flex items-center justify-between p-4 bg-white bg-opacity-50 shadow-sm">
          <h1 className="text-xl font-bold truncate" title={user.roomName}>{user.roomName || 'NaTalk'}</h1>
          <div className="flex items-center space-x-2">
            {isAdmin && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-3 py-1 text-sm text-white bg-green-600 rounded-md hover:bg-green-700"
              >
                초대하기
              </button>
            )}
            <button onClick={() => setShowParticipants(true)} className="px-3 py-1 text-sm text-gray-700 bg-white rounded-md border border-gray-300 hover:bg-gray-50">
              참여자 ({participants.length})
            </button>
            {isAdmin && (
              <button
                onClick={handleDestroyRoom}
                className="px-3 py-1 text-sm text-white bg-black rounded-md hover:bg-gray-800"
              >
                방 폭파
              </button>
            )}
            <button onClick={onLogout} className="px-3 py-1 text-sm text-white bg-red-500 rounded-md">
              나가기
            </button>
          </div>
        </header>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {messages.map((msg, index) => {
              if (msg.type === 'system') {
                  return <div key={index} className="text-xs text-center text-gray-500 my-2">{msg.text}</div>
              }
              return <MessageBubble key={index} message={msg} isOwn={msg.userId === user.id} />
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-white">
          <form onSubmit={handleSendMessage} className="flex space-x-2">
            <input
              type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="메시지를 입력하세요..."
            />
            <button
              type="submit"
              className="px-4 py-2 font-bold text-gray-700 rounded-md bg-natalk-yellow disabled:bg-gray-300"
              disabled={!newMessage.trim()}
            >
              전송
            </button>
          </form>
        </div>
      </div>
    </Fragment>
  );
}