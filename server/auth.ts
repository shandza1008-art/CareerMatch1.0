import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'careermatch-dev-secret-change-in-prod';

export interface AuthUser {
  id: number;
  email: string;
  role: 'student' | 'recruiter' | 'admin';
  full_name: string;
  status: string;
  email_verified: number;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  if (req.cookies && req.cookies.cm_token) {
    return req.cookies.cm_token;
  }
  return null;
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
    const user = db
      .prepare('SELECT id, email, role, full_name, status, email_verified FROM users WHERE id = ?')
      .get(decoded.id) as AuthUser | undefined;
    if (user && user.status === 'active') {
      req.user = user;
    }
  } catch {
    // Ignore invalid optional token
  }
  next();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
    const user = db
      .prepare('SELECT id, email, role, full_name, status, email_verified FROM users WHERE id = ?')
      .get(decoded.id) as AuthUser | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Account no longer exists.' });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

export function requireRole(...roles: Array<'student' | 'recruiter' | 'admin'>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Requires ${roles.join(' or ')} role.` });
    }
    next();
  };
}
