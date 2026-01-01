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
fs.mkdir(dataDir, { recursive: true }).catch(console.error);

const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuildPath));

// client/public 폴더의 정적 파일(프로필 이미지 등)을 제공하기 위해 추가합니다.
// 이렇게 하면 /default-avatar.png 같은 경로로 클라이언트에서 이미지를 요청할 수 있습니다.
const clientPublicPath = path.join(__dirname, '..', 'client', 'public');
app.use(express.static(clientPublicPath));

function sanitizeFilename(name) {
  return name.replace(/[\\/:\*\?"<>\|]/g, '_');
}

const generateInviteCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

let rooms = {};
// 현재 접속 중인 방장 목록을 관리하는 휘발성 데이터
// { roomId -> hostUserId }
const activeAdmins = new Map();

const saveRooms = async () => {
  try {
    const roomsToSave = {};
    for (const roomId in rooms) {
      // users 맵과 같은 휘발성 데이터는 제외하고 저장
      const { users, ...roomData } = rooms[roomId];
      if (!roomData.userProfiles) {
        roomData.userProfiles = {};
      }
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
    for (const roomId in loadedRooms) {
      const roomData = loadedRooms[roomId];
      rooms[roomId] = {
        ...roomData,
        // 서버 시작 시 모든 방의 접속자 목록은 비어있음
        users: new Map(), 
        userProfiles: roomData.userProfiles || {},
      };
      // 방 채팅 로그 파일 확인 및 생성
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
      console.log('[State] rooms.json not found, creating a new one.');
      await fs.writeFile(roomsFilePath, '{}', 'utf-8');
    } else {
      console.error('[State Error] Failed to load rooms state:', error);
    }
  }
};

app.post('/create-room', async (req, res) => {
  const { password, roomName, email } = req.body; // 'email' 추가
  if (!password || !roomName || !email) { // 'email' 필드 검증
    return res.status(400).json({ message: 'Room name, password, and email are required.' });
  }

  const sanitizedRoomName = sanitizeFilename(roomName);
  const filePath = path.join(dataDir, `${sanitizedRoomName}.json`);

  try {
    await fs.access(filePath);
    return res.status(409).json({ message: 'Room name already exists. Please use a different name.' });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error checking file existence:', error);
      return res.status(500).json({ message: 'A server error occurred.' });
    }
  }

  const roomId = uuidv4();
  
  let inviteCode;
  let isCodeUnique = false;
  while (!isCodeUnique) {
    inviteCode = generateInviteCode();
    const codeInUse = Object.values(rooms).some(r => r.inviteCode === inviteCode);
    if (!codeInUse) isCodeUnique = true;
  }

  rooms[roomId] = {
    name: roomName,
    password,
    ownerEmail: email, // 방장 이메일 저장
    inviteCode,
    hostId: null, // hostId는 이제 사용되지 않거나 다른 용도로 사용될 수 있음
    users: new Map(),
    userProfiles: {},
    createdAt: new Date(),
  };

  try {
    await fs.writeFile(filePath, '[]', 'utf-8');
    await saveRooms();
    console.log(`[File Created] For room: ${roomName}, Path: ${filePath}`);
    console.log(`[Room Created] Name: ${roomName}, ID: ${roomId}, Owner Email: ${email}`);
    // creationToken은 더 이상 반환하지 않음
    res.status(201).json({ roomId, inviteCode });
  } catch (error) {
    console.error('Failed to create chat file:', error);
    delete rooms[roomId];
    res.status(500).json({ message: 'Failed to create chat log file.' });
  }
});

const broadcastUserList = (roomId) => {
  if (rooms[roomId]) {
    const userList = Array.from(rooms[roomId].users.values());
    io.to(roomId).emit('update_user_list', userList);
  }
};

app.delete('/room/:roomId', async (req, res) => {
  // 방 삭제 로직은 이제 소켓 이벤트(방장만 가능)로 처리하는 것이 더 안전함
  // HTTP DELETE는 더 이상 사용하지 않거나, 매우 강력한 인증(예: JWT) 필요
  // 여기서는 기능을 유지하되, 콘솔에 경고를 출력
  console.warn(`[Security] HTTP DELETE /room/${req.params.roomId} is deprecated. Use socket event 'destroy_room'.`);
  const { roomId } = req.params;
  // adminToken 대신 hostId를 확인해야 하나, HTTP 요청에서는 사용자 식별이 어려움.
  // 따라서 이 엔드포인트는 사실상 사용 불가 상태가 되어야 함.
  // 기능적으로 남겨두지만, 실제 운영에서는 제거하거나 재설계 필요.
  res.status(403).json({ message: 'This endpoint is deprecated for security reasons.'});
});

// 방 목록 및 현재 활성화 상태(접속자 수)를 반환하는 API 엔드포인트
app.get('/api/rooms-status', (req, res) => {
  const roomStatuses = Object.entries(rooms).map(([roomId, room]) => ({
    // 민감한 정보(password, ownerEmail 등)는 제외하고 필요한 정보만 반환합니다.
    roomId,
    name: room.name,
    userCount: room.users.size,
    isActive: room.users.size > 0,
  }));
  res.status(200).json(roomStatuses);
});


app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

io.use((socket, next) => {
  const { roomIdentifier, password, email, sessionToken } = socket.handshake.auth;
  socket.isAdmin = false;

  // 세션 토큰이 있으면, 재접속으로 간주하고 우선 처리
  if (sessionToken) {
    const [userId, tokenRoomId] = sessionToken.split(':');
    const room = rooms[tokenRoomId];
    // 서버 재시작 등으로 room.userProfiles가 없을 수 있으므로 안전하게 체크
    if (room && room.userProfiles && room.userProfiles[userId]) {
      console.log(`[Session] Reconnecting user ${userId.substring(0,5)} to room ${tokenRoomId.substring(0,5)}`);
      socket.roomId = tokenRoomId;
      socket.userId = userId;
      // 재접속 시 방장 여부 다시 확인
      if (room.hostId === userId) {
        // 방장이 재접속하는 경우, activeAdmins에 다시 등록
        if (activeAdmins.has(tokenRoomId) && activeAdmins.get(tokenRoomId) !== userId) {
          console.log(`[Host Reconnect Denied] Host already active for room ${tokenRoomId.substring(0,5)}`);
          return next(new Error('The room owner is already logged in from another device.'));
        }
        socket.isAdmin = true;
        activeAdmins.set(tokenRoomId, userId);
      }
      return next();
    }
  }

  let room;
  let actualRoomId = null;

  if (rooms[roomIdentifier]) {
    actualRoomId = roomIdentifier;
    room = rooms[actualRoomId];
  } else {
    actualRoomId = Object.keys(rooms).find(id => rooms[id].name === roomIdentifier || rooms[id].inviteCode === roomIdentifier);
    if (actualRoomId) room = rooms[actualRoomId];
  }
  
  if (!room) return next(new Error('The room does not exist.'));
  if (room.users.size >= 10) return next(new Error('The room is full (max 10 people).'));

  socket.roomId = actualRoomId;

  // 방장 로그인 시도
  if (email) {
    if (room.ownerEmail === email) {
      // 이미 다른 기기에서 방장이 접속해 있는지 확인
      if (activeAdmins.has(actualRoomId)) {
        console.log(`[Host Login Denied] Host already active for room ${actualRoomId.substring(0,5)}`);
        return next(new Error('The room owner is already logged in from another device.'));
      }

      // 방장은 이메일 기반의 영구 ID를 사용. 이를 통해 프로필 정보를 유지.
      const adminPersistentId = crypto.createHash('sha256').update(email).digest('hex');
      socket.userId = adminPersistentId;

      // 이메일이 일치하면 방장으로 인정
      socket.isAdmin = true;
      room.hostId = socket.userId; // 현재 접속의 userId를 방장으로 설정
      activeAdmins.set(actualRoomId, socket.userId); // 현재 접속중인 방장으로 등록
      saveRooms(); // 방장 ID 변경사항 저장
      console.log(`[Host Login] User ${socket.userId.substring(0,5)} logged in as host for room ${actualRoomId.substring(0,5)}`);
      return next();
    } else {
      return next(new Error('Incorrect email for room owner.'));
    }
  }

  // 게스트 로그인 시도
  // 게스트는 세션 토큰이 없는 한, 매번 새로운 임시 ID를 발급받음.
  socket.userId = uuidv4();
  if (room.password !== password) return next(new Error('Incorrect password.'));
  
  next();
});

io.on('connection', (socket) => {
  const { roomId, userId, isAdmin } = socket;
  const room = rooms[roomId];

  if (!room) {
    console.error(`[Connection Error] Room ${roomId} not found for user ${userId}`);
    return socket.disconnect();
  }
  
  console.log(`[User Connected] User ${userId.substring(0, 5)} to room ${roomId.substring(0, 5)}. Host: ${isAdmin}`);

  let userProfile = room.userProfiles?.[userId];

  // If user has no profile or no nickname, set up a new one with a random avatar.
  if (!userProfile || !userProfile.nickname) {
    const randomImageIndex = Math.floor(Math.random() * 11) + 1;
    const randomProfileImage = `/profile${randomImageIndex}.png`;

    if (!room.userProfiles[userId]) {
        room.userProfiles[userId] = {};
    }
    room.userProfiles[userId].profileImage = randomProfileImage;
    userProfile = room.userProfiles[userId];
    saveRooms(); // Save the randomly assigned profile image immediately.
  }

  room.users.set(userId, {
    id: userId,
    nickname: userProfile.nickname || `User-${userId.substring(0, 5)}`,
    profileImage: userProfile.profileImage,
    isAdmin: isAdmin // 유저리스트에 방장 여부 포함
  });
  socket.join(roomId);

  broadcastUserList(roomId);

  socket.on('set_profile', async ({ nickname }, callback) => {
    if (room.users.has(userId)) {
      // 닉네임 중복 체크: 현재 방의 다른 사용자가 이미 사용 중인 닉네임인지 확인합니다.
      const isNicknameTaken = Array.from(room.users.values()).some(
        (user) => user.nickname === nickname && user.id !== userId
      );

      if (isNicknameTaken) {
        // 닉네임이 중복되면 콜백을 통해 클라이언트에게 실패를 알립니다.
        if (typeof callback === 'function') {
          callback({ success: false, message: `닉네임 "${nickname}"은(는) 이미 사용 중입니다.` });
        }
        return; // 여기서 처리를 중단합니다.
      }

      const userData = room.users.get(userId);
      userData.nickname = nickname;

      if (!room.userProfiles[userId]) room.userProfiles[userId] = {};
      room.userProfiles[userId].nickname = nickname;
      
      userData.profileImage = room.userProfiles[userId].profileImage;

      await saveRooms();
      broadcastUserList(roomId);
      // 성공적으로 처리되었음을 콜백으로 알립니다.
      if (typeof callback === 'function') {
        callback({ success: true });
      }
    }
  });

  (async () => {
    try {
      const sanitizedRoomName = sanitizeFilename(room.name);
      const filePath = path.join(dataDir, `${sanitizedRoomName}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      socket.emit('chat_history', JSON.parse(data));
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Failed to read chat history:', error);
    }
  })();

  const sessionToken = `${userId}:${roomId}`;
  const currentUserData = room.users.get(userId);

  socket.emit('session', { 
    userId, sessionToken, 
    roomName: room.name, 
    inviteCode: room.inviteCode, 
    nickname: currentUserData.nickname, 
    profileImage: currentUserData.profileImage, 
    isAdmin: isAdmin // 클라이언트에게 방장 여부 명시적으로 전달
  });

  socket.on('send_message', async (data) => {
    const senderData = room.users.get(userId);
    const messageData = {
      userId,
      nickname: senderData?.nickname,
      profileImage: senderData?.profileImage,
      message: data.message,
      timestamp: new Date(),
    };
    io.to(roomId).emit('receive_message', messageData);
    try {
      const sanitizedRoomName = sanitizeFilename(room.name);
      const filePath = path.join(dataDir, `${sanitizedRoomName}.json`);
      const fileData = await fs.readFile(filePath, 'utf-8');
      const messages = JSON.parse(fileData);
      messages.push(messageData);
      await fs.writeFile(filePath, JSON.stringify(messages, null, 2));
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  });

  // 'claim_admin' 이벤트는 더 이상 필요 없으므로 삭제
  // socket.on('claim_admin', ...);

  socket.on('kick_user', async ({ targetUserId }) => {
    // 이제 adminToken 대신 소켓의 isAdmin 플래그를 신뢰
    if (!socket.isAdmin) {
      return socket.emit('system_message', 'You do not have permission to kick users.');
    }
    if (socket.userId === targetUserId) {
      return socket.emit('system_message', 'You cannot kick yourself.');
    }
    const socketsInRoom = await io.in(roomId).fetchSockets();
    const targetSocket = socketsInRoom.find(s => s.userId === targetUserId);
    if (targetSocket) {
      const nickname = room.users.get(targetUserId)?.nickname || `A user`;
      targetSocket.emit('force_disconnect', 'You have been kicked by the host.');
      targetSocket.disconnect();
      io.to(roomId).emit('system_message', `${nickname} has been kicked.`);
      // 유저리스트 업데이트는 disconnect 이벤트에서 자동으로 처리됨
    } else {
      socket.emit('system_message', 'The user to be kicked could not be found.');
    }
  });

  socket.on('destroy_room', async () => {
    if (!socket.isAdmin) {
      return socket.emit('system_message', 'You do not have permission to destroy this room.');
    }
    
    try {
      io.to(roomId).emit('system_message', 'The host has destroyed the room. Disconnecting in 3 seconds.');
      // 모든 클라이언트의 연결을 강제로 끊기 전에 메시지 전송 보장
      setTimeout(async () => {
        io.to(roomId).disconnectSockets(true);

        const sanitizedRoomName = sanitizeFilename(room.name);
        const filePath = path.join(dataDir, `${sanitizedRoomName}.json`);
        await fs.unlink(filePath);
    
        delete rooms[roomId];
        await saveRooms();
    
        console.log(`[Room Destroyed] ID: ${roomId}, Name: ${room.name}`);
      }, 3000);

    } catch (error) {
      console.error(`[Error Destroying Room] ID: ${roomId}`, error);
      socket.emit('system_message', 'An error occurred while destroying the room.');
    }
  });


  socket.on('disconnect', () => {
    if (room && room.users.has(userId)) {
      // 만약 접속을 종료하는 유저가 방장이었다면, activeAdmins 맵에서 제거
      if (isAdmin && activeAdmins.get(roomId) === userId) {
        activeAdmins.delete(roomId);
        console.log(`[Host Left] Room: ${roomId.substring(0, 5)}. Now available for new host login.`);
      }

      // 방장이 나가도 방은 유지됨. 방장직도 유지됨.
      const nickname = room.users.get(userId)?.nickname;
      room.users.delete(userId);
      console.log(`[User Disconnected] User ${userId.substring(0, 5)} (${nickname}) disconnected`);
      broadcastUserList(roomId);
    }
  });
});

cron.schedule('0 * * * *', async () => {
  console.log('[Scheduler] Running job to delete old chat files...');
  try {
    const files = await fs.readdir(dataDir);
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    for (const file of files) {
      if (path.extname(file) !== '.json') continue;
      const filePath = path.join(dataDir, file);
      try {
        const stats = await fs.stat(filePath);
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
  await loadRooms();
  server.listen(PORT, () => {
    console.log(`✅ NaTalk Server is running on http://localhost:${PORT}`);
  });
};

startServer();