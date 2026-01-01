# 1단계: 클라이언트(React) 빌드
FROM node:18-alpine AS client-builder

WORKDIR /app/client

COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

# 2단계: 서버(Node.js) 환경 구성 및 실행
FROM node:18-alpine AS server-runner

WORKDIR /app

# 서버 의존성 설치
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --production

# 빌드된 클라이언트 파일과 서버 소스코드 복사
COPY --from=client-builder /app/client/dist ./client/dist
COPY --from=client-builder /app/client/public ./client/public
COPY server/ ./server/

ENV PORT=3002
EXPOSE $PORT

# 서버 실행
CMD ["node", "server/index.js"]