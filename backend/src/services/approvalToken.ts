import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { redisCommand, getRedis } from '../redis/client.js';
import { config } from '../config.js';

const APPROVAL_TOKEN_PREFIX = 'approval_token:';
const TTL_SEC = 3600; // 1 hour

export interface ApprovalPayload {
  transactionId: string;
  organizationId: string;
  action: 'approve' | 'decline';
  jti: string;
  exp: number;
}

export function createApprovalToken(transactionId: string, organizationId: string, action: 'approve' | 'decline'): string {
  const jti = uuidv4();
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const payload: Omit<ApprovalPayload, 'exp'> & { exp: number } = {
    transactionId,
    organizationId,
    action,
    jti,
    exp,
  };
  const token = jwt.sign(payload, config.app.jwtSecret, { expiresIn: TTL_SEC });
  return token;
}

export async function storeApprovalTokenUnused(jti: string): Promise<void> {
  await redisCommand((r) => r.setex(APPROVAL_TOKEN_PREFIX + jti, TTL_SEC, 'unused'));
}

export async function consumeApprovalToken(jti: string): Promise<'unused' | 'used' | 'missing'> {
  const key = APPROVAL_TOKEN_PREFIX + jti;
  const result = await redisCommand(async (r) => {
    const val = await r.get(key);
    if (val === null) return 'missing';
    if (val !== 'unused') return 'used';
    await r.set(key, 'used', 'EX', TTL_SEC);
    return 'unused';
  });
  return result as 'unused' | 'used' | 'missing';
}

export function verifyApprovalToken(token: string): ApprovalPayload | null {
  try {
    const decoded = jwt.verify(token, config.app.jwtSecret) as ApprovalPayload;
    return decoded;
  } catch {
    return null;
  }
}
