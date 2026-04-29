// File: /backend/check-db.js
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkConnection() {
    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    try {
        const client = await pool.connect();
        console.log('✅ Connected to database successfully!');
        
        const res = await client.query('SELECT version()');
        console.log('📊 PostgreSQL version:', res.rows[0].version);
        
        client.release();
        await pool.end();
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
    }
}

checkConnection();




        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsImlhdCI6MTc3MzY5NjEzNiwiZXhwIjoxNzczNzgyNTM2fQ.-vJ9ZJXx05jiaj3LrHQZRMSBayrm5TJxIBXQ_QJDJjs"
