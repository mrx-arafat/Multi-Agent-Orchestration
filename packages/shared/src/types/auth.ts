/**
 * MAOF Authentication Types
 */

export type UserRole = 'admin' | 'user';

export interface User {
  userUuid: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginResponse {
  user: User;
  tokens: TokenPair;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
}
