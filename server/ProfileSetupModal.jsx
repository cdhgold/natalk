import React, { useState } from 'react';

const ProfileSetupModal = ({ socket, onClose }) => {
  const [nickname, setNickname] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (nickname.trim() && socket) {
      // 서버의 'set_profile' 이벤트에 맞춰 닉네임만 전송합니다.
      socket.emit('set_profile', { nickname: nickname.trim() });
      onClose(); // 제출 후 모달을 닫습니다.
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2>프로필 설정</h2>
        <p>채팅방에서 사용할 닉네임을 입력해주세요.</p>
        <p style={styles.subText}>프로필 이미지는 자동으로 설정됩니다.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임 (2~10자)"
            style={styles.input}
            minLength="2"
            maxLength="10"
            autoFocus
            required
          />
          <button type="submit" style={styles.button}>
            입장하기
          </button>
        </form>
      </div>
    </div>
  );
};

// 간단한 인라인 스타일
const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#fff',
    padding: '24px',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '320px',
    textAlign: 'center',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  subText: {
    fontSize: '14px',
    color: '#666',
    marginTop: '-10px',
    marginBottom: '20px',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px',
    marginBottom: '20px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    fontSize: '16px',
  },
  button: {
    width: '100%',
    padding: '12px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#007bff',
    color: 'white',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
  },
};

export default ProfileSetupModal;