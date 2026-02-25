import pg from 'pg';
import { config } from '../config.js';

const pool: pg.Pool | null = config.database.url
  ? new pg.Pool({
      connectionString: config.database.url,
      max: 10,
      idleTimeoutMillis: 30000,
    })
  : null;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  if (!pool) throw new Error('DATABASE_URL not set');
  return pool.query<T>(text, params);
}

export function getPool(): pg.Pool | null {
  return pool;
}
