#!/usr/bin/env node
/**
 * OPAM Data Migration Script
 *
 * Imports transaction data from CSV files into the SQLite database.
 *
 * Usage:
 *   node migrate_data.js <csv_file_path> [username]
 *
 * Examples:
 *   node migrate_data.js transactions.csv
 *   node migrate_data.js data/expenses.csv demo
 *   node migrate_data.js ~/Downloads/bank_transactions.csv myuser
 *
 * CSV Requirements:
 *   Required columns: date, amount, category
 *   Optional columns: merchant, description, payment_method, is_recurring
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const { parse } = require('csv-parse/sync');

const DB_PATH = path.join(__dirname, 'opam.db');

// Valid categories
const CATEGORIES = [
    'Food & Dining', 'Transportation', 'Shopping', 'Entertainment',
    'Groceries', 'Healthcare', 'Utilities', 'Education',
    'Personal Care', 'Travel', 'Subscriptions', 'Bills & Payments', 'Other'
];

// Column name mappings
const COLUMN_MAP = {
    date: ['date', 'trans_date', 'transaction_date', 'Date', 'DATE', 'Transaction Date', 'transaction date'],
    amount: ['amount', 'Amount', 'AMOUNT', 'value', 'Value', 'amt', 'Amt'],
    category: ['category', 'Category', 'CATEGORY', 'type', 'Type', 'expense_type'],
    merchant: ['merchant', 'Merchant', 'MERCHANT', 'store', 'Store', 'vendor', 'Vendor', 'payee', 'Payee'],
    description: ['description', 'Description', 'DESCRIPTION', 'notes', 'Notes', 'memo', 'Memo', 'details'],
    payment_method: ['payment_method', 'payment', 'Payment', 'method', 'Method', 'payment_type', 'mode'],
    is_recurring: ['is_recurring', 'recurring', 'Recurring', 'is_recur', 'recur']
};

// Database helper functions
let db;

function dbGet(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

function dbRun(sql, params = []) {
    db.run(sql, params);
}

function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

function findColumn(record, possibleNames) {
    for (const name of possibleNames) {
        if (record.hasOwnProperty(name) && record[name] !== '') {
            return record[name];
        }
    }
    return null;
}

function calculateFraudScore(userId, amount, category) {
    const avgByCategory = dbGet(`
        SELECT AVG(amount) as avg, MAX(amount) as max_amt
        FROM transactions WHERE user_id = ? AND category = ?
    `, [userId, category]);

    if (!avgByCategory || !avgByCategory.avg) return { score: 0, level: 'Low' };

    const deviation = amount / avgByCategory.avg;
    let score = 0;
    let level = 'Low';

    if (deviation > 5) { score = 90; level = 'Critical'; }
    else if (deviation > 3) { score = 70; level = 'High'; }
    else if (deviation > 2) { score = 40; level = 'Medium'; }
    else { score = 10; level = 'Low'; }

    return { score, level };
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║           OPAM Data Migration Script                        ║
╚══════════════════════════════════════════════════════════════╝

Usage: node migrate_data.js <csv_file_path> [username]

Arguments:
  csv_file_path   Path to CSV file containing transaction data
  username        Optional: Username to import transactions for
                  (defaults to 'demo' user)

CSV Format:
  Required columns: date, amount, category
  Optional columns: merchant, description, payment_method, is_recurring

Examples:
  node migrate_data.js transactions.csv
  node migrate_data.js data/expenses.csv demo
  node migrate_data.js ~/Downloads/bank.csv myuser
        `);
        process.exit(0);
    }

    const csvPath = args[0];
    const username = args[1] || 'demo';

    // Check if CSV file exists
    if (!fs.existsSync(csvPath)) {
        console.error(`Error: CSV file not found: ${csvPath}`);
        process.exit(1);
    }

    console.log('\n🚀 OPAM Data Migration');
    console.log('='.repeat(50));
    console.log(`📁 CSV File: ${csvPath}`);
    console.log(`👤 User: ${username}`);
    console.log('='.repeat(50));

    // Initialize SQL.js
    const SQL = await initSqlJs();

    // Load or create database
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log('✅ Database loaded');
    } else {
        db = new SQL.Database();
        console.log('📦 Creating new database...');

        // Create tables
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT,
                monthly_budget REAL DEFAULT 50000,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                category TEXT NOT NULL,
                merchant TEXT DEFAULT 'Unknown',
                description TEXT,
                payment_method TEXT DEFAULT 'UPI',
                date DATE NOT NULL,
                is_recurring INTEGER DEFAULT 0,
                fraud_score REAL DEFAULT 0,
                risk_level TEXT DEFAULT 'Low',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                category TEXT NOT NULL,
                monthly_limit REAL NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        saveDatabase();
        console.log('✅ Database schema created');
    }

    // Get or create user
    let user = dbGet('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);

    if (!user) {
        console.log(`\n📝 Creating new user: ${username}`);
        const password = 'password123';
        const hash = bcrypt.hashSync(password, 10);
        const email = `${username.toLowerCase()}@opam.com`;

        dbRun('INSERT INTO users (email, username, password_hash, full_name) VALUES (?, ?, ?, ?)',
            [email, username.toLowerCase(), hash, username]);

        user = dbGet('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);
        console.log(`✅ User created with credentials:`);
        console.log(`   Username: ${username.toLowerCase()}`);
        console.log(`   Password: ${password}`);
        console.log(`   Email: ${email}`);
    } else {
        console.log(`✅ Found existing user: ${user.username}`);
    }

    // Read and parse CSV
    console.log('\n📖 Reading CSV file...');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    let records;
    try {
        records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true
        });
    } catch (err) {
        console.error(`❌ CSV parsing error: ${err.message}`);
        process.exit(1);
    }

    console.log(`📊 Found ${records.length} rows in CSV`);

    if (records.length === 0) {
        console.log('⚠️  CSV file is empty');
        process.exit(0);
    }

    // Show detected columns
    const sampleRecord = records[0];
    console.log('\n📋 Detected columns:', Object.keys(sampleRecord).join(', '));

    // Process records
    console.log('\n⏳ Importing transactions...\n');

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < records.length; i++) {
        const record = records[i];

        // Extract fields
        const dateStr = findColumn(record, COLUMN_MAP.date);
        const amountStr = findColumn(record, COLUMN_MAP.amount);
        let category = findColumn(record, COLUMN_MAP.category);
        const merchant = findColumn(record, COLUMN_MAP.merchant) || 'Unknown';
        const description = findColumn(record, COLUMN_MAP.description) || '';
        const paymentMethod = findColumn(record, COLUMN_MAP.payment_method) || 'UPI';
        const isRecurring = findColumn(record, COLUMN_MAP.is_recurring);

        // Validate required fields
        if (!dateStr || !amountStr || !category) {
            errorCount++;
            if (errors.length < 5) {
                errors.push(`Row ${i + 2}: Missing required field (date, amount, or category)`);
            }
            continue;
        }

        // Parse amount
        const amount = parseFloat(amountStr.toString().replace(/[₹$,]/g, ''));
        if (isNaN(amount) || amount <= 0) {
            errorCount++;
            if (errors.length < 5) {
                errors.push(`Row ${i + 2}: Invalid amount "${amountStr}"`);
            }
            continue;
        }

        // Normalize category
        if (!CATEGORIES.includes(category)) {
            const lowerCategory = category.toLowerCase();
            const matched = CATEGORIES.find(c =>
                c.toLowerCase().includes(lowerCategory) ||
                lowerCategory.includes(c.toLowerCase())
            );
            category = matched || 'Other';
        }

        // Parse date
        let parsedDate;
        try {
            parsedDate = new Date(dateStr);
            if (isNaN(parsedDate.getTime())) {
                throw new Error('Invalid date');
            }
        } catch (e) {
            errorCount++;
            if (errors.length < 5) {
                errors.push(`Row ${i + 2}: Invalid date "${dateStr}"`);
            }
            continue;
        }

        const dateForDb = parsedDate.toISOString().split('T')[0];
        const recurringFlag = isRecurring && ['1', 'true', 'yes', 'Yes', 'TRUE'].includes(isRecurring.toString()) ? 1 : 0;

        // Calculate fraud score
        const fraud = calculateFraudScore(user.id, amount, category);

        try {
            dbRun(`
                INSERT INTO transactions (user_id, amount, category, merchant, description, payment_method, date, is_recurring, fraud_score, risk_level)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [user.id, amount, category, merchant, description, paymentMethod, dateForDb, recurringFlag, fraud.score, fraud.level]);
            successCount++;

            // Progress indicator
            if (successCount % 100 === 0) {
                process.stdout.write(`  Imported ${successCount} rows...\r`);
            }
        } catch (err) {
            errorCount++;
            if (errors.length < 5) {
                errors.push(`Row ${i + 2}: Database error - ${err.message}`);
            }
        }
    }

    // Save database
    saveDatabase();

    // Print results
    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Results');
    console.log('='.repeat(50));
    console.log(`✅ Successfully imported: ${successCount} transactions`);

    if (errorCount > 0) {
        console.log(`❌ Failed to import: ${errorCount} rows`);
        console.log('\nFirst errors:');
        errors.forEach(err => console.log(`   - ${err}`));
    }

    console.log('\n' + '='.repeat(50));
    console.log('🎉 Migration complete!');
    console.log('='.repeat(50));
    console.log(`\nYou can now start the server and login:`);
    console.log(`  npm start`);
    console.log(`  Open http://localhost:3000`);
    console.log(`  Login as: ${user.username}`);
    console.log('');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
