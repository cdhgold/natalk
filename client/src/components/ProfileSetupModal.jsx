import React, { useState } from 'react';

export function ProfileSetupModal({ socket, onClose }) {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(''); // 이전 에러 메시지 초기화
    if (nickname.trim() && socket) {
      // 서버의 'set_profile' 이벤트에 맞춰 닉네임만 전송합니다.
      // 서버로부터 응답을 받기 위해 콜백 함수를 추가합니다.
      socket.emit('set_profile', { nickname: nickname.trim() }, (response) => {
        if (response.success) {
          onClose(); // 성공 시에만 모달을 닫습니다.
        } else {
          setError(response.message); // 실패 시 에러 메시지를 상태에 저장합니다.
        }
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-sm mx-4">
        <h2 className="text-2xl font-bold mb-4 text-center">프로필 설정</h2>
        <p className="text-center text-gray-600 mb-2">채팅방에서 사용할 닉네임을 입력해주세요.</p>
        <p className="text-center text-sm text-gray-500 mb-6">프로필 이미지는 자동으로 설정됩니다.</p>
        
        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="nickname" className="sr-only">닉네임</label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="닉네임 (2~10자)"
              minLength="2"
              maxLength="10"
              autoFocus
              required
            />
            {error && <p className="text-red-500 text-sm text-left mt-2">{error}</p>}
          </div>
          <button type="submit" className="w-full mt-4 py-3 text-white bg-blue-600 rounded-md hover:bg-blue-700 font-bold">
            입장하기
          </button>
        </form>
      </div>
    </div>
  );
}