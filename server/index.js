const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const fs = require('fs').promises;
const cron = require('node-cron');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app); 
const PORT = process.env.PORT || 3002;
const dataDir = path.join(__dirname, 'data');
const roomsFilePath = path.join(__dirname, 'rooms.json');
// 서버 시작 시 data 디렉토리 생성
fs.mkdir(dataDir, { recursive: true }).catch(console.error);

// 프로덕션 환경에서 빌드된 클라이언트 파일을 제공합니다.
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuildPath));

function sanitizeFilename(name) {
  // 파일명으로 사용할 수 없는 문자를 밑줄(_)로 대체
  return name.replace(/[\\/:\*\?"<>\|]/g, '_');
}

const generateInviteCode = () => {
  // 간단한 8자리 영문/숫자 코드를 생성합니다.
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// 기획서의 '휘발성 메시지'를 고려하여 DB 대신 인메모리 객체로 방 정보를 관리합니다.
// 서버 재시작 시 모든 데이터는 초기화됩니다.
let rooms = {};

const saveRooms = async () => {
  try {
    const roomsToSave = {};
    for (const roomId in rooms) {
      // users Map은 저장하지 않음 (휘발성 데이터)
      const { users, ...roomData } = rooms[roomId];
      roomsToSave[roomId] = roomData;
    }
    await fs.writeFile(roomsFilePath, JSON.stringify(roomsToSave, null, 2));
  } catch (error) {
    console.error('[State Error] Failed to save rooms state:', error);
  }
};

const loadRooms = async () => {
  try {
    const data = await fs.readFile(roomsFilePath, 'utf-8');
    const loadedRooms = JSON.parse(data);
    // 불러온 방 정보에 실시간 데이터(users)를 위한 Map을 다시 추가
    for (const roomId in loadedRooms) {
      const roomData = loadedRooms[roomId];
      rooms[roomId] = { ...roomData, users: new Map() };

      // 데이터 무결성 검사: 방 메타데이터는 있는데 채팅 로그 파일이 없는 경우, 파일을 새로 생성해줍니다.
      const sanitizedRoomName = sanitizeFilename(roomData.name);
      const filePath = path.join(dataDir, `${sanitizedRoomName}.json`);
      try {
        await fs.access(filePath);
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.warn(`[State Check] Chat log for room '${roomData.name}' was missing. Re-creating file.`);
          await fs.writeFile(filePath, '[]', 'utf-8');
        }
      }
    }
    console.log(`[State] Successfully loaded ${Object.keys(rooms).length} rooms from rooms.json`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('[State] rooms.json 파일을 찾을 수 없어 새로 생성합니다.');
      // 파일이 없으면 빈 객체로 새 파일을 생성합니다.
      await fs.writeFile(roomsFilePath, '{}', 'utf-8');
    } else {
      console.error('[State Error] Failed to load rooms state:', error);
    }
  }
};

/**
 * @description 방장이 새로운 방을 생성하는 엔드포인트
 * @body { password: "방 비밀번호" }
 * @returns { roomId: "생성된 고유 방 ID" }
 */
app.post('/create-room', async (req, res) => {
  const { password, roomName } = req.body;
  if (!password || !roomName) {
    return res.status(400).json({ message: '방 이름과 비밀번호를 모두 입력해주세요.' });
  }

  // 1. 중복된 방 이름(파일 이름)이 있는지 확인하여 데이터 덮어쓰기 방지
  const sanitizedRoomName = sanitizeFilename(roomName);
  const filePath = path.join(dataDir, `${sanitizedRoomName}.json`);

  try {
    await fs.access(filePath);
    // 파일이 존재하면, 에러 응답
    return res.status(409).json({ message: '이미 존재하는 방 이름입니다. 다른 이름을 사용해주세요.' });
  } catch (error) {
    // 파일이 존재하지 않을 때(ENOENT)가 정상적인 경우임. 그 외 에러는 서버 에러로 처리.
    if (error.code !== 'ENOENT') {
      console.error('Error checking file existence:', error);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  }

  const roomId = uuidv4();
  const adminToken = crypto.randomBytes(16).toString('hex');
  
  let inviteCode;
  let isCodeUnique = false;
  // 생성된 초대 코드가 중복되지 않는지 확인
  while (!isCodeUnique) {
    inviteCode = generateInviteCode();
    const codeInUse = Object.values(rooms).some(r => r.inviteCode === inviteCode);
    if (!codeInUse) {
      isCodeUnique = true;
    }
  }

  rooms[roomId] = {
    name: roomName,
    password,
    adminToken,
    inviteCode, // 생성된 초대 코드를 방 정보에 추가
    users: new Map(),
    createdAt: new Date(),
  };

  try {
    // 2. 방 생성 시, 빈 배열을 가진 JSON 파일을 즉시 생성
    await fs.writeFile(filePath, '[]', 'utf-8');
    // 방 상태를 파일에 저장
    await saveRooms();
    console.log(`[File Created] For room: ${roomName}, Path: ${filePath}`);
    console.log(`[Room Created] Name: ${roomName}, ID: ${roomId}`);
    res.status(201).json({ roomId, adminToken, inviteCode });
  } catch (error) {
    console.error('Failed to create chat file:', error);
    delete rooms[roomId]; // 파일 생성 실패 시, 메모리에 만든 방 정보도 삭제
    res.status(500).json({ message: '채팅 로그 파일을 생성하는 데 실패했습니다.' });
  }
});

const broadcastUserList = (roomId) => {
  if (rooms[roomId]) {
    const userList = Array.from(rooms[roomId].users.values());
    io.to(roomId).emit('update_user_list', userList);
  }
};

// 방 폭파 (관리자 전용)
app.delete('/room/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const { adminToken } = req.body;

  const room = rooms[roomId];

  if (!room) {
    return res.status(404).json({ message: '존재하지 않는 방입니다.' });
  }

  if (room.adminToken !== adminToken) {
    return res.status(403).json({ message: '방을 삭제할 권한이 없습니다.' });
  }

  try {
    // 1. 해당 방의 모든 유저에게 방이 폭파되었음을 알리고 연결을 끊음
    io.to(roomId).emit('system_message', '방장에 의해 방이 삭제되었습니다. 3초 후 연결이 종료됩니다.');
    io.to(roomId).disconnectSockets(true);

    // 2. 채팅 로그 파일 삭제
    const sanitizedRoomName = sanitizeFilename(room.name);
    const filePath = path.join(dataDir, `${sanitizedRoomName}.json`);
    await fs.unlink(filePath);

    // 3. 메모리에서 방 정보 삭제
    delete rooms[roomId];
    // 변경된 방 상태를 파일에 저장
    await saveRooms();

    console.log(`[Room Destroyed] ID: ${roomId}, Name: ${room.name}`);
    res.status(200).json({ message: '방이 성공적으로 삭제되었습니다.' });
  } catch (error) {
    console.error(`[Error Destroying Room] ID: ${roomId}`, error);
    res.status(500).json({ message: '방을 삭제하는 중 오류가 발생했습니다.' });
  }
});

// API 라우트 외의 모든 GET 요청을 React 앱으로 전달하여 클라이언트 사이드 라우팅을 지원합니다.
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

const io = new Server(server, {
  cors: {
    origin: '*', // 실제 프로덕션에서는 클라이언트 주소로 제한하세요.
    methods: ['GET', 'POST'],
  },
});

/**
 * @description Socket.io 보안 미들웨어 (가장 중요)
 * 1. 초대 코드(roomId)와 비밀번호 검증
 * 2. 10명 인원 제한 로직
 * 3. 자동 로그인을 위한 세션 토큰 검증
 */
io.use((socket, next) => {
  const { roomId: roomIdentifier, password, sessionToken } = socket.handshake.auth;

  // 1. 세션 토큰으로 재접속하는 경우
  if (sessionToken) {
    const [userId, tokenRoomId] = sessionToken.split(':');
    if (rooms[tokenRoomId]) {
      socket.roomId = tokenRoomId;
      socket.userId = userId;
      return next();
    }
    return next(new Error('Invalid session token.'));
  }

  // 2. 새로운 비밀번호로 접속하는 경우
  let room;
  let actualRoomId = null;

  // 클라이언트가 보낸 식별자(roomIdentifier)가 UUID일 수도, 방 이름일 수도 있음.
  // 먼저 UUID(방의 실제 ID)인지 확인
  if (rooms[roomIdentifier]) {
    actualRoomId = roomIdentifier;
    room = rooms[actualRoomId];
  } else {
    // ID가 아니라면, 방 이름 또는 초대 코드로 검색
    actualRoomId = Object.keys(rooms).find(id => rooms[id].name === roomIdentifier || rooms[id].inviteCode === roomIdentifier);
    if (actualRoomId) {
      room = rooms[actualRoomId];
    }
  }

  if (!room) {
    return next(new Error('존재하지 않는 방입니다.'));
  }

  if (room.password !== password) {
    return next(new Error('비밀번호가 일치하지 않습니다.'));
  }

  if (room.users.size >= 10) {
    return next(new Error('방이 가득 찼습니다 (최대 10명).'));
  }

  // 인증 성공 시, 소켓 객체에 필요한 정보 저장
  socket.roomId = actualRoomId; // 실제 방의 UUID를 저장
  socket.userId = uuidv4(); // 사용자에게 고유 ID 부여
  next();
});

io.on('connection', (socket) => {
  const { roomId, userId } = socket;
  console.log(`[User Connected] User ${userId.substring(0, 5)} connected to room ${roomId.substring(0, 5)}`);

  // 사용자 정보를 Map에 저장 (기본값 설정)
  rooms[roomId].users.set(userId, {
    id: userId,
    nickname: `익명-${userId.substring(0, 5)}`,
    profileImage: null,
  });
  socket.join(roomId);

  // 1. 새로운 사용자가 접속했으므로, 사용자 목록을 모두에게 브로드캐스트
  broadcastUserList(roomId);

  // 클라이언트로부터 프로필 정보를 받아 업데이트
  socket.on('set_profile', ({ nickname, profileImage }) => {
    const room = rooms[roomId];
    if (room && room.users.has(userId)) {
        const userData = room.users.get(userId);
        userData.nickname = nickname;
        userData.profileImage = profileImage;
        broadcastUserList(roomId); // 프로필이 변경되었으므로 사용자 목록 다시 전송
        io.to(roomId).emit('system_message', `'${userData.nickname}'님이 프로필을 업데이트했습니다.`);
    }
  });

  // 사용자가 접속하면 이전 대화 기록을 전송
  (async () => {
    try {
      const roomName = rooms[roomId]?.name;
      if (!roomName) return; // 방 정보가 없으면 중단

      const sanitizedRoomName = sanitizeFilename(roomName);
      const filePath = path.join(dataDir, `${sanitizedRoomName}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const messages = JSON.parse(data);
      // 기록을 현재 접속한 사용자에게만 전송
      socket.emit('chat_history', messages);
    } catch (error) {
      // 파일이 없는 경우 (첫 대화)에는 아무것도 하지 않음
      if (error.code !== 'ENOENT') {
        console.error('Failed to read chat history:', error);
      }
    }
  })();

  // 클라이언트의 자동 로그인을 위해 세션 토큰 발급
  const sessionToken = `${userId}:${roomId}`;
  const roomName = rooms[roomId]?.name;
  const inviteCode = rooms[roomId]?.inviteCode;
  socket.emit('session', { userId, sessionToken, roomName, inviteCode });

  const currentUserData = rooms[roomId].users.get(userId);
  // 다른 사용자에게 입장 알림
  socket.to(roomId).emit('user_joined', { userId, message: `${currentUserData.nickname}님이 입장했습니다.` });

  socket.on('send_message', async (data) => {
    const senderData = rooms[roomId]?.users.get(userId);
    const messageData = {
      userId,
      nickname: senderData?.nickname,
      profileImage: senderData?.profileImage,
      message: data.message,
      timestamp: new Date(),
    };

    // 1. 받은 메시지를 해당 방의 모든 클라이언트에게 전송
    io.to(roomId).emit('receive_message', messageData);

    // 2. 메시지를 파일에 저장
    try {
      const roomName = rooms[roomId]?.name;
      if (!roomName) {
        console.error(`Failed to save message: Room with ID ${roomId} not found.`);
        return;
      }

      const sanitizedRoomName = sanitizeFilename(roomName);
      const filePath = path.join(dataDir, `${sanitizedRoomName}.json`);
      const fileData = await fs.readFile(filePath, 'utf-8');
      const messages = JSON.parse(fileData);
      messages.push(messageData);
      await fs.writeFile(filePath, JSON.stringify(messages, null, 2));
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  });

  // 강퇴 기능 (관리자 전용)
  socket.on('kick_user', async ({ targetUserId, adminToken }) => {
    const room = rooms[roomId];
    if (!room || room.adminToken !== adminToken) {
      // 권한 없음 (오류를 보낸 클라이언트에게만 알림)
      return socket.emit('system_message', '사용자를 강퇴할 권한이 없습니다.');
    }

    if (socket.userId === targetUserId) {
      return socket.emit('system_message', '자기 자신을 강퇴할 수 없습니다.');
    }

    const socketsInRoom = await io.in(roomId).fetchSockets();
    const targetSocket = socketsInRoom.find(s => s.userId === targetUserId);

    if (targetSocket) {
      const targetUserData = rooms[roomId]?.users.get(targetUserId);
      const nickname = targetUserData?.nickname || `사용자(${targetUserId.substring(0, 5)}...)`;
      // 1. 강퇴 대상에게 강퇴 사실 알림
      targetSocket.emit('force_disconnect', '방장에 의해 강퇴당했습니다.');
      // 2. 강퇴 대상 연결 끊기
      targetSocket.disconnect();
      // 3. 방에 있는 다른 사람들에게 알림
      io.to(roomId).emit('system_message', `${nickname}님이 강퇴당했습니다.`);
      // 4. 사용자 목록을 다시 브로드캐스트
      broadcastUserList(roomId);
      console.log(`[User Kicked] User ${targetUserId} from room ${roomId}`);
    } else {
      socket.emit('system_message', '강퇴하려는 사용자를 찾을 수 없습니다.');
    }
  });

  socket.on('disconnect', () => {
    if (rooms[roomId] && rooms[roomId].users.has(userId)) {
      const userData = rooms[roomId].users.get(userId);
      const nickname = userData.nickname;
      rooms[roomId].users.delete(userId);
      console.log(`[User Disconnected] User ${userId.substring(0, 5)} (${nickname}) disconnected from room ${roomId.substring(0, 5)}`);
      // 다른 사용자에게 퇴장 알림
      io.to(roomId).emit('user_left', { userId, message: `${nickname}님이 퇴장했습니다.` });
      // 사용자가 나갔으므로, 사용자 목록을 모두에게 브로드캐스트
      broadcastUserList(roomId);
    }
  });
});

// 하루(24시간)가 지난 채팅 로그 파일을 자동으로 삭제하는 스케줄러
// 매 시간 정각에 실행됩니다.
cron.schedule('0 * * * *', async () => {
  console.log('[Scheduler] Running job to delete old chat files...');
  try {
    const files = await fs.readdir(dataDir);
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

    for (const file of files) {
      // .json 파일만 대상으로 함
      if (path.extname(file) !== '.json') continue;

      const filePath = path.join(dataDir, file);
      try {
        const stats = await fs.stat(filePath);
        // 파일 생성 시간(birthtime)이 24시간보다 오래되었으면, 파일 내용은 비우고 파일 자체는 유지합니다.
        if (stats.birthtime.getTime() < twentyFourHoursAgo) {
          await fs.writeFile(filePath, '[]', 'utf-8');
          console.log(`[Scheduler] Cleared chat history for old room: ${file}`);
        }
      } catch (statError) {
        console.error(`[Scheduler] Could not stat file ${file}:`, statError);
      }
    }
  } catch (readDirError) {
    console.error('[Scheduler] Failed to read data directory:', readDirError);
  }
});

const startServer = async () => {
  // 서버가 시작되기 전에 파일에서 방 정보를 불러옵니다.
  await loadRooms();
  server.listen(PORT, () => {
    console.log(`✅ NaTalk Server is running on http://localhost:${PORT}`);
  });
};

// 서버 시작
startServer();