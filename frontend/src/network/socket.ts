import { io } from 'socket.io-client';

const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';

export function createRpgSocket(token: string) {
  return io(API_BASE, {
    path: '/rpg-socket.io',
    transports: ['websocket'],
    auth: { token },
  });
}
