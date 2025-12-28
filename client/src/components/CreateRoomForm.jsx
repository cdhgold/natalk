import React, { useState } from 'react';

// 결제용 QR코드를 보여주는 모달 컴포넌트
function PaymentModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center w-full max-w-xs mx-4">
        <h2 className="text-xl font-bold mb-2">방 생성 결제</h2>
        <p className="mb-4 text-gray-600">월 10,000원의 구독료가 발생합니다. QR코드를 스캔하여 결제를 진행해주세요.</p>

        {/* QR Code Placeholder */}
        <div className="bg-gray-100 w-48 h-48 mx-auto mb-6 flex items-center justify-center border rounded-lg">
          <p className="text-gray-500">(QR 코드 이미지)</p>
        </div>

        {/* 임시 결제 통과 버튼 */}
        <button
          onClick={onConfirm}
          className="w-full py-2 mb-2 text-white bg-green-600 rounded-md hover:bg-green-700 font-bold"
        >
          결제 완료 (임시 통과)
        </button>
        <button
          onClick={onCancel}
          className="w-full py-1 text-sm text-gray-600 hover:underline"
        >
          취소
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
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
        body: JSON.stringify({ roomName, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create room.');
      }

      onRoomCreated(data.roomId, password, data.adminToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 결제가 "승인"된 후, 실제 방 생성 폼을 보여줍니다.
  if (paymentApproved) {
    return (
      <div className="flex items-center justify-center h-screen bg-natalk-bg">
        <div className="w-full max-w-xs p-8 space-y-6 bg-white rounded-lg shadow-md">
          <h1 className="text-2xl font-bold text-center">방 정보 설정</h1>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="roomName" className="block text-sm font-bold text-gray-600">
                방 이름
              </label>
              <input
                id="roomName" type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)}
                autoComplete="off"
                className="w-full p-2 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label htmlFor="new-password" className="block text-sm font-bold text-gray-600">
                비밀번호 설정
              </label>
              <input
                id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full p-2 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button type="submit" disabled={isLoading} className="w-full py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400">
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