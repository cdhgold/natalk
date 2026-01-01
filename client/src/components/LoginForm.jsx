import React, { useState } from 'react';

export function LoginForm({ onLogin, error, onSwitchToCreate }) {
  const [roomIdentifier, setRoomIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [loginType, setLoginType] = useState('guest'); // 'guest' or 'owner'

  const handleSubmit = (e) => {
    e.preventDefault();
    if (loginType === 'guest') {
      if (roomIdentifier && password) {
        onLogin(roomIdentifier, { password });
      }
    } else {
      if (roomIdentifier && email) {
        onLogin(roomIdentifier, { email });
      }
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-natalk-bg">
      <div className="w-full max-w-sm p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-center text-gray-800">NaTalk</h1>

        <div className="flex border-b">
          <button
            onClick={() => setLoginType('guest')}
            className={`flex-1 py-2 text-center font-semibold ${loginType === 'guest' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
          >
            손님
          </button>
          <button
            onClick={() => setLoginType('owner')}
            className={`flex-1 py-2 text-center font-semibold ${loginType === 'owner' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
          >
            방장
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="roomIdentifier" className="block text-sm font-bold text-gray-600">
              방 이름 또는 초대 코드
            </label>
            <input
              id="roomIdentifier" type="text" value={roomIdentifier} onChange={(e) => setRoomIdentifier(e.target.value)}
              placeholder="참여할 방의 이름 또는 코드를 입력하세요"
              className="w-full p-2 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {loginType === 'guest' ? (
            <div>
              <label htmlFor="password" className="block text-sm font-bold text-gray-600">
                비밀번호
              </label>
              <input
                id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="방 비밀번호"
                className="w-full p-2 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          ) : (
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-gray-600">
                이메일 주소
              </label>
              <input
                id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="방장 이메일 주소"
                className="w-full p-2 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          )}

          <button type="submit" className="w-full py-2 font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">
            입장하기
          </button>
          {error && <p className="text-sm text-center text-red-500">{error}</p>}
        </form>
        <p className="text-sm text-center text-gray-600">
          새로운 방을 만드시겠어요?{' '}
          <button onClick={onSwitchToCreate} className="font-medium text-blue-600 hover:underline">
            방 만들기
          </button>
        </p>
      </div>
    </div>
  );
}