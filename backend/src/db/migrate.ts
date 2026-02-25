import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './client.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const migrationsDir = join(currentDir, 'migrations');
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const file of files) {
    const name = file.replace('.sql', '');
    const existing = await query('SELECT 1 FROM _migrations WHERE name = $1', [name]);
    if (existing.rows.length > 0) {
      console.log(`Skip (already applied): ${file}`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    await query(sql);
    await query('INSERT INTO _migrations (name) VALUES ($1)', [name]);
    console.log(`Applied: ${file}`);
  }
}

runMigrations().then(
  () => {
    console.log('Migrations done.');
    process.exit(0);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
