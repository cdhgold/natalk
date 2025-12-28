import React, { useState, useRef } from 'react';

export function ProfileSetupModal({ onProfileSet }) {
  const [nickname, setNickname] = useState('');
  const [profileImage, setProfileImage] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // 최소 사이즈(48x48) 강제
        if (img.width < 48 || img.height < 48) {
          setError('프로필 이미지는 최소 48x48 픽셀 이상이어야 합니다.');
          setProfileImage(null);
          if(fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
        setError('');
        // 이미지를 표준 사이즈(96x96)로 리사이징하여 데이터 URL로 변환
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 96, 96);
        setProfileImage(canvas.toDataURL('image/jpeg'));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }
    onProfileSet({ nickname, profileImage });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-sm mx-4">
        <h2 className="text-2xl font-bold mb-6 text-center">프로필 설정</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col items-center">
            <label htmlFor="profile-image-upload" className="cursor-pointer">
              <img
                src={profileImage || `https://i.pravatar.cc/96?u=default`}
                alt="Profile Preview"
                className="w-24 h-24 rounded-full object-cover border-2 border-gray-300 hover:border-blue-500"
              />
            </label>
            <input
              id="profile-image-upload" type="file" accept="image/*"
              onChange={handleImageChange} ref={fileInputRef} className="hidden"
            />
            <span className="text-sm text-gray-500 mt-2">이미지를 클릭하여 변경</span>
          </div>
          <div>
            <label htmlFor="nickname" className="block text-sm font-bold text-gray-700 mb-1">닉네임</label>
            <input
              id="nickname" type="text" value={nickname} onChange={(e) => setNickname(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="사용할 닉네임을 입력하세요" required
            />
          </div>
          {error && <p className="text-sm text-center text-red-500">{error}</p>}
          <button type="submit" className="w-full py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700">채팅 시작하기</button>
        </form>
      </div>
    </div>
  );
}