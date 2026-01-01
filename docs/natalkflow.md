# NaTalk 프로젝트 기술 워크플로우

이 문서는 NaTalk 프로젝트의 내부 동작 방식, 데이터 흐름, 그리고 핵심 기술 아키텍처를 설명합니다.

## 1. 개요

NaTalk은 소규모 그룹을 위한 비공개 실시간 채팅 서비스입니다. 서버는 Node.js와 Socket.IO를 기반으로 하며, 클라이언트는 React로 구현되었습니다. 데이터는 서버 로컬 파일 시스템에 JSON 형태로 저장되어 별도의 데이터베이스 없이 운영됩니다.

## 2. 주요 기술 스택

-   **Backend**: Node.js, Express, Socket.IO
-   **Frontend**: React, Vite, Tailwind CSS
-   **Data Persistence**: JSON files

## 3. 프로젝트 구조

-   `server/`: 백엔드 서버 관련 파일
    -   `index.js`: Express 서버 설정, Socket.IO 로직, API 엔드포인트 등 모든 백엔드 로직 포함.
    -   `rooms.json`: 생성된 모든 방의 메타데이터(비밀번호, 관리자 토큰, 프로필 정보 등)를 저장하는 영구 파일.
    -   `data/`: 각 방의 실제 대화 내용이 저장되는 폴더. 방 이름에 따라 `[방이름].json` 파일로 생성됨.
-   `client/`: 프론트엔드 React 애플리케이션
    -   `src/components/`: `ChatRoom.jsx`, `LoginForm.jsx`, `ProfileSetupModal.jsx` 등 주요 UI 컴포넌트.
-   `docs/`: 프로젝트 관련 문서

## 4. 핵심 데이터 흐름 (Core Data Flow)

### 4.1. 방 생성 (Room Creation)

1.  **[Client]** 사용자가 방 이름과 비밀번호를 입력하고 '방 만들기'를 요청합니다.
2.  **[Client]** `POST /create-room` API로 서버에 방 생성을 요청합니다.
3.  **[Server]** 요청을 받아 방 이름 중복 여부를 확인합니다.
4.  **[Server]** 고유한 `roomId`, `adminToken`, `inviteCode`를 생성합니다.
5.  **[Server]** `rooms` 인메모리 객체에 새로운 방 정보를 추가합니다.
6.  **[Server]** `data/[방이름].json` 경로에 빈 대화 로그 파일을 생성합니다.
7.  **[Server]** `saveRooms()` 함수를 호출하여 `rooms.json` 파일에 현재 방 메타데이터를 저장합니다.
8.  **[Server]** 클라이언트에게 `roomId`, `adminToken`, `inviteCode`를 응답으로 보냅니다.
9.  **[Client]** 응답으로 받은 `adminToken`을 `localStorage`에 저장하여 방장임을 증명하는 데 사용합니다.

### 4.2. 사용자 접속 및 인증 (Connection & Authentication)

1.  **[Client]** 사용자가 방 이름(또는 초대코드)과 비밀번호를 입력하여 입장을 시도합니다.
2.  **[Client]** `socket.io-client`가 `auth` 옵션에 인증 정보(`roomIdentifier`, `password`)를 담아 서버에 연결을 시도합니다.
3.  **[Server]** `io.use()` 미들웨어가 모든 새로운 연결 요청을 가로챕니다.
4.  **[Server]** **(재접속 시)** 만약 `auth` 객체에 `sessionToken`이 있다면, 토큰을 파싱하여 유효성을 검증하고 바로 연결을 허용합니다.
5.  **[Server]** **(신규 접속 시)** `roomIdentifier`를 통해 `rooms` 객체에서 실제 방 정보를 찾습니다.
6.  **[Server]** 비밀번호 일치 여부와 방의 현재 인원(최대 10명)을 확인합니다.
7.  **[Server]** 모든 검증을 통과하면, 사용자에게 고유한 `userId`를 발급하고 `socket` 객체에 `roomId`, `userId`를 저장한 뒤 `next()`를 호출하여 연결을 승인합니다.
8.  **[Server]** 검증에 실패하면 `next(new Error('...'))`를 호출하여 연결을 거부합니다.
9.  **[Client]** 연결이 거부되면 `connect_error` 이벤트가 발생하며, 사용자에게 오류 메시지를 표시합니다.

### 4.3. 프로필 설정 및 닉네임 중복 검사

1.  **[Server]** 사용자가 성공적으로 연결되면, 서버는 `connection` 이벤트 핸들러 내부에서 해당 사용자의 프로필 정보를 `rooms.json`에서 조회합니다.
2.  **[Server]** 프로필이 없으면 기본값(`익명-xxxxx`)으로 닉네임을 설정하고, `session` 이벤트를 통해 사용자 정보를 클라이언트에 전송합니다.
3.  **[Client]** `ChatRoom.jsx`에서 `session` 이벤트를 수신하고, 닉네임이 기본값 형태이면 `ProfileSetupModal`을 화면에 표시합니다.
4.  **[Client]** 사용자가 모달에 새 닉네임을 입력하고 '입장하기'를 클릭합니다.
5.  **[Client]** `socket.emit('set_profile', { nickname }, (response) => { ... })` 형태로 서버에 닉네임 변경을 요청하며, 결과를 처리할 **콜백 함수**를 함께 전달합니다.
6.  **[Server]** `set_profile` 이벤트 핸들러는 요청받은 닉네임이 현재 방에서 이미 사용 중인지 검사합니다.
7.  **[Server]** **(중복 시)** `callback({ success: false, message: '...' })`을 호출하여 실패를 즉시 알립니다.
8.  **[Server]** **(성공 시)** 사용자의 닉네임을 인메모리(`rooms[roomId].users`)와 영구 데이터(`rooms[roomId].userProfiles`)에 모두 업데이트하고 `saveRooms()`를 호출합니다. 그 후 `callback({ success: true })`을 호출하여 성공을 알립니다.
9.  **[Client]** 콜백 함수는 서버의 응답에 따라 모달을 닫거나(`success: true`), 모달 내에 오류 메시지를 표시(`success: false`)합니다.

### 4.4. 메시지 전송 및 저장

1.  **[Client]** 사용자가 메시지를 입력하고 '전송' 버튼을 클릭합니다.
2.  **[Client]** `socket.emit('send_message', { message })` 이벤트를 서버로 보냅니다.
3.  **[Server]** `send_message` 핸들러는 메시지 데이터에 보낸 사람의 정보(`userId`, `nickname`, `profileImage`)와 타임스탬프를 추가합니다.
4.  **[Server]** `io.to(roomId).emit('receive_message', messageData)`를 통해 해당 방의 모든 클라이언트에게 메시지를 브로드캐스트합니다.
5.  **[Server]** 해당 방의 로그 파일(`data/[방이름].json`)을 읽어와 새 메시지를 추가하고 다시 파일에 씁니다.

## 5. 데이터 관리 (Data Management)

NaTalk은 두 가지 종류의 데이터를 관리합니다.

### 5.1. 인메모리 데이터 (Volatile)

-   **`rooms` 객체**: 서버가 실행되는 동안 모든 방의 정보를 담고 있는 핵심 객체입니다.
-   **`rooms[roomId].users` (Map)**: 특정 방에 **현재 접속 중인** 사용자들의 실시간 정보를 저장하는 `Map` 객체입니다. 사용자가 접속을 종료하면 여기서 삭제됩니다. 이 데이터는 서버 재시작 시 초기화됩니다.

### 5.2. 영구 데이터 (Persistent)

-   **`rooms.json`**: 방의 '설정'과 관련된 데이터를 저장합니다.
    -   포함되는 정보: `name`, `password`, `adminToken`, `inviteCode`, `createdAt`, `userProfiles` 등.
    -   `userProfiles` 객체는 `userId`를 키로 하여 사용자의 닉네임, 프로필 이미지, '다시 보지 않기' 설정 등 한 번 설정하면 유지되어야 하는 정보를 영구적으로 저장합니다.
    -   `saveRooms()` 함수가 호출될 때마다 파일에 덮어씌워집니다.
-   **`data/[방이름].json`**: 각 방의 실제 대화 내용(채팅 로그)이 배열 형태로 저장됩니다. 메시지가 전송될 때마다 이 파일에 추가됩니다.

## 6. 주요 이벤트 및 API

### Socket.IO Events

-   `set_profile ({ nickname }, callback)`: 닉네임을 설정하고 중복 검사 결과를 콜백으로 받음.
-   `send_message ({ message })`: 채팅 메시지를 서버로 전송.
-   `receive_message (messageData)`: 서버로부터 새로운 메시지를 수신.
-   `update_user_list (userList)`: 참여자 목록이 변경될 때마다 서버로부터 목록을 수신.
-   `chat_history (messages)`: 방에 처음 접속했을 때 이전 대화 기록을 수신.
-   `system_message (text)`: 공지, 강퇴 등 시스템 관련 메시지를 수신.
-   `kick_user ({ targetUserId, adminToken })`: 방장이 특정 사용자를 강퇴시킬 때 사용.

### REST API

-   `POST /create-room`: 새로운 방을 생성.
-   `DELETE /room/:roomId`: 방장이 방을 삭제(폭파).

# NaTalk 프로젝트 기술 워크플로우

이 문서는 NaTalk 프로젝트의 내부 동작 방식, 데이터 흐름, 그리고 핵심 기술 아키텍처를 설명합니다.

## 1. 개요

NaTalk은 소규모 그룹을 위한 비공개 실시간 채팅 서비스입니다. 서버는 Node.js와 Socket.IO를 기반으로 하며, 클라이언트는 React로 구현되었습니다. 데이터는 서버 로컬 파일 시스템에 JSON 형태로 저장되어 별도의 데이터베이스 없이 운영됩니다.

## 2. 주요 기술 스택

-   **Backend**: Node.js, Express, Socket.IO
-   **Frontend**: React, Vite, Tailwind CSS
-   **Data Persistence**: JSON files

## 3. 프로젝트 구조

-   `server/`: 백엔드 서버 관련 파일
    -   `index.js`: Express 서버 설정, Socket.IO 로직, API 엔드포인트 등 모든 백엔드 로직 포함.
    -   `rooms.json`: 생성된 모든 방의 메타데이터(비밀번호, 관리자 토큰, 프로필 정보 등)를 저장하는 영구 파일.
    -   `data/`: 각 방의 실제 대화 내용이 저장되는 폴더. 방 이름에 따라 `[방이름].json` 파일로 생성됨.
-   `client/`: 프론트엔드 React 애플리케이션
    -   `src/components/`: `ChatRoom.jsx`, `LoginForm.jsx`, `ProfileSetupModal.jsx` 등 주요 UI 컴포넌트.
-   `docs/`: 프로젝트 관련 문서

## 4. 핵심 데이터 흐름 (Core Data Flow)

### 4.1. 방 생성 (Room Creation)

1.  **[Client]** 사용자가 방 이름과 비밀번호를 입력하고 '방 만들기'를 요청합니다.
2.  **[Client]** `POST /create-room` API로 서버에 방 생성을 요청합니다.
3.  **[Server]** 요청을 받아 방 이름 중복 여부를 확인합니다.
4.  **[Server]** 고유한 `roomId`, `adminToken`, `inviteCode`를 생성합니다.
5.  **[Server]** `rooms` 인메모리 객체에 새로운 방 정보를 추가합니다.
6.  **[Server]** `data/[방이름].json` 경로에 빈 대화 로그 파일을 생성합니다.
7.  **[Server]** `saveRooms()` 함수를 호출하여 `rooms.json` 파일에 현재 방 메타데이터를 저장합니다.
8.  **[Server]** 클라이언트에게 `roomId`, `adminToken`, `inviteCode`를 응답으로 보냅니다.
9.  **[Client]** 응답으로 받은 `adminToken`을 `localStorage`에 저장하여 방장임을 증명하는 데 사용합니다.

### 4.2. 사용자 접속 및 인증 (Connection & Authentication)

1.  **[Client]** 사용자가 방 이름(또는 초대코드)과 비밀번호를 입력하여 입장을 시도합니다.
2.  **[Client]** `socket.io-client`가 `auth` 옵션에 인증 정보(`roomIdentifier`, `password`)를 담아 서버에 연결을 시도합니다.
3.  **[Server]** `io.use()` 미들웨어가 모든 새로운 연결 요청을 가로챕니다.
4.  **[Server]** **(재접속 시)** 만약 `auth` 객체에 `sessionToken`이 있다면, 토큰을 파싱하여 유효성을 검증하고 바로 연결을 허용합니다.
5.  **[Server]** **(신규 접속 시)** `roomIdentifier`를 통해 `rooms` 객체에서 실제 방 정보를 찾습니다.
6.  **[Server]** 비밀번호 일치 여부와 방의 현재 인원(최대 10명)을 확인합니다.
7.  **[Server]** 모든 검증을 통과하면, 사용자에게 고유한 `userId`를 발급하고 `socket` 객체에 `roomId`, `userId`를 저장한 뒤 `next()`를 호출하여 연결을 승인합니다.
8.  **[Server]** 검증에 실패하면 `next(new Error('...'))`를 호출하여 연결을 거부합니다.
9.  **[Client]** 연결이 거부되면 `connect_error` 이벤트가 발생하며, 사용자에게 오류 메시지를 표시합니다.

### 4.3. 프로필 설정 및 닉네임 중복 검사

1.  **[Server]** 사용자가 성공적으로 연결되면, 서버는 `connection` 이벤트 핸들러 내부에서 해당 사용자의 프로필 정보를 `rooms.json`에서 조회합니다.
2.  **[Server]** 프로필이 없으면 기본값(`익명-xxxxx`)으로 닉네임을 설정하고, `session` 이벤트를 통해 사용자 정보를 클라이언트에 전송합니다.
3.  **[Client]** `ChatRoom.jsx`에서 `session` 이벤트를 수신하고, 닉네임이 기본값 형태이면 `ProfileSetupModal`을 화면에 표시합니다.
4.  **[Client]** 사용자가 모달에 새 닉네임을 입력하고 '입장하기'를 클릭합니다.
5.  **[Client]** `socket.emit('set_profile', { nickname }, (response) => { ... })` 형태로 서버에 닉네임 변경을 요청하며, 결과를 처리할 **콜백 함수**를 함께 전달합니다.
6.  **[Server]** `set_profile` 이벤트 핸들러는 요청받은 닉네임이 현재 방에서 이미 사용 중인지 검사합니다.
7.  **[Server]** **(중복 시)** `callback({ success: false, message: '...' })`을 호출하여 실패를 즉시 알립니다.
8.  **[Server]** **(성공 시)** 사용자의 닉네임을 인메모리(`rooms[roomId].users`)와 영구 데이터(`rooms[roomId].userProfiles`)에 모두 업데이트하고 `saveRooms()`를 호출합니다. 그 후 `callback({ success: true })`을 호출하여 성공을 알립니다.
9.  **[Client]** 콜백 함수는 서버의 응답에 따라 모달을 닫거나(`success: true`), 모달 내에 오류 메시지를 표시(`success: false`)합니다.

### 4.4. 메시지 전송 및 저장

1.  **[Client]** 사용자가 메시지를 입력하고 '전송' 버튼을 클릭합니다.
2.  **[Client]** `socket.emit('send_message', { message })` 이벤트를 서버로 보냅니다.
3.  **[Server]** `send_message` 핸들러는 메시지 데이터에 보낸 사람의 정보(`userId`, `nickname`, `profileImage`)와 타임스탬프를 추가합니다.
4.  **[Server]** `io.to(roomId).emit('receive_message', messageData)`를 통해 해당 방의 모든 클라이언트에게 메시지를 브로드캐스트합니다.
5.  **[Server]** 해당 방의 로그 파일(`data/[방이름].json`)을 읽어와 새 메시지를 추가하고 다시 파일에 씁니다.

## 5. 데이터 관리 (Data Management)

NaTalk은 두 가지 종류의 데이터를 관리합니다.

### 5.1. 인메모리 데이터 (Volatile)

-   **`rooms` 객체**: 서버가 실행되는 동안 모든 방의 정보를 담고 있는 핵심 객체입니다.
-   **`rooms[roomId].users` (Map)**: 특정 방에 **현재 접속 중인** 사용자들의 실시간 정보를 저장하는 `Map` 객체입니다. 사용자가 접속을 종료하면 여기서 삭제됩니다. 이 데이터는 서버 재시작 시 초기화됩니다.

### 5.2. 영구 데이터 (Persistent)

-   **`rooms.json`**: 방의 '설정'과 관련된 데이터를 저장합니다.
    -   포함되는 정보: `name`, `password`, `adminToken`, `inviteCode`, `createdAt`, `userProfiles` 등.
    -   `userProfiles` 객체는 `userId`를 키로 하여 사용자의 닉네임, 프로필 이미지, '다시 보지 않기' 설정 등 한 번 설정하면 유지되어야 하는 정보를 영구적으로 저장합니다.
    -   `saveRooms()` 함수가 호출될 때마다 파일에 덮어씌워집니다.
-   **`data/[방이름].json`**: 각 방의 실제 대화 내용(채팅 로그)이 배열 형태로 저장됩니다. 메시지가 전송될 때마다 이 파일에 추가됩니다.

## 6. 주요 이벤트 및 API

### Socket.IO Events

-   `set_profile ({ nickname }, callback)`: 닉네임을 설정하고 중복 검사 결과를 콜백으로 받음.
-   `send_message ({ message })`: 채팅 메시지를 서버로 전송.
-   `receive_message (messageData)`: 서버로부터 새로운 메시지를 수신.
-   `update_user_list (userList)`: 참여자 목록이 변경될 때마다 서버로부터 목록을 수신.
-   `chat_history (messages)`: 방에 처음 접속했을 때 이전 대화 기록을 수신.
-   `system_message (text)`: 공지, 강퇴 등 시스템 관련 메시지를 수신.
-   `kick_user ({ targetUserId, adminToken })`: 방장이 특정 사용자를 강퇴시킬 때 사용.

### REST API

-   `POST /create-room`: 새로운 방을 생성.
-   `DELETE /room/:roomId`: 방장이 방을 삭제(폭파).

