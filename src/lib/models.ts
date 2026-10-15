import db from './db';
import bcrypt from 'bcryptjs';

// User Interface
export interface User {
  id: number;
  email: string;
  password_hash?: string;
  role: 'admin' | 'user';
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserInvitation {
  id: number;
  email: string;
  token: string;
  expires_at: Date;
  used: boolean;
  created_by: number;
  created_at: Date;
  used_at?: Date;
}

export interface UserSession {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
  last_used_at: Date;
}

export class InvitationModel {
  static async create(invitationData: {
    email: string;
    token: string;
    expires_at: Date;
    created_by: number;
  }): Promise<UserInvitation> {
    const result = await db.query(
      `INSERT INTO user_invitations (email, token, expires_at, created_by, used, created_at)
       VALUES ($1, $2, $3, $4, false, NOW())
       RETURNING *`,
      [
        invitationData.email,
        invitationData.token,
        invitationData.expires_at,
        invitationData.created_by
      ]
    );
    
    return result.rows[0];
  }

  static async findByToken(token: string): Promise<UserInvitation | null> {
    const result = await db.query(
      'SELECT * FROM user_invitations WHERE token = $1 AND expires_at > NOW() AND used = false',
      [token]
    );
    
    return result.rows[0] || null;
  }

  static async markAsUsed(id: number): Promise<void> {
    await db.query(
      'UPDATE user_invitations SET used = true, used_at = NOW() WHERE id = $1',
      [id]
    );
  }

  static async findByEmail(email: string): Promise<UserInvitation | null> {
    const result = await db.query(
      'SELECT * FROM user_invitations WHERE email = $1 AND expires_at > NOW() AND used = false ORDER BY created_at DESC LIMIT 1',
      [email]
    );
    
    return result.rows[0] || null;
  }
}

// User Model
export class UserModel {
  // Email is matched case-insensitively: addresses are not case sensitive in
  // practice, and users type their own capitalisation when logging in.
  static async findByEmail(email: string): Promise<User | null> {
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE lower(email) = lower($1) ORDER BY id LIMIT 1',
        [email]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding user by email:', error);
      return null;
    }
  }

  static async findActiveByEmail(email: string): Promise<User | null> {
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE lower(email) = lower($1) AND is_active = true ORDER BY id LIMIT 1',
        [email]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding active user by email:', error);
      return null;
    }
  }

  static async findById(id: number): Promise<User | null> {
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE id = $1 AND is_active = true',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error finding user by ID:', error);
      return null;
    }
  }

  static async create(userData: {
    email: string;
    password: string;
    role?: 'admin' | 'user';
    first_name?: string;
    last_name?: string;
  }): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    
    const result = await db.query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       RETURNING id, email, role, first_name, last_name, is_active, created_at, updated_at`,
      [
        userData.email,
        hashedPassword,
        userData.role || 'user',
        userData.first_name,
        userData.last_name
      ]
    );
    
    return result.rows[0];
  }

  static async updateLastLogin(userId: number): Promise<void> {
    await db.query(
      'UPDATE users SET updated_at = NOW() WHERE id = $1',
      [userId]
    );
  }

  static async verifyPassword(user: User, password: string): Promise<boolean> {
    if (!user.password_hash) return false;
    return bcrypt.compare(password, user.password_hash);
  }

  static async updateUserStatus(userId: number, isActive: boolean): Promise<void> {
    await db.query(
      'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [isActive, userId]
    );
  }
}

// Session Model
export class SessionModel {
  static async create(sessionData: {
    user_id: number;
    token_hash: string;
    expires_at: Date;
    ip_address?: string;
    user_agent?: string;
  }): Promise<UserSession> {
    const result = await db.query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at, ip_address, user_agent, created_at, last_used_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [
        sessionData.user_id,
        sessionData.token_hash,
        sessionData.expires_at,
        sessionData.ip_address,
        sessionData.user_agent
      ]
    );
    
    return result.rows[0];
  }

  static async findByTokenHash(tokenHash: string): Promise<UserSession | null> {
    const result = await db.query(
      'SELECT * FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW()',
      [tokenHash]
    );
    
    return result.rows[0] || null;
  }

  static async updateLastUsed(sessionId: number): Promise<void> {
    await db.query(
      'UPDATE user_sessions SET last_used_at = NOW() WHERE id = $1',
      [sessionId]
    );
  }

  static async deleteByTokenHash(tokenHash: string): Promise<void> {
    await db.query(
      'DELETE FROM user_sessions WHERE token_hash = $1',
      [tokenHash]
    );
  }

  static async cleanupExpired(): Promise<void> {
    await db.query(
      'DELETE FROM user_sessions WHERE expires_at < NOW()'
    );
  }
}

// Activity Log Model
export class ActivityLogModel {
  static async log(data: {
    user_id: number;
    action: string;
    resource: string;
    ip_address?: string;
    user_agent?: string;
  }): Promise<void> {
    await db.query(
      `INSERT INTO activity_logs (user_id, action, resource, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        data.user_id,
        data.action,
        data.resource,
        data.ip_address,
        data.user_agent
      ]
    );
  }

  static async getRecentActivity(userId?: number, limit: number = 50): Promise<any[]> {
    const query = userId 
      ? 'SELECT * FROM activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2'
      : 'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT $1';
    
    const params = userId ? [userId, limit] : [limit];
    const result = await db.query(query, params);
    
    return result.rows;
  }
}