# SLT Adventure RPG

Project gồm:

- `frontend/`: React + Vite + Three.js (`@react-three/fiber`) cho giao diện game RPG
- `backend/`: Node.js + Express + Socket.IO + Prisma cho API và realtime combat

## Chạy nhanh

### 1) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend chạy ở `http://localhost:4000`.

### 2) Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend chạy ở `http://localhost:5173`.

## Biến môi trường

### Backend (`backend/.env`)

- `PORT`: cổng backend (mặc định `4000`)
- `JWT_SECRET`: secret để ký JWT
- `DATABASE_URL`: chuỗi kết nối PostgreSQL dùng cho Prisma

### Frontend (`frontend/.env`)

- `VITE_API_URL`: URL backend (mặc định `http://localhost:4000`)

## API chính

- `POST /api/rpg/auth/register`
- `POST /api/rpg/auth/login`
- `GET /api/rpg/player/characters`
- `POST /api/rpg/player/characters`
- `GET /api/rpg/game/bootstrap/:characterId`
- `GET /api/health`
