# Documentation Automation Hub

Central webhook service for automated documentation generation across multiple projects using Claude Code CLI and Cartographer.

## Architecture

```
GitHub Actions → Webhook → Central Hub (EC2) → Claude Code CLI → Cartographer → PR Creation
                                              ↓
                                      Queue Manager
                                              ↓
                                    Service Restart (Post-Merge)
```

## Features

- **Multi-Project Support**: Manages documentation for 4 projects
- **Webhook-Based**: Secure HMAC-signed webhooks from GitHub Actions
- **Queue Management**: Handles concurrent documentation generation jobs
- **PR-Based Workflow**: Creates pull requests instead of direct commits
- **Auto-Restart**: Restarts services after documentation PR merge
- **Centralized Logging**: All operations logged with timestamps

## Projects Managed

1. **wish-x** - Main wish application
2. **wish-backend-x** - Backend API server
3. **as-you-wish-multi-agent** - Multi-agent orchestration system
4. **claude-agent-server** - Claude agent server

## Directory Structure

```
/home/ubuntu/services/doc-automation-hub/
├── server.js                    # Main webhook listener (Express.js)
├── project-registry.json        # Project configurations
├── package.json                 # Node.js dependencies
├── ecosystem.config.js          # PM2 configuration
├── .env                         # Environment variables (secrets)
├── .env.example                 # Environment template
├── handlers/
│   ├── generate-docs.sh         # Documentation generation script
│   ├── create-pr.sh             # PR creation script
│   └── restart-service.sh       # Service restart handler
├── logs/                        # Application logs
└── README.md                    # This file
```

## Setup

### 1. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
nano .env
```

Required variables:
- `GITHUB_TOKEN`: Personal access token with repo and workflow permissions
- `GITHUB_WEBHOOK_SECRET`: Shared secret for webhook signature validation
- `PORT`: Webhook listener port (default: 6000)

### 2. Start the Service

```bash
# Start with PM2
pm2 start ecosystem.config.js

# View logs
pm2 logs doc-automation-hub

# Check status
pm2 status
```

### 3. Configure GitHub Webhooks

For each project, add webhook configuration in GitHub Actions:

```yaml
- name: Trigger Documentation Update
  run: |
    PAYLOAD='{"repository": {"name": "${{ github.event.repository.name }}"}, "after": "${{ github.sha }}", "ref": "${{ github.ref }}"}'
    SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "${{ secrets.WEBHOOK_SECRET }}" | sed 's/^.* //')

    curl -X POST http://your-ec2-ip:6000/webhook/generate-docs \
      -H "Content-Type: application/json" \
      -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
      -d "$PAYLOAD"
```

## API Endpoints

### Health Check
```
GET /health

Response:
{
  "status": "ok",
  "timestamp": "2024-01-20T10:30:00.000Z",
  "uptime": 3600,
  "activeJobs": 1,
  "queueLength": 2
}
```

### Generate Documentation
```
POST /webhook/generate-docs
Headers:
  - X-Hub-Signature-256: sha256=<hmac>
  - Content-Type: application/json

Body:
{
  "repository": {
    "name": "wish-backend-x"
  },
  "after": "abc123...",
  "ref": "refs/heads/main"
}

Response (202 Accepted):
{
  "message": "Documentation generation queued",
  "project": "wish-backend-x",
  "queuePosition": 1,
  "estimatedWaitTime": "Processing soon"
}
```

### Restart Service
```
POST /webhook/restart-service
Headers:
  - X-Hub-Signature-256: sha256=<hmac>
  - Content-Type: application/json

Body:
{
  "repository": {
    "name": "wish-backend-x"
  },
  "ref": "refs/heads/main",
  "head_commit": {
    "message": "Merge pull request #123..."
  },
  "after": "def456..."
}

Response (200 OK):
{
  "success": true,
  "message": "Service restarted",
  "output": "..."
}
```

## Workflow

### Documentation Update Flow

1. **Trigger**: Push to main branch in any monitored project
2. **GitHub Action**: Sends webhook to hub with project info
3. **Hub Receives**: Validates HMAC signature, queues job
4. **Job Processing**:
   - Pulls latest code in workspace
   - Creates feature branch (e.g., `docs/auto-update-20240120-103000`)
   - Runs Claude Code CLI with Cartographer skill
   - Generates/updates `docs/CODEBASE_MAP.md`
   - Commits changes to feature branch
   - Pushes branch to GitHub
   - Creates pull request with detailed description
5. **Review**: Developer reviews PR, approves/merges
6. **Post-Merge**: Hub receives merge webhook, restarts service

### Service Restart Flow

1. **Trigger**: PR merge to main branch
2. **GitHub Action**: Sends webhook to hub
3. **Hub Validates**: Confirms it's a merge event
4. **Restart Handler**:
   - Pulls latest changes (including docs)
   - Restarts service (PM2/Docker/systemd)
   - Verifies service is running
   - Logs outcome

## Handlers

### generate-docs.sh

Orchestrates documentation generation:
- Creates feature branch
- Runs Cartographer via Claude Code CLI
- Commits and pushes changes
- Calls create-pr.sh

### create-pr.sh

Creates GitHub pull request:
- Uses GitHub CLI (`gh`)
- Adds labels and assignees
- Includes metadata (commit SHA, trigger event)
- Returns PR URL

### restart-service.sh

Restarts application services:
- Supports PM2, Docker, systemd, custom commands
- Pulls latest code
- Verifies service status
- Logs restart outcome

## Configuration

### project-registry.json

Central configuration for all managed projects:

```json
{
  "projects": {
    "wish-x": {
      "enabled": true,
      "repo_owner": "andiaminukman2",
      "repo_name": "wish-x",
      "workspace_path": "/home/ubuntu/workspace/wish-x",
      "service_type": "pm2",
      "service_name": "wish-x",
      "restart_command": "pm2 restart wish-x",
      ...
    }
  },
  "settings": {
    "webhook_port": 6000,
    "max_concurrent_jobs": 2,
    "job_timeout_minutes": 30,
    ...
  }
}
```

## Monitoring

### View Logs
```bash
# PM2 logs
pm2 logs doc-automation-hub

# Application logs (JSON format)
tail -f logs/hub-$(date +%Y-%m-%d).log

# Error logs
cat logs/error.log
```

### Check Queue Status
```bash
curl http://localhost:6000/health | jq .
```

### Monitor Disk Space
```bash
# Check workspace sizes
du -sh /home/ubuntu/workspace/*

# Check logs size
du -sh /home/ubuntu/services/doc-automation-hub/logs
```

## Troubleshooting

### Documentation Not Generated

1. Check hub logs: `pm2 logs doc-automation-hub`
2. Verify Claude Code CLI: `which claude`
3. Check workspace path: `ls /home/ubuntu/workspace/<project>`
4. Test Cartographer manually: `cd workspace && claude`

### PR Not Created

1. Verify GitHub CLI: `gh auth status`
2. Check GitHub token permissions (repo, workflow)
3. Review create-pr.sh output in logs
4. Test manually: `cd workspace && gh pr create --help`

### Service Not Restarting

1. Check service status: `pm2 status` or `docker ps`
2. Review restart-service.sh logs
3. Verify service configuration in project-registry.json
4. Test manually: `bash handlers/restart-service.sh <project-name>`

### Webhook Signature Mismatch

1. Verify `WEBHOOK_SECRET` matches GitHub Actions secret
2. Check payload format in GitHub Actions
3. Review server logs for signature validation errors
4. Test signature generation: `echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET"`

## Security

- **HMAC Signatures**: All webhooks must have valid signatures
- **No Public Exposure**: Webhook endpoint only accessible from GitHub IPs (configure firewall)
- **Environment Secrets**: Store tokens in `.env`, never commit
- **Git Hooks**: Use `[skip ci]` to prevent infinite loops
- **Least Privilege**: GitHub token has minimal required permissions

## Maintenance

### Update Project Configuration

```bash
nano /home/ubuntu/services/doc-automation-hub/project-registry.json
pm2 restart doc-automation-hub
```

### Rotate GitHub Token

```bash
nano /home/ubuntu/services/doc-automation-hub/.env
pm2 restart doc-automation-hub
```

### Clean Old Logs

```bash
# Logs older than 7 days are automatically rotated
find /home/ubuntu/services/doc-automation-hub/logs -name "*.log" -mtime +7 -delete
```

### Upgrade Dependencies

```bash
cd /home/ubuntu/services/doc-automation-hub
npm update
pm2 restart doc-automation-hub
```

## Support

For issues or questions:
1. Check logs: `pm2 logs doc-automation-hub`
2. Review GitHub Actions workflow runs
3. Test components individually (handlers)
4. Check project registry configuration

## License

MIT
