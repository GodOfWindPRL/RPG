import bcrypt from 'bcryptjs';
import { prisma } from '../shared/prisma.js';
import { signToken } from '../../middleware/auth.js';

export async function register(email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error('Email already used');
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash },
    select: { id: true, email: true },
  });
  const token = signToken({ userId: user.id, username: user.email });
  return { token, user };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error('Invalid credentials');
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new Error('Invalid credentials');
  }
  const token = signToken({ userId: user.id, username: user.email });
  return { token, user: { id: user.id, email: user.email } };
}
