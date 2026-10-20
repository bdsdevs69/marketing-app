// Viewable copies of user passwords, so an admin can tell a user their
// password (the owner asked for this over reset-only). Login never uses
// these — it still checks the bcrypt hash.
//
// Each copy is AES-256-GCM encrypted with PASSWORD_VIEW_KEY (32 random
// bytes, base64), which lives only in the environment and never in the
// database, so the database on its own reveals nothing readable. Without the
// key the feature switches itself off: nothing is stored, nothing is shown.

import crypto from 'crypto';
import db from './db';

const KEY: Buffer | null = (() => {
  const raw = process.env.PASSWORD_VIEW_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
})();

export const passwordViewEnabled = () => KEY !== null;

let columnReady: Promise<void> | null = null;

// Added on first use so a fresh environment needs no manual migration.
export function ensurePasswordColumn(): Promise<void> {
  if (!columnReady) {
    columnReady = db
      .query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_view TEXT')
      .then(() => undefined)
      .catch((error) => {
        columnReady = null;
        throw error;
      });
  }
  return columnReady;
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY!, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

function decrypt(blob: string): string | null {
  const [version, iv, tag, data] = blob.split('.');
  if (version !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY!, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null; // wrong key or tampered value
  }
}

// Save (or replace) the viewable copy after a password is set. Best effort:
// a failure here must never break creating an account or signing in.
export async function storePasswordCopy(userId: number, plain: string, onlyIfMissing = false): Promise<void> {
  if (!KEY) return;
  try {
    await ensurePasswordColumn();
    await db.query(
      `UPDATE users SET password_view = $2 WHERE id = $1${onlyIfMissing ? ' AND password_view IS NULL' : ''}`,
      [userId, encrypt(plain)]
    );
  } catch (error) {
    console.error('Could not store password copy:', error);
  }
}

// The password, or null if there is no copy yet (or the key can't open it).
export async function readPasswordCopy(userId: number): Promise<string | null> {
  if (!KEY) return null;
  await ensurePasswordColumn();
  const result = await db.query('SELECT password_view FROM users WHERE id = $1', [userId]);
  const blob = result.rows[0]?.password_view as string | null | undefined;
  return blob ? decrypt(blob) : null;
}
