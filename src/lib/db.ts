import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

class Database {
  private pool: Pool;
  
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    console.log('Connecting to database...');
    
    this.pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      // Neon can take a few seconds to wake from idle; 2s made every request
      // that arrived during a cold start fail.
      connectionTimeoutMillis: 10000,
    });
    // An idle connection dropping (network change, Neon restart) must not
    // take the whole server down; the pool replaces it on the next query.
    this.pool.on('error', (error) => console.error('Idle database connection lost:', error.message));
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async query(text: string, params?: any[]) {
    const client = await this.getClient();
    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const db = new Database();
export default db;