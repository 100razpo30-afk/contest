import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://keycloak.kontent.svc.cluster.local:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'kontent';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'contest';

let cachedPublicKey: string | null = null;

export interface AuthUser {
  userId: string;
  username: string;
  role: string;
}

async function getPublicKey(): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey;
  const res = await fetch(`${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`);
  const data = await res.json() as any;
  cachedPublicKey = `-----BEGIN PUBLIC KEY-----\n${data.public_key}\n-----END PUBLIC KEY-----`;
  return cachedPublicKey;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Не авторизован' });
    return;
  }
  try {
    const publicKey = await getPublicKey();
    const decoded = jwt.verify(header.slice(7), publicKey, { algorithms: ['RS256'] }) as any;

    const clientRoles: string[] = decoded.resource_access?.[KEYCLOAK_CLIENT_ID]?.roles || [];
    const role = clientRoles.includes('admin') ? 'admin'
      : clientRoles.includes('reviewer') ? 'reviewer'
      : 'applicant';

    (req as any).user = {
      userId: decoded.sub,
      username: decoded.preferred_username,
      role,
    } as AuthUser;
    next();
  } catch {
    cachedPublicKey = null;
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
