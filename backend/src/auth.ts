import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'contest-secret-key-change-in-production';

export interface AuthUser {
  userId: number;
  username: string;
  role: string;
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Не авторизован' });
    return;
  }
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET) as AuthUser;
    (req as any).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Невалидный токен' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as AuthUser;
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }
    next();
  };
}
