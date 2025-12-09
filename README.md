# OPAM v3.0 - Expense Prediction System

A modern full-stack expense tracking and prediction application built with Node.js, Express, and EJS. Features dark/light mode theming.

![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![Express](https://img.shields.io/badge/Express-4.x-blue) ![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **User Authentication** - Secure login/registration with bcrypt password hashing
- **Transaction Management** - Add, view, filter, and delete expenses
- **Interactive Dashboard** - Real-time spending overview with Chart.js visualizations
- **Expense Predictions** - ML-based forecasting using moving averages
- **Fraud Detection** - Automatic flagging of unusual spending patterns
- **Budget Management** - Set and track category-wise budgets
- **Dark/Light Mode** - Toggle between themes with persistent preference
- **Analytics** - Monthly trends and category breakdowns

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js, Express.js |
| Database | SQLite (sql.js - pure JavaScript) |
| Frontend | EJS Templates, Bootstrap 5 |
| Charts | Chart.js |
| Auth | bcryptjs, express-session |
| Icons | Bootstrap Icons |

---

## User Setup Guide

### Windows Setup (From Scratch)

#### Step 1: Install Node.js

1. **Download Node.js**
   - Go to [https://nodejs.org](https://nodejs.org)
   - Download the **LTS version** (recommended)
   - Run the installer (.msi file)

2. **Install Node.js**
   - Click "Next" through the installer
   - Accept the license agreement
   - Keep default installation path
   - **Important**: Check "Automatically install necessary tools" if prompted
   - Click "Install" and wait for completion

3. **Verify Installation**
   - Open **Command Prompt** or **PowerShell**
   - Run:
     ```powershell
     node --version
     npm --version
     ```
   - You should see version numbers (e.g., `v20.x.x` and `10.x.x`)

#### Step 2: Download OPAM

**Option A: Using Git (Recommended)**
```powershell
# Install Git from https://git-scm.com if not installed
git clone https://github.com/Ojasvi-Poonia/OPAM_updated.git
cd OPAM_updated
```

**Option B: Download ZIP**
1. Go to [GitHub Repository](https://github.com/Ojasvi-Poonia/OPAM_updated)
2. Click "Code" > "Download ZIP"
3. Extract to your desired folder
4. Open PowerShell/Command Prompt in that folder

#### Step 3: Install Dependencies

```powershell
npm install
```

Wait for all packages to download (~30 seconds).

#### Step 4: Run the Application

```powershell
# Production mode
npm start

# OR Development mode (auto-restart on changes)
npm run dev
```

#### Step 5: Access OPAM

1. Open your browser
2. Go to: **http://localhost:3000**
3. Login with demo account:
   - **Username**: `demo`
   - **Password**: `demo123`

---

### macOS Setup (From Scratch)

#### Step 1: Install Homebrew (Package Manager)

Open **Terminal** (Applications > Utilities > Terminal) and run:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the prompts. After installation, run:

```bash
# Add Homebrew to PATH (for Apple Silicon Macs)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

#### Step 2: Install Node.js

```bash
# Install Node.js using Homebrew
brew install node

# Verify installation
node --version
npm --version
```

**Alternative: Using nvm (Node Version Manager)**
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal, then:
nvm install --lts
nvm use --lts
```

#### Step 3: Download OPAM

**Option A: Using Git**
```bash
# Git comes pre-installed on macOS
git clone https://github.com/Ojasvi-Poonia/OPAM_updated.git
cd OPAM_updated
```

**Option B: Download ZIP**
1. Go to [GitHub Repository](https://github.com/Ojasvi-Poonia/OPAM_updated)
2. Click "Code" > "Download ZIP"
3. Extract and open Terminal in that folder:
   ```bash
   cd ~/Downloads/OPAM_updated-master
   ```

#### Step 4: Install Dependencies

```bash
npm install
```

#### Step 5: Run the Application

```bash
# Production mode
npm start

# OR Development mode
npm run dev
```

#### Step 6: Access OPAM

1. Open Safari/Chrome/Firefox
2. Go to: **http://localhost:3000**
3. Login with demo account:
   - **Username**: `demo`
   - **Password**: `demo123`

---

## Project Structure

```
OPAM_updated/
 server.js           # Main Express server with all routes
 package.json        # Dependencies and scripts
 opam.db            # SQLite database (auto-created on first run)
 views/             # EJS templates
    layout.ejs     # Main layout with sidebar
    login.ejs      # Login page
    register.ejs   # Registration page
    dashboard.ejs  # Main dashboard with charts
    transactions.ejs
    predictions.ejs
    fraud.ejs
    budgets.ejs
    settings.ejs
 public/            # Static assets
    css/
       style.css  # Custom styles with dark/light themes
    js/
        main.js    # Client-side JavaScript
 README.md          # This file
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start with nodemon (auto-restart) |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/login` | User authentication |
| GET/POST | `/register` | User registration |
| GET | `/logout` | End session |
| GET | `/dashboard` | Main dashboard |
| GET/POST | `/transactions` | List/Add transactions |
| DELETE | `/transactions/:id` | Delete transaction |
| GET | `/predictions` | Expense predictions |
| GET | `/fraud` | Fraud detection |
| GET/POST | `/budgets` | Budget management |
| GET/POST | `/settings` | User settings |
| GET | `/api/stats` | JSON statistics |
| GET | `/api/monthly-trend` | Monthly data |
| GET | `/api/category-breakdown` | Category data |

## Troubleshooting

### Windows Issues

**"node is not recognized"**
- Restart your terminal after installing Node.js
- Or add Node.js to PATH manually

**Permission errors**
- Run PowerShell as Administrator

### macOS Issues

**"command not found: brew"**
- Run the Homebrew install command again
- Make sure to add it to PATH

**Permission errors**
```bash
sudo chown -R $(whoami) ~/.npm
```

### Common Issues

**Port 3000 already in use**
```bash
# Find and kill the process using port 3000
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS:
lsof -i :3000
kill -9 <PID>
```

**Database errors**
- Delete `opam.db` file and restart the server
- A fresh database will be created automatically

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - feel free to use this project for personal or commercial purposes.

---

**Demo Account**: `demo` / `demo123`

Made with Node.js and Express
