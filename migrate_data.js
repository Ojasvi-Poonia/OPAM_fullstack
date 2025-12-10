#!/usr/bin/env node
/**
 * OPAM Data Migration Script (Optimized for Large Files)
 *
 * Imports transaction data from CSV files into the SQLite database.
 * Optimized for files with millions of rows using batch inserts.
 *
 * Usage:
 *   node migrate_data.js <csv_file_path> [username]
 *
 * Examples:
 *   node migrate_data.js transactions.csv
 *   node migrate_data.js data/expenses.csv demo
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const { parse } = require('csv-parse/sync');
const readline = require('readline');

const DB_PATH = path.join(__dirname, 'opam.db');
const BATCH_SIZE = 5000; // Insert 5000 rows at a time
const SAVE_INTERVAL = 50000; // Save to disk every 50000 rows

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

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║     OPAM Data Migration Script (Optimized for Large Files)   ║
╚══════════════════════════════════════════════════════════════╝

Usage: node migrate_data.js <csv_file_path> [username]

Arguments:
  csv_file_path   Path to CSV file containing transaction data
  username        Optional: Username to import transactions for
                  (defaults to 'demo' user)

Examples:
  node migrate_data.js transactions.csv
  node migrate_data.js data/expenses.csv myuser
        `);
        process.exit(0);
    }

    const csvPath = args[0];
    const username = args[1] || 'demo';

    if (!fs.existsSync(csvPath)) {
        console.error(`Error: CSV file not found: ${csvPath}`);
        process.exit(1);
    }

    console.log('\n🚀 OPAM Data Migration (Optimized)');
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

        // Create index for faster queries
        db.run('CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)');
        db.run('CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category)');

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
        console.log(`✅ User created: ${username.toLowerCase()} / ${password}`);
    } else {
        console.log(`✅ Found existing user: ${user.username}`);
    }

    // Read and parse CSV
    console.log('\n📖 Reading CSV file (this may take a moment for large files)...');
    const startTime = Date.now();
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

    const parseTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`📊 Found ${records.length.toLocaleString()} rows (parsed in ${parseTime}s)`);

    if (records.length === 0) {
        console.log('⚠️  CSV file is empty');
        process.exit(0);
    }

    console.log('📋 Detected columns:', Object.keys(records[0]).join(', '));

    // Process records with batch inserts
    console.log('\n⏳ Importing transactions (batch mode)...\n');

    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const importStart = Date.now();

    // Begin transaction for faster inserts
    db.run('BEGIN TRANSACTION');

    for (let i = 0; i < records.length; i++) {
        const record = records[i];

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
                errors.push(`Row ${i + 2}: Missing required field`);
            }
            continue;
        }

        // Parse amount
        const amount = parseFloat(amountStr.toString().replace(/[₹$,]/g, ''));
        if (isNaN(amount) || amount <= 0) {
            errorCount++;
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
            continue;
        }

        const dateForDb = parsedDate.toISOString().split('T')[0];
        const recurringFlag = isRecurring && ['1', 'true', 'yes', 'Yes', 'TRUE'].includes(isRecurring.toString()) ? 1 : 0;

        try {
            // Insert without fraud calculation for speed (can be calculated later)
            db.run(`
                INSERT INTO transactions (user_id, amount, category, merchant, description, payment_method, date, is_recurring, fraud_score, risk_level)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'Low')
            `, [user.id, amount, category, merchant, description, paymentMethod, dateForDb, recurringFlag]);
            successCount++;

        } catch (err) {
            errorCount++;
        }

        // Commit batch and show progress
        if (successCount % BATCH_SIZE === 0) {
            db.run('COMMIT');
            db.run('BEGIN TRANSACTION');

            const elapsed = ((Date.now() - importStart) / 1000).toFixed(0);
            const rate = Math.round(successCount / elapsed);
            const remaining = Math.round((records.length - i) / rate);

            process.stdout.write(`  ✅ ${successCount.toLocaleString()} imported | ${rate}/sec | ~${remaining}s remaining\r`);
        }

        // Save to disk periodically
        if (successCount % SAVE_INTERVAL === 0 && successCount > 0) {
            db.run('COMMIT');
            saveDatabase();
            db.run('BEGIN TRANSACTION');
            console.log(`\n  💾 Checkpoint saved at ${successCount.toLocaleString()} rows`);
        }
    }

    // Final commit and save
    db.run('COMMIT');
    saveDatabase();

    const totalTime = ((Date.now() - importStart) / 1000).toFixed(1);

    // Print results
    console.log('\n\n' + '='.repeat(50));
    console.log('📊 Migration Results');
    console.log('='.repeat(50));
    console.log(`✅ Successfully imported: ${successCount.toLocaleString()} transactions`);
    console.log(`⏱️  Time: ${totalTime} seconds (${Math.round(successCount / totalTime)}/sec)`);

    if (errorCount > 0) {
        console.log(`❌ Failed: ${errorCount.toLocaleString()} rows`);
        if (errors.length > 0) {
            console.log('   First errors:', errors.slice(0, 3).join('; '));
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('🎉 Migration complete!');
    console.log('='.repeat(50));
    console.log(`\nNext steps:`);
    console.log(`  1. Start server: npm start`);
    console.log(`  2. Open: http://localhost:3000`);
    console.log(`  3. Login: ${user.username} / password123`);
    console.log(`  4. Run ML: cd ml_models && python3 run_ml.py ../opam.db ${user.id}`);
    console.log('');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
