import { UserRole } from '../../generated/prisma/client';
import { prisma } from '../config/prisma';
import { AppError, UnauthorizedError } from '../lib/errors';
import jwt from 'jsonwebtoken';

export const login = async (
  username: string,
  full_name: string
): Promise<any> => {
  const user = await prisma.user.findUnique({
    where: { username, full_name },
  });

  if (!user) {
    console.log('Unauthorized login attempt for username:', username);
    throw new UnauthorizedError('Invalid credentials');
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: '3h' }
  );

  return {
    user_id: user.id,
    token,
  };
};

export const register = async (
  username: string,
  full_name: string,
  role: UserRole
): Promise<any> => {
  const existingUser = await prisma.user.findUnique({
    where: { username },
  });
  if (existingUser) {
    throw new AppError('User already exists', 409);
  }

  const newUser = await prisma.user.create({
    data: {
      username,
      full_name,
      role: role ?? UserRole.GUEST,
    },
  });
  return newUser;
};

const verifyToken = (token: string): any => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    return decoded;
  } catch (error) {
    throw new UnauthorizedError('Invalid token');
  }
};

export const getMe = async (token: string) => {
  const decoded: any = verifyToken(token);
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
  });
  if (!user) {
    throw new UnauthorizedError('User not found');
  }
  return user;
};

export const logout = async (token: string): Promise<void> => {
  // In a real-world application, you might want to implement token blacklisting here.
  // For simplicity, we'll just verify the token to ensure it's valid.
  verifyToken(token);
};
