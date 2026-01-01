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

// --- 경로 재구성 시작 ---
const PROJECT_ROOT = path.resolve(__dirname, '..');
const dataDir = path.join(__dirname, 'data');
const roomsFilePath = path.join(__dirname, 'rooms.json');
fs.mkdir(dataDir, { recursive: true }).catch(console.error);

const clientBuildPath = path.join(PROJECT_ROOT, 'client', 'dist');
const clientPublicPath = path.join(PROJECT_ROOT, 'client', 'public');

// 프로덕션 환경에서 첫 페이지로 intro.html을 제공합니다.
// express.static보다 먼저 와야 루트 경로('/') 요청을 가로챌 수 있습니다.
app.get('/', (req, res) => {
  res.sendFile(path.join(clientPublicPath, 'intro.html'));
});

// 정적 파일 제공
app.use(express.static(clientBuildPath));
app.use(express.static(clientPublicPath));
// --- 경로 재구성 끝 ---


function sanitizeFilename(name) {
  return name.replace(/[\\/:*"<>\|]/g, '_');
}

const generateInviteCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

let rooms = {};
const activeAdmins = new Map();

const saveRooms = async () => {
  try {
    const roomsToSave = {};
    for (const roomId in rooms) {
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
        users: new Map(), 
        userProfiles: roomData.userProfiles || {},
      };
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
  const { password, roomName, email } = req.body;
  if (!password || !roomName || !email) {
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
    if (!isCodeUnique) isCodeUnique = true;
  }

  rooms[roomId] = {
    name: roomName,
    password,
    ownerEmail: email,
    inviteCode,
    hostId: null,
    users: new Map(),
    userProfiles: {},
    createdAt: new Date(),
  };

  try {
    await fs.writeFile(filePath, '[]', 'utf-8');
    await saveRooms();
    console.log(`[File Created] For room: ${roomName}, Path: ${filePath}`);
    console.log(`[Room Created] Name: ${roomName}, ID: ${roomId}, Owner Email: ${email}`);
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
  console.warn(`[Security] HTTP DELETE /room/${req.params.roomId} is deprecated. Use socket event 'destroy_room'.`);
  res.status(403).json({ message: 'This endpoint is deprecated for security reasons.'});
});

app.get('/api/rooms-status', (req, res) => {
  const roomStatuses = Object.entries(rooms).map(([roomId, room]) => ({
    roomId,
    name: room.name,
    userCount: room.users.size,
    isActive: room.users.size > 0,
  }));
  res.status(200).json(roomStatuses);
});

// React 앱으로 라우팅을 위임합니다.
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

io.use((socket, next) => {
  const { roomIdentifier, password, email, sessionToken } = socket.handshake.auth;
  socket.isAdmin = false;

  if (sessionToken) {
    const [userId, tokenRoomId] = sessionToken.split(':');
    const room = rooms[tokenRoomId];
    if (room && room.userProfiles && room.userProfiles[userId]) {
      console.log(`[Session] Reconnecting user ${userId.substring(0,5)} to room ${tokenRoomId.substring(0,5)}`);
      socket.roomId = tokenRoomId;
      socket.userId = userId;
      if (room.hostId === userId) {
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

  if (email) {
    if (room.ownerEmail === email) {
      if (activeAdmins.has(actualRoomId)) {
        console.log(`[Host Login Denied] Host already active for room ${actualRoomId.substring(0,5)}`);
        return next(new Error('The room owner is already logged in from another device.'));
      }

      const adminPersistentId = crypto.createHash('sha256').update(email).digest('hex');
      socket.userId = adminPersistentId;

      socket.isAdmin = true;
      room.hostId = socket.userId;
      activeAdmins.set(actualRoomId, socket.userId);
      saveRooms();
      console.log(`[Host Login] User ${socket.userId.substring(0,5)} logged in as host for room ${actualRoomId.substring(0,5)}`);
      return next();
    } else {
      return next(new Error('Incorrect email for room owner.'));
    }
  }

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

  if (!userProfile || !userProfile.nickname) {
    const randomImageIndex = Math.floor(Math.random() * 11) + 1;
    const randomProfileImage = `/profile${randomImageIndex}.png`;

    if (!room.userProfiles[userId]) {
        room.userProfiles[userId] = {};
    }
    room.userProfiles[userId].profileImage = randomProfileImage;
    userProfile = room.userProfiles[userId];
    saveRooms();
  }

  room.users.set(userId, {
    id: userId,
    nickname: userProfile.nickname || `User-${userId.substring(0, 5)}`,
    profileImage: userProfile.profileImage,
    isAdmin: isAdmin
  });
  socket.join(roomId);

  broadcastUserList(roomId);

  socket.on('set_profile', async ({ nickname }, callback) => {
    if (room.users.has(userId)) {
      const isNicknameTaken = Array.from(room.users.values()).some(
        (user) => user.nickname === nickname && user.id !== userId
      );

      if (isNicknameTaken) {
        if (typeof callback === 'function') {
          callback({ success: false, message: `닉네임 "${nickname}"은(는) 이미 사용 중입니다.` });
        }
        return;
      }

      const userData = room.users.get(userId);
      userData.nickname = nickname;

      if (!room.userProfiles[userId]) room.userProfiles[userId] = {};
      room.userProfiles[userId].nickname = nickname;
      
      userData.profileImage = room.userProfiles[userId].profileImage;

      await saveRooms();
      broadcastUserList(roomId);
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
    isAdmin: isAdmin
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

  socket.on('kick_user', async ({ targetUserId }) => {
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
      if (isAdmin && activeAdmins.get(roomId) === userId) {
        activeAdmins.delete(roomId);
        console.log(`[Host Left] Room: ${roomId.substring(0, 5)}. Now available for new host login.`);
      }

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
