import React, { useState } from 'react';

// ... (PaymentModal component remains the same)
function PaymentModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center w-full max-w-xs mx-4">
        <h2 className="text-xl font-bold mb-2">방 생성 결제</h2>
        <p className="mb-4 text-gray-600">월 10,000원의 구독료가 발생합니다. QR코드를 스캔하여 결제를 진행해주세요.</p>
        <div className="bg-gray-100 w-48 h-48 mx-auto mb-6 flex items-center justify-center border rounded-lg">
          <p className="text-gray-500">(QR 코드 이미지)</p>
        </div>
        <button onClick={onConfirm} className="w-full py-2 mb-2 text-white bg-green-600 rounded-md hover:bg-green-700 font-bold">
          결제 완료 (임시 통과)
        </button>
        <button onClick={onCancel} className="w-full py-1 text-sm text-gray-600 hover:underline">
          취소
        </button>
      </div>
    </div>
  );
}


// '방 생성 완료' 화면 수정
function CreationSuccess({ roomData, onEnterRoom }) {
  return (
    <div className="flex items-center justify-center h-screen bg-natalk-bg">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-bold text-green-600">🎉 방 생성 완료! 🎉</h1>
        <div className="text-left bg-gray-50 p-4 rounded-lg">
          <p className="mb-2"><strong>방 이름:</strong> {roomData.roomName}</p>
          <p className="mb-4"><strong>초대 코드:</strong> {roomData.inviteCode}</p>
          <hr/>
          <div className="mt-4 p-4 bg-blue-100 border-l-4 border-blue-500 text-blue-800">
            <h3 className="font-bold">👑 방장이 되셨습니다!</h3>
            <p className="text-sm">
              이 방의 생성자로서, 방장(관리자) 권한을 가집니다.
              방장으로 로그인하려면 방 생성 시 사용한 이메일 주소를 이용해주세요.
            </p>
          </div>
        </div>
        <button
          onClick={onEnterRoom}
          className="w-full py-3 text-white bg-blue-600 rounded-md hover:bg-blue-700 font-bold"
        >
          대화방 입장하기
        </button>
      </div>
    </div>
  );
}


const API_URL = import.meta.env.PROD ? 'http://211.188.63.148:3002' : 'http://localhost:3002';

export function CreateRoomForm({ onRoomCreated, onSwitchToLogin }) {
  const [paymentApproved, setPaymentApproved] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState(''); // 이메일 상태 추가
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [creationResult, setCreationResult] = useState(null);

  const handlePaymentConfirm = () => {
    setShowPaymentModal(false);
    setPaymentApproved(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/create-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName, password, email }), // API 요청에 이메일 포함
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '방 생성에 실패했습니다.');
      }
      
      // 결과에 이메일도 함께 저장
      setCreationResult({ ...data, roomName, password, email });

    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (creationResult) {
    return (
      <CreationSuccess 
        roomData={creationResult}
        // 방 생성 후 이메일로 바로 로그인하도록 변경
        onEnterRoom={() => onRoomCreated(creationResult.roomId, { email: creationResult.email })}
      />
    );
  }

  if (paymentApproved) {
    return (
      <div className="flex items-center justify-center h-screen bg-natalk-bg">
        <div className="w-full max-w-sm p-8 space-y-6 bg-white rounded-lg shadow-md">
          <h1 className="text-2xl font-bold text-center">방 정보 설정</h1>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="roomName" className="block text-sm font-bold text-gray-600">
                방 이름
              </label>
              <input
                id="roomName" type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)}
                placeholder="예: 우리 가족 톡방"
                autoComplete="off"
                className="w-full p-2 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-gray-600">
                방장 이메일
              </label>
              <input
                id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="로그인 시 사용할 이메일 주소"
                autoComplete="email"
                className="w-full p-2 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label htmlFor="new-password" className="block text-sm font-bold text-gray-600">
                참여자용 비밀번호
              </label>
              <input
                id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="손님들이 사용할 비밀번호"
                autoComplete="new-password"
                className="w-full p-2 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button type="submit" disabled={isLoading} className="w-full py-2 font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400">
              {isLoading ? '생성 중...' : '방 만들기'}
            </button>
            {error && <p className="text-sm text-center text-red-500">{error}</p>}
          </form>
        </div>
      </div>
    );
  }

  // 초기 화면 (결제 전)
  return (
    <>
      {showPaymentModal && <PaymentModal onConfirm={handlePaymentConfirm} onCancel={() => setShowPaymentModal(false)} />}
      <div className="flex items-center justify-center h-screen bg-natalk-bg">
        <div className="w-full max-w-xs p-8 space-y-6 bg-white rounded-lg shadow-md text-center">
          <h1 className="text-2xl font-bold">NaTalk 유료 방 생성</h1>
          <p className="text-gray-600">
            우리만의 영구적인 대화방을 위해 월 10,000원의 구독료가 발생합니다.
          </p>
          <button
            onClick={() => setShowPaymentModal(true)}
            className="w-full py-2 font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            결제하고 방 만들기(베타버젼)
          </button>
          <p className="text-sm">
            이미 초대 코드가 있으신가요?{' '}
            <button onClick={onSwitchToLogin} className="font-medium text-blue-600 hover:underline">
              방 입장하기
            </button>
          </p>
        </div>
      </div>
    </>
  );
}