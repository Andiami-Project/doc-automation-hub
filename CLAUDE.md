# Documentation Automation Hub - Claude Code Instructions

## Project Overview

The **Documentation Automation Hub** is a production-ready webhook service that automates documentation generation for multiple projects. It receives webhooks from GitHub Actions, orchestrates automated documentation generation using Claude AI and the Cartographer skill, creates pull requests with the generated documentation, and handles post-merge service restarts.

**Stack**: Node.js (Express), Bash, Claude AI API, GitHub API, PM2, Nginx
**Deployment**: AWS EC2 with PM2 process manager, nginx reverse proxy
**Domain**: y1.andiami.tech/doc-hub/

## Architecture

```
GitHub Actions → Nginx (rate limiting) → Express Server (webhook listener)
→ Job Queue (max 2 concurrent) → Bash Handlers → Cartographer (Direct API)
→ Claude AI API → Generated Documentation → GitHub PR → Merge → Service Restart
```

## Key Features

- ✅ **Multi-project support** - Manages documentation for 4+ projects from single hub
- ✅ **Secure webhooks** - HMAC-SHA256 signature validation
- ✅ **Reliable automation** - Direct Claude API invocation (no interactive prompts)
- ✅ **PR-based workflow** - All documentation changes reviewed before merge
- ✅ **Queue management** - Handles concurrent jobs with timeouts
- ✅ **Comprehensive logging** - Structured JSON logs with daily rotation
- ✅ **Auto-restart** - PM2 ensures service availability
- ✅ **Production-ready** - Rate limiting, security headers, error handling

## Directory Structure

```
doc-automation-hub/
├── server.js                          # Express webhook listener (397 lines)
├── ecosystem.config.js                # PM2 configuration
├── project-registry.json              # Multi-project configuration database
│
├── handlers/                          # Bash orchestration scripts
│   ├── generate-docs.sh              # Main doc generation workflow
│   ├── create-pr.sh                  # GitHub PR creation
│   └── restart-service.sh            # Post-merge service restart
│
├── utils/                             # Cartographer invocation strategies
│   ├── invoke-cartographer-programmatic.mjs  # ✅ Primary (Direct API)
│   ├── invoke-cartographer.mjs       # ❌ Deprecated (SDK-based)
│   ├── invoke-cartographer-direct.sh # ⚠️  Simple (unreliable)
│   └── invoke-cartographer-v2.sh     # 🧪 Experimental
│
├── logs/                              # Application logs
│   ├── hub-YYYY-MM-DD.log            # Daily JSON logs
│   ├── error.log                     # PM2 stderr
│   └── out.log                       # PM2 stdout
│
└── docs/                              # Generated documentation
    └── CODEBASE_MAP.md               # Detailed codebase map (see below)
```

## Detailed Documentation

For comprehensive architecture, data flow, API endpoints, and implementation details, see:

**[docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md)**

The codebase map includes:
- Complete system architecture with Mermaid diagrams
- Detailed module guide for every file
- Data flow diagrams (documentation generation, service restart)
- API endpoint reference
- External integrations (GitHub, Claude AI, PM2, Nginx)
- Deployment model and infrastructure
- Patterns, conventions, and gotchas
- Navigation guide for common tasks

## Quick Reference

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check and queue status |
| `/webhook/generate-docs` | POST | Trigger documentation generation (HMAC auth) |
| `/webhook/restart-service` | POST | Restart service after PR merge (HMAC auth) |

### Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `server.js` | Express webhook listener, job queue manager | 397 |
| `project-registry.json` | Multi-project configuration database | 119 |
| `handlers/generate-docs.sh` | Main documentation generation workflow | 141 |
| `utils/invoke-cartographer-programmatic.mjs` | Primary Cartographer invocation (Direct API) | 300 |

### Managed Projects

1. **wish-x** - Main wish application
2. **wish-backend-x** - Backend API server
3. **as-you-wish-multi-agent** - Multi-agent orchestration system
4. **claude-agent-server** - Claude agent server

## Environment Variables

Required environment variables (see `.env.example`):

```bash
# GitHub Authentication
GITHUB_TOKEN=ghp_xxx                   # GitHub API token (repo scope)
WEBHOOK_SECRET=<hmac-secret>           # Webhook signature validation

# Service Configuration
PORT=6000                              # Webhook listener port
NODE_ENV=production                    # Environment
MAX_CONCURRENT_JOBS=2                  # Parallel job limit
JOB_TIMEOUT_MINUTES=30                 # Max execution time per job

# Claude AI
ANTHROPIC_API_KEY=sk-ant-xxx           # Claude API key
```

## Development Workflow

### Adding a New Project

1. Update `project-registry.json` with project configuration
2. Configure GitHub webhook in repository settings
3. Restart service: `pm2 restart doc-automation-hub`
4. Test with push to main branch

### Debugging Webhook Issues

```bash
# Application logs (structured JSON)
tail -f logs/hub-$(date +%Y-%m-%d).log | jq .

# PM2 logs
pm2 logs doc-automation-hub --lines 50

# Nginx logs
tail -f /var/log/nginx/access.log | grep doc-hub

# Health check
curl http://y1.andiami.tech/doc-hub/health | jq .
```

### Modifying Documentation Generation

- **Logic**: Edit `handlers/generate-docs.sh` (no restart needed)
- **Cartographer**: Edit `utils/invoke-cartographer-programmatic.mjs` (no restart needed)
- **PR Format**: Edit `handlers/create-pr.sh` (no restart needed)
- **Registry**: Edit `project-registry.json` (requires restart)
- **Environment**: Edit `.env` (requires restart)

### Deployment

```bash
# Update code
cd /home/ubuntu/workspace/doc-automation-hub
git pull origin main
npm install

# Restart service
pm2 restart doc-automation-hub

# Verify
pm2 status
curl http://y1.andiami.tech/doc-hub/health
```

## Important Notes

### Security
- HMAC-SHA256 signature validation on all webhook endpoints
- Rate limiting: 10 requests/minute per IP (burst: 5)
- Security headers via nginx
- Secrets in `.env` (gitignored)

### Reliability
- Direct Claude API invocation (no interactive prompts)
- Job queue with concurrency limits (max 2 jobs)
- Job timeout enforcement (30 minutes default)
- PM2 auto-restart on crash
- Comprehensive error logging

### Gotchas
- ⚠️ HMAC signature requires raw request body (not parsed JSON)
- ⚠️ Cartographer exit code doesn't indicate success (check file existence)
- ⚠️ PM2 restart required after `.env` changes
- ⚠️ Job queue doesn't deduplicate (same commit can trigger multiple jobs)
- ⚠️ Large codebases (>500k tokens) may exceed single-run capacity

## Git Configuration

All commits from this service use:
- **Name**: Andiami-Sumit
- **Email**: sumit@decentra.ca

## PM2 Commands

```bash
pm2 start ecosystem.config.js          # Start service
pm2 restart doc-automation-hub         # Restart
pm2 stop doc-automation-hub            # Stop
pm2 logs doc-automation-hub            # View logs
pm2 status                             # Check status
pm2 save                               # Save process list
```

## Testing

```bash
# Health check
curl http://y1.andiami.tech/doc-hub/health | jq .

# Expected response:
# {
#   "status": "ok",
#   "timestamp": "2026-01-27T...",
#   "uptime": 123.45,
#   "activeJobs": 0,
#   "queueLength": 0
# }

# Trigger documentation generation (requires valid HMAC signature)
# Test via GitHub push to main branch instead
```

## Further Reading

- **README.md** - Comprehensive user documentation
- **SETUP-COMPLETE.md** - Initial setup checklist
- **NGINX-CONFIG.md** - Reverse proxy configuration
- **docs/CODEBASE_MAP.md** - Detailed codebase map (auto-generated)

## Contributing

When modifying this codebase:

1. **Test locally** before pushing to production
2. **Check logs** after deployment: `pm2 logs doc-automation-hub`
3. **Update documentation** if adding features or changing behavior
4. **Follow conventions**: Structured logging, error handling, Git branch naming
5. **Restart service** after configuration changes: `pm2 restart doc-automation-hub`

---

**Last Updated**: 2026-01-27
**Version**: 1.0.0
**Repository**: https://github.com/Andiami-Project/doc-automation-hub
