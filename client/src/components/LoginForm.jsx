import React, { useState } from 'react';

export function LoginForm({ onLogin, error, onSwitchToCreate }) {
  const [roomIdentifier, setRoomIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (roomIdentifier && password) {
      onLogin(roomIdentifier, password);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-natalk-bg">
      <div className="w-full max-w-xs p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center">NaTalk</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="roomIdentifier" className="block text-sm font-bold text-gray-600">
              방 이름 또는 초대 코드
            </label>
            <input
              id="roomIdentifier" type="text" value={roomIdentifier} onChange={(e) => setRoomIdentifier(e.target.value)}
              autoComplete="username"
              className="w-full p-2 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-bold text-gray-600">
              비밀번호
            </label>
            <input
              id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full p-2 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button type="submit" className="w-full py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700">
            입장하기
          </button>
          {error && <p className="text-sm text-center text-red-500">{error}</p>}
        </form>
        <p className="text-sm text-center">
          새로운 방을 만드시겠어요?{' '}
          <button onClick={onSwitchToCreate} className="font-medium text-blue-600 hover:underline">
            방 만들기
          </button>
        </p>
      </div>
    </div>
  );
}