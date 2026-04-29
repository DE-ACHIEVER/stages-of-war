// File: /backend/tests/database.test.js
import db from '../config/database.js';

async function testDatabaseConnection() {
    console.log('🔍 Testing Database Connection...');
    
    try {
        // Test 1: Basic Connection
        const result = await db.query('SELECT NOW() as current_time');
        console.log('✅ Database connected successfully');
        console.log(`   Server time: ${result.rows[0].current_time}`);
        
        // Test 2: Check if tables exist
        const tables = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        console.log('📊 Available tables:', tables.rows.map(t => t.table_name).join(', '));
        
        // Test 3: Verify required tables
        const requiredTables = ['users', 'matches', 'transactions', 'disputes', 'games'];
        const existingTables = tables.rows.map(t => t.table_name);
        
        requiredTables.forEach(table => {
            if (existingTables.includes(table)) {
                console.log(`   ✅ Table '${table}' exists`);
            } else {
                console.log(`   ❌ Table '${table}' MISSING!`);
            }
        });
        
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
}

// Run the test
testDatabaseConnection();