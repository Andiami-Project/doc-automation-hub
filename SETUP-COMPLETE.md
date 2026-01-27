# Documentation Automation Hub - Phase 1 Setup Complete ✅

## What Was Created

### Core Service Files
- ✅ **server.js** - Express.js webhook listener (port 6000)
- ✅ **project-registry.json** - Configuration for 4 projects
- ✅ **package.json** - Node.js dependencies
- ✅ **ecosystem.config.js** - PM2 process configuration
- ✅ **.env.example** - Environment variables template

### Handler Scripts
- ✅ **handlers/generate-docs.sh** - Documentation generation using Claude Code CLI
- ✅ **handlers/create-pr.sh** - PR creation using GitHub CLI
- ✅ **handlers/restart-service.sh** - Service restart after PR merge

### Documentation
- ✅ **README.md** - Complete service documentation
- ✅ **SETUP-COMPLETE.md** - This file

### Directory Structure
```
/home/ubuntu/services/doc-automation-hub/
├── server.js                    ✅
├── project-registry.json        ✅
├── package.json                 ✅
├── package-lock.json            ✅ (auto-generated)
├── ecosystem.config.js          ✅
├── .env.example                 ✅
├── README.md                    ✅
├── SETUP-COMPLETE.md            ✅
├── handlers/
│   ├── generate-docs.sh         ✅
│   ├── create-pr.sh             ✅
│   └── restart-service.sh       ✅
├── logs/                        ✅ (empty, will be populated)
└── node_modules/                ✅ (dependencies installed)
```

---

## 🔴 REQUIRED: Before Starting Service

### 1. Create `.env` File with Secrets

```bash
cd /home/ubuntu/services/doc-automation-hub
cp .env.example .env
nano .env
```

**Required values:**
```bash
# Get from GitHub: Settings → Developer settings → Personal access tokens → Tokens (classic)
# Permissions needed: repo, workflow
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Generate a strong random secret (same value used in GitHub Actions)
GITHUB_WEBHOOK_SECRET=<generate-with: openssl rand -hex 32>

PORT=6000
NODE_ENV=production
LOG_LEVEL=info

# Same as GITHUB_WEBHOOK_SECRET
WEBHOOK_SECRET=<same-value-as-above>

# Claude Code CLI path (verify with: which claude)
CLAUDE_CODE_PATH=/usr/local/bin/claude

MAX_CONCURRENT_JOBS=2
JOB_TIMEOUT_MINUTES=30

GIT_USER_NAME="Documentation Bot"
GIT_USER_EMAIL="docs-bot@automation.local"
```

### 2. Generate Webhook Secret

```bash
# Generate a strong random secret
openssl rand -hex 32

# Copy this value to both:
# 1. .env file (GITHUB_WEBHOOK_SECRET and WEBHOOK_SECRET)
# 2. GitHub repository secrets (for each of 4 repos)
```

### 3. Verify Prerequisites

```bash
# Verify Claude Code CLI is installed
which claude
# Expected: /usr/local/bin/claude (or path in your .env)

# Verify GitHub CLI is installed
which gh
# If not found: sudo apt install gh

# Verify Node.js version
node --version
# Expected: v16.0.0 or higher

# Verify PM2 is installed
which pm2
# If not found: npm install -g pm2

# Verify all 4 project workspaces exist
ls -la /home/ubuntu/workspace/ | grep -E "wish-x|wish-backend-x|as-you-wish-multi-agent|claude-agent-server"
```

### 4. Configure Git for Documentation Bot

```bash
# Set global git config for automation
git config --global user.name "Documentation Bot"
git config --global user.email "docs-bot@automation.local"

# Verify
git config --global --list | grep user
```

### 5. Authenticate GitHub CLI

```bash
# Authenticate using the GITHUB_TOKEN
echo "YOUR_GITHUB_TOKEN_HERE" | gh auth login --with-token

# Verify authentication
gh auth status

# Expected output:
# ✓ Logged in to github.com as <your-username> (...)
# ✓ Token: ghp_************************************
```

---

## 🟢 Starting the Service

### Option 1: Start with PM2 (Recommended for Production)

```bash
cd /home/ubuntu/services/doc-automation-hub

# Start the service
pm2 start ecosystem.config.js

# Save PM2 process list (auto-restart on reboot)
pm2 save

# Setup PM2 startup script
pm2 startup
# Follow the instructions shown

# Verify service is running
pm2 status

# Expected output:
# ┌─────┬──────────────────────┬─────────────┬─────────┬─────────┬──────────┐
# │ id  │ name                 │ mode        │ ↺       │ status  │ cpu      │
# ├─────┼──────────────────────┼─────────────┼─────────┼─────────┼──────────┤
# │ 0   │ doc-automation-hub   │ fork        │ 0       │ online  │ 0%       │
# └─────┴──────────────────────┴─────────────┴─────────┴─────────┴──────────┘
```

### Option 2: Start Manually (For Testing)

```bash
cd /home/ubuntu/services/doc-automation-hub
node server.js

# You should see:
# {"timestamp":"...","level":"info","message":"Documentation Automation Hub started","port":6000,"projects":4,"maxConcurrentJobs":2}
```

### Verify Service is Running

```bash
# Check health endpoint
curl http://localhost:6000/health | jq .

# Expected response:
# {
#   "status": "ok",
#   "timestamp": "2024-01-20T10:30:00.000Z",
#   "uptime": 5,
#   "activeJobs": 0,
#   "queueLength": 0
# }
```

---

## 📊 Monitoring and Logs

### View Logs

```bash
# Real-time PM2 logs
pm2 logs doc-automation-hub

# View specific log file
tail -f /home/ubuntu/services/doc-automation-hub/logs/hub-$(date +%Y-%m-%d).log

# View error logs
cat /home/ubuntu/services/doc-automation-hub/logs/error.log
```

### Check Service Status

```bash
# PM2 status
pm2 status doc-automation-hub

# Detailed info
pm2 info doc-automation-hub

# Resource usage
pm2 monit
```

### Restart Service

```bash
# Restart
pm2 restart doc-automation-hub

# Stop
pm2 stop doc-automation-hub

# Delete (stop and remove from PM2)
pm2 delete doc-automation-hub
```

---

## 🧪 Testing the Service

### Test 1: Health Check

```bash
curl -X GET http://localhost:6000/health | jq .
```

**Expected:** Status 200, JSON with uptime and queue info

### Test 2: Manual Webhook (Without Signature - Will Fail)

```bash
curl -X POST http://localhost:6000/webhook/generate-docs \
  -H "Content-Type: application/json" \
  -d '{"repository":{"name":"wish-backend-x"},"after":"test123","ref":"refs/heads/main"}'
```

**Expected:** Status 401, "Invalid signature" error (this is correct!)

### Test 3: Manual Webhook (With Valid Signature)

```bash
# Set your webhook secret
WEBHOOK_SECRET="your-webhook-secret-here"

# Create payload
PAYLOAD='{"repository":{"name":"wish-backend-x"},"after":"test123","ref":"refs/heads/main"}'

# Generate HMAC signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.* //')

# Send webhook with signature
curl -X POST http://localhost:6000/webhook/generate-docs \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$PAYLOAD"
```

**Expected:** Status 202, "Documentation generation queued" message

### Test 4: Generate Documentation Manually

```bash
# Test documentation generation for one project
cd /home/ubuntu/workspace/wish-backend-x
bash /home/ubuntu/services/doc-automation-hub/handlers/generate-docs.sh wish-backend-x
```

**Expected:**
- Creates feature branch
- Runs Cartographer
- Commits changes
- Creates PR
- Returns to main branch

---

## ✅ Phase 1 Complete Checklist

- [ ] `.env` file created with all secrets
- [ ] `GITHUB_TOKEN` added to `.env`
- [ ] `WEBHOOK_SECRET` generated and added to `.env`
- [ ] Claude Code CLI verified (`which claude`)
- [ ] GitHub CLI verified (`which gh`)
- [ ] GitHub CLI authenticated (`gh auth status`)
- [ ] Git configured for Documentation Bot
- [ ] All 4 project workspaces verified
- [ ] Service started with PM2
- [ ] Health check endpoint working
- [ ] PM2 startup script configured
- [ ] PM2 process list saved

---

## 📝 Next Steps: Phase 2 - GitHub Actions Integration

Once Phase 1 is verified working, proceed to Phase 2:

1. **Update GitHub Actions workflows** in all 4 repositories:
   - Remove defunct OpenHands API calls
   - Add webhook trigger to this hub
   - Implement HMAC signature generation

2. **Create post-merge workflows** for service restart

3. **Test complete end-to-end flow**

---

## 🆘 Troubleshooting

### Service Won't Start

```bash
# Check logs
pm2 logs doc-automation-hub --err

# Common issues:
# 1. Port already in use
sudo lsof -i :6000
pm2 stop <conflicting-process>

# 2. Missing environment variables
cat /home/ubuntu/services/doc-automation-hub/.env

# 3. Missing dependencies
cd /home/ubuntu/services/doc-automation-hub
npm install
```

### Claude Code CLI Not Found

```bash
# Find Claude installation
which claude
# or
find /usr -name "claude" 2>/dev/null

# Update .env with correct path
nano /home/ubuntu/services/doc-automation-hub/.env
# CLAUDE_CODE_PATH=/path/to/claude

# Restart service
pm2 restart doc-automation-hub
```

### GitHub CLI Not Authenticated

```bash
# Re-authenticate
echo "YOUR_GITHUB_TOKEN" | gh auth login --with-token

# Verify
gh auth status

# Test PR creation
cd /home/ubuntu/workspace/wish-backend-x
gh pr list
```

### Documentation Not Generated

```bash
# Test Cartographer manually
cd /home/ubuntu/workspace/wish-backend-x
claude

# In Claude prompt, type:
# "map this codebase"

# Verify docs/CODEBASE_MAP.md was created
ls -la docs/CODEBASE_MAP.md
```

---

## 📞 Support

- **Logs Location**: `/home/ubuntu/services/doc-automation-hub/logs/`
- **Configuration**: `/home/ubuntu/services/doc-automation-hub/project-registry.json`
- **Full Documentation**: `/home/ubuntu/services/doc-automation-hub/README.md`

---

**Status**: ✅ Phase 1 Setup Complete - Ready for Configuration and Testing

**Next Action**: Complete the checklist above, then proceed to Phase 2 (GitHub Actions Integration)
