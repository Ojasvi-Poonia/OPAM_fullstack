/**
 * OPAM - Expense Prediction System
 * Express.js Full-Stack Server with React Frontend Support
 */

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { parse } = require('csv-parse/sync');

// Configure multer for file uploads (memory storage for CSV processing)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    }
});

const app = express();
const PORT = process.env.PORT || 3000;

let db;
const DB_PATH = './opam.db';

// Helper functions to query database
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

function dbAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function dbRun(sql, params = []) {
    db.run(sql, params);
    saveDatabase();
}

function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'opam-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Auth middleware for API routes
function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ============================================================================
// CATEGORIES & HELPERS
// ============================================================================

const CATEGORIES = [
    'Food & Dining', 'Transportation', 'Shopping', 'Entertainment',
    'Groceries', 'Healthcare', 'Utilities', 'Education',
    'Personal Care', 'Travel', 'Subscriptions', 'Bills & Payments', 'Other'
];

const PAYMENT_METHODS = ['UPI', 'Credit Card', 'Debit Card', 'Cash', 'Net Banking'];

function getStats(userId) {
    const stats = dbGet(`
        SELECT
            COUNT(*) as total_transactions,
            COALESCE(SUM(amount), 0) as total_spent,
            COALESCE(AVG(amount), 0) as avg_transaction
        FROM transactions WHERE user_id = ?
    `, [userId]) || { total_transactions: 0, total_spent: 0, avg_transaction: 0 };

    const thisMonth = dbGet(`
        SELECT COALESCE(SUM(amount), 0) as month_spent
        FROM transactions
        WHERE user_id = ? AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
    `, [userId]) || { month_spent: 0 };

    const categoryBreakdown = dbAll(`
        SELECT category, SUM(amount) as total, COUNT(*) as count
        FROM transactions WHERE user_id = ?
        GROUP BY category ORDER BY total DESC
    `, [userId]);

    const monthlyTrend = dbAll(`
        SELECT strftime('%Y-%m', date) as month, SUM(amount) as total
        FROM transactions WHERE user_id = ?
        GROUP BY month ORDER BY month DESC LIMIT 12
    `, [userId]);

    return {
        ...stats,
        month_spent: thisMonth.month_spent,
        categoryBreakdown,
        monthlyTrend: monthlyTrend.reverse()
    };
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

function predictNextMonth(userId) {
    const monthlyData = dbAll(`
        SELECT strftime('%Y-%m', date) as month, SUM(amount) as total
        FROM transactions WHERE user_id = ?
        GROUP BY month ORDER BY month DESC LIMIT 6
    `, [userId]);

    if (monthlyData.length < 2) {
        return { prediction: 0, confidence: 0, trend: 'insufficient_data', history: [] };
    }

    const amounts = monthlyData.map(m => m.total);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;

    const recentAvg = amounts.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, amounts.length);
    const olderAvg = amounts.slice(3).length > 0
        ? amounts.slice(3).reduce((a, b) => a + b, 0) / amounts.slice(3).length
        : recentAvg;

    let trend = 'stable';
    if (recentAvg > olderAvg * 1.1) trend = 'increasing';
    else if (recentAvg < olderAvg * 0.9) trend = 'decreasing';

    return {
        prediction: Math.round(avg * (trend === 'increasing' ? 1.05 : trend === 'decreasing' ? 0.95 : 1)),
        confidence: Math.min(90, 50 + monthlyData.length * 5),
        trend,
        history: monthlyData
    };
}

function getCategoryPredictions(userId) {
    return dbAll(`
        SELECT
            category,
            AVG(amount) as avg_amount,
            COUNT(*) as frequency,
            SUM(amount) as total
        FROM transactions
        WHERE user_id = ? AND date >= date('now', '-3 months')
        GROUP BY category
        ORDER BY total DESC
    `, [userId]);
}

// ============================================================================
// API ROUTES - AUTH
// ============================================================================

app.get('/api/auth/me', (req, res) => {
    if (req.session.user) {
        res.json({ user: req.session.user });
    } else {
        res.json({ user: null });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    const user = dbGet('SELECT * FROM users WHERE username = ? OR email = ?',
        [username.toLowerCase(), username.toLowerCase()]);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        monthly_budget: user.monthly_budget
    };

    res.json({ user: req.session.user });
});

app.post('/api/auth/register', (req, res) => {
    const { email, username, password, confirm_password, full_name } = req.body;

    if (password !== confirm_password) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const hash = bcrypt.hashSync(password, 10);
        dbRun('INSERT INTO users (email, username, password_hash, full_name) VALUES (?, ?, ?, ?)',
            [email.toLowerCase(), username.toLowerCase(), hash, full_name]);

        res.json({ success: true, message: 'Account created! Please login.' });
    } catch (err) {
        res.status(400).json({ error: 'Username or email already exists' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ============================================================================
// API ROUTES - STATS
// ============================================================================

app.get('/api/stats', requireAuth, (req, res) => {
    res.json(getStats(req.session.user.id));
});

app.get('/api/predictions', requireAuth, (req, res) => {
    const predictions = predictNextMonth(req.session.user.id);
    const categoryPredictions = getCategoryPredictions(req.session.user.id);
    res.json({ predictions, categoryPredictions });
});

// ============================================================================
// API ROUTES - TRANSACTIONS
// ============================================================================

app.get('/api/transactions', requireAuth, (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const category = req.query.category || '';

    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    let countQuery = 'SELECT COUNT(*) as count FROM transactions WHERE user_id = ?';
    const params = [req.session.user.id];

    if (category) {
        query += ' AND category = ?';
        countQuery += ' AND category = ?';
        params.push(category);
    }

    query += ' ORDER BY date DESC LIMIT ? OFFSET ?';

    const transactions = dbAll(query, [...params, limit, offset]);
    const totalResult = dbGet(countQuery, params);
    const total = totalResult ? totalResult.count : 0;
    const totalPages = Math.ceil(total / limit);

    res.json({
        transactions,
        currentPage: page,
        totalPages,
        total
    });
});

app.post('/api/transactions', requireAuth, (req, res) => {
    const { amount, category, merchant, description, payment_method, date, is_recurring } = req.body;
    const userId = req.session.user.id;

    const fraud = calculateFraudScore(userId, parseFloat(amount), category);

    dbRun(`
        INSERT INTO transactions (user_id, amount, category, merchant, description, payment_method, date, is_recurring, fraud_score, risk_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [userId, parseFloat(amount), category, merchant || 'Unknown', description, payment_method, date, is_recurring ? 1 : 0, fraud.score, fraud.level]);

    res.json({
        success: true,
        message: fraud.score > 70 ? `High fraud risk detected! Score: ${fraud.score}` : 'Transaction added successfully',
        fraudScore: fraud.score,
        riskLevel: fraud.level
    });
});

app.delete('/api/transactions/:id', requireAuth, (req, res) => {
    dbRun('DELETE FROM transactions WHERE id = ? AND user_id = ?',
        [req.params.id, req.session.user.id]);
    res.json({ success: true });
});

// CSV Import Route
app.post('/api/transactions/import', requireAuth, upload.single('csvFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Please upload a CSV file' });
    }

    const userId = req.session.user.id;

    try {
        const csvContent = req.file.buffer.toString('utf-8');

        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true
        });

        if (records.length === 0) {
            return res.status(400).json({ error: 'CSV file is empty' });
        }

        const columnMap = {
            date: ['date', 'trans_date', 'transaction_date', 'Date', 'DATE', 'Transaction Date'],
            amount: ['amount', 'Amount', 'AMOUNT', 'value', 'Value'],
            category: ['category', 'Category', 'CATEGORY', 'type', 'Type'],
            merchant: ['merchant', 'Merchant', 'MERCHANT', 'store', 'Store', 'vendor', 'Vendor'],
            description: ['description', 'Description', 'DESCRIPTION', 'notes', 'Notes', 'memo', 'Memo'],
            payment_method: ['payment_method', 'payment', 'Payment', 'method', 'Method', 'payment_type'],
            is_recurring: ['is_recurring', 'recurring', 'Recurring', 'is_recur']
        };

        function findColumn(record, possibleNames) {
            for (const name of possibleNames) {
                if (record.hasOwnProperty(name) && record[name] !== '') {
                    return record[name];
                }
            }
            return null;
        }

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (let i = 0; i < records.length; i++) {
            const record = records[i];

            const dateStr = findColumn(record, columnMap.date);
            const amountStr = findColumn(record, columnMap.amount);
            let category = findColumn(record, columnMap.category);
            const merchant = findColumn(record, columnMap.merchant) || 'Unknown';
            const description = findColumn(record, columnMap.description) || '';
            const paymentMethod = findColumn(record, columnMap.payment_method) || 'UPI';
            const isRecurring = findColumn(record, columnMap.is_recurring);

            if (!dateStr || !amountStr || !category) {
                errorCount++;
                if (errors.length < 5) {
                    errors.push(`Row ${i + 2}: Missing required field (date, amount, or category)`);
                }
                continue;
            }

            const amount = parseFloat(amountStr.replace(/[₹$,]/g, ''));
            if (isNaN(amount) || amount <= 0) {
                errorCount++;
                if (errors.length < 5) {
                    errors.push(`Row ${i + 2}: Invalid amount "${amountStr}"`);
                }
                continue;
            }

            if (!CATEGORIES.includes(category)) {
                const lowerCategory = category.toLowerCase();
                const matched = CATEGORIES.find(c => c.toLowerCase().includes(lowerCategory) || lowerCategory.includes(c.toLowerCase()));
                category = matched || 'Other';
            }

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

            const fraud = calculateFraudScore(userId, amount, category);

            try {
                dbRun(`
                    INSERT INTO transactions (user_id, amount, category, merchant, description, payment_method, date, is_recurring, fraud_score, risk_level)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [userId, amount, category, merchant, description, paymentMethod, dateForDb, recurringFlag, fraud.score, fraud.level]);
                successCount++;
            } catch (err) {
                errorCount++;
                if (errors.length < 5) {
                    errors.push(`Row ${i + 2}: Database error`);
                }
            }
        }

        res.json({
            success: true,
            message: `Successfully imported ${successCount} transactions`,
            successCount,
            errorCount,
            errors
        });

    } catch (err) {
        console.error('CSV Import Error:', err);
        res.status(500).json({ error: `CSV parsing error: ${err.message}` });
    }
});

// ============================================================================
// API ROUTES - FRAUD
// ============================================================================

app.get('/api/fraud', requireAuth, (req, res) => {
    const flaggedTransactions = dbAll(`
        SELECT * FROM transactions
        WHERE user_id = ? AND fraud_score > 40
        ORDER BY fraud_score DESC, date DESC
    `, [req.session.user.id]);

    res.json({ flaggedTransactions });
});

// ============================================================================
// API ROUTES - BUDGETS
// ============================================================================

app.get('/api/budgets', requireAuth, (req, res) => {
    const budgets = dbAll('SELECT * FROM budgets WHERE user_id = ?', [req.session.user.id]);

    const spending = dbAll(`
        SELECT category, SUM(amount) as spent
        FROM transactions
        WHERE user_id = ? AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
        GROUP BY category
    `, [req.session.user.id]);

    const spendingMap = {};
    spending.forEach(s => spendingMap[s.category] = s.spent);

    res.json({
        budgets,
        spendingMap,
        categories: CATEGORIES,
        overallBudget: req.session.user.monthly_budget
    });
});

app.post('/api/budgets', requireAuth, (req, res) => {
    const { category, monthly_limit } = req.body;

    const existing = dbGet('SELECT * FROM budgets WHERE user_id = ? AND category = ?',
        [req.session.user.id, category]);

    if (existing) {
        dbRun('UPDATE budgets SET monthly_limit = ? WHERE id = ?',
            [parseFloat(monthly_limit), existing.id]);
    } else {
        dbRun('INSERT INTO budgets (user_id, category, monthly_limit) VALUES (?, ?, ?)',
            [req.session.user.id, category, parseFloat(monthly_limit)]);
    }

    res.json({ success: true });
});

app.delete('/api/budgets/:id', requireAuth, (req, res) => {
    dbRun('DELETE FROM budgets WHERE id = ? AND user_id = ?',
        [req.params.id, req.session.user.id]);
    res.json({ success: true });
});

// ============================================================================
// API ROUTES - SETTINGS
// ============================================================================

app.post('/api/settings', requireAuth, (req, res) => {
    const { full_name, monthly_budget } = req.body;

    dbRun('UPDATE users SET full_name = ?, monthly_budget = ? WHERE id = ?',
        [full_name, parseFloat(monthly_budget), req.session.user.id]);

    req.session.user.full_name = full_name;
    req.session.user.monthly_budget = parseFloat(monthly_budget);

    res.json({ success: true });
});

// ============================================================================
// API ROUTES - ML PREDICTIONS
// ============================================================================

const { spawn } = require('child_process');

app.get('/api/ml/predict', requireAuth, (req, res) => {
    const userId = req.session.user.id;
    const tune = req.query.tune !== 'false';

    const pythonScript = path.join(__dirname, 'ml_models', 'run_ml.py');
    const args = [pythonScript, DB_PATH, userId.toString(), '--task=predict'];
    if (!tune) args.push('--no-tune');

    const python = spawn('python3', args);

    let output = '';
    let errorOutput = '';

    python.stdout.on('data', (data) => {
        output += data.toString();
    });

    python.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.log('ML Progress:', data.toString());
    });

    python.on('close', (code) => {
        if (code !== 0) {
            return res.status(500).json({
                error: 'ML prediction failed',
                details: errorOutput
            });
        }

        try {
            const result = JSON.parse(output);
            res.json(result);
        } catch (e) {
            res.status(500).json({
                error: 'Failed to parse ML output',
                output: output
            });
        }
    });
});

app.get('/api/ml/fraud', requireAuth, (req, res) => {
    const userId = req.session.user.id;
    const tune = req.query.tune !== 'false';

    const pythonScript = path.join(__dirname, 'ml_models', 'run_ml.py');
    const args = [pythonScript, DB_PATH, userId.toString(), '--task=fraud'];
    if (!tune) args.push('--no-tune');

    const python = spawn('python3', args);

    let output = '';
    let errorOutput = '';

    python.stdout.on('data', (data) => {
        output += data.toString();
    });

    python.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.log('ML Progress:', data.toString());
    });

    python.on('close', (code) => {
        if (code !== 0) {
            return res.status(500).json({
                error: 'Fraud detection failed',
                details: errorOutput
            });
        }

        try {
            const result = JSON.parse(output);
            res.json(result);
        } catch (e) {
            res.status(500).json({
                error: 'Failed to parse ML output',
                output: output
            });
        }
    });
});

app.get('/api/ml/run-all', requireAuth, (req, res) => {
    const userId = req.session.user.id;
    const tune = req.query.tune !== 'false';

    const pythonScript = path.join(__dirname, 'ml_models', 'run_ml.py');
    const args = [pythonScript, DB_PATH, userId.toString(), '--task=all'];
    if (!tune) args.push('--no-tune');

    const python = spawn('python3', args);

    let output = '';
    let errorOutput = '';

    python.stdout.on('data', (data) => {
        output += data.toString();
    });

    python.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.log('ML Progress:', data.toString());
    });

    python.on('close', (code) => {
        if (code !== 0) {
            return res.status(500).json({
                error: 'ML models failed',
                details: errorOutput
            });
        }

        try {
            const result = JSON.parse(output);
            res.json(result);
        } catch (e) {
            res.status(500).json({
                error: 'Failed to parse ML output',
                output: output
            });
        }
    });
});

// ============================================================================
// SERVE REACT FRONTEND (Production)
// ============================================================================

// Serve static files from React build
const frontendBuildPath = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(frontendBuildPath)) {
    app.use(express.static(frontendBuildPath));

    // Handle React routing - serve index.html for all non-API routes
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(frontendBuildPath, 'index.html'));
        }
    });
}

// ============================================================================
// START SERVER
// ============================================================================

async function startServer() {
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

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

    // Create demo user
    const demoUser = dbGet("SELECT * FROM users WHERE username = ?", ['demo']);
    if (!demoUser) {
        const hash = bcrypt.hashSync('demo123', 10);
        dbRun("INSERT INTO users (email, username, password_hash, full_name) VALUES (?, ?, ?, ?)",
            ['demo@opam.com', 'demo', hash, 'Demo User']);
    }

    app.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   OPAM - Expense Prediction System                        ║
║   Server running at http://localhost:${PORT}                 ║
║                                                           ║
║   Demo login: demo / demo123                              ║
║                                                           ║
║   React Frontend: Run 'npm run dev' in /frontend folder   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        `);
    });
}

startServer().catch(console.error);
