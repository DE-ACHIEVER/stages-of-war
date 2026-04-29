import pg from 'pg';
import { config } from './env.js';
import logger from '../utils/logger.js';

const { Pool } = pg;

class Database {
    constructor() {
        this.pool = new Pool({
            host: config.DB.HOST,
            port: config.DB.PORT,
            database: config.DB.NAME,
            user: config.DB.USER,
            password: config.DB.PASSWORD,
            max: config.DB.POOL_MAX,
            idleTimeoutMillis: config.DB.POOL_IDLE,
            connectionTimeoutMillis: 5000,
        });

        this.pool.on('connect', () => {
            logger.debug('📦 Database connected successfully');
        });

        this.pool.on('error', (err) => {
            logger.error('❌ Database pool error:', err);
        });
    }

    async query(text, params) {
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            
            if (duration > 1000) {
                logger.warn(`⚠️ Slow query (${duration}ms): ${text.substring(0, 100)}...`);
            }
            
            return result;
        } catch (error) {
            logger.error('❌ Query error:', { text, params, error: error.message });
            throw error;
        }
    }

    async getClient() {
        const client = await this.pool.connect();
        const query = client.query;
        const release = client.release;

        // Set timeout for queries
        const timeout = setTimeout(() => {
            logger.error('❌ A client has been checked out for too long!');
            logger.error(`The last executed query on this client was: ${client.lastQuery}`);
        }, 5000);

        client.query = (...args) => {
            client.lastQuery = args;
            return query.apply(client, args);
        };

        client.release = () => {
            clearTimeout(timeout);
            client.query = query;
            client.release = release;
            return release.apply(client);
        };

        return client;
    }

    async transaction(callback) {
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

    async testConnection() {
        try {
            const result = await this.query('SELECT NOW()');
            logger.info('✅ Database connection test successful');
            return true;
        } catch (error) {
            logger.error('❌ Database connection test failed:', error);
            return false;
        }
    }
}

// Singleton instance
const db = new Database();
export default db;