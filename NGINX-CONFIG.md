# Nginx Configuration for Doc Automation Hub

## Overview

The doc-automation-hub service is now exposed via nginx reverse proxy at:
- **Domain**: `y1.andiami.tech`
- **Base Path**: `/doc-hub/`
- **Internal Port**: 6000 (localhost)

## Endpoints

### 1. Health Check Endpoint
**URL**: `http://y1.andiami.tech/doc-hub/health`

**Purpose**: Monitor service health and status

**Example**:
```bash
curl http://y1.andiami.tech/doc-hub/health
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-01-23T14:40:34.971Z",
  "uptime": 384.474493576,
  "activeJobs": 0,
  "queueLength": 0
}
```

### 2. Documentation Generation Webhook
**URL**: `http://y1.andiami.tech/doc-hub/webhook/generate-docs`

**Method**: POST

**Authentication**: HMAC-SHA256 signature in `X-Hub-Signature-256` header

**Purpose**: Trigger documentation generation for a project

**Example** (from GitHub Actions):
```yaml
- name: Trigger Documentation Generation
  run: |
    PAYLOAD='{"repository":"wish-x","branch":"main","reason":"code_update"}'
    SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "${{ secrets.WEBHOOK_SECRET }}" -binary | xxd -p -c 256)

    curl -X POST \
      -H "Content-Type: application/json" \
      -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
      -d "$PAYLOAD" \
      http://y1.andiami.tech/doc-hub/webhook/generate-docs
```

### 3. Service Restart Webhook
**URL**: `http://y1.andiami.tech/doc-hub/webhook/restart-service`

**Method**: POST

**Authentication**: HMAC-SHA256 signature in `X-Hub-Signature-256` header

**Purpose**: Restart a service after documentation update

**Example**:
```bash
PAYLOAD='{"service":"wish-x"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "your-webhook-secret" -binary | xxd -p -c 256)

curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -d "$PAYLOAD" \
  http://y1.andiami.tech/doc-hub/webhook/restart-service
```

## Security Features

### 1. HMAC Signature Validation
All webhook endpoints validate the `X-Hub-Signature-256` header using the webhook secret from `.env`:
- **Algorithm**: HMAC-SHA256
- **Secret**: Stored in `WEBHOOK_SECRET` environment variable
- **Header Format**: `sha256=<hex_signature>`

### 2. Rate Limiting
- **Zone**: `webhook_limit` (10MB memory, shared across all webhook endpoints)
- **Rate**: 10 requests per minute per IP address
- **Burst**: 5 requests (allows brief bursts)
- **Behavior**: Reject excess requests with HTTP 429 (Too Many Requests)

### 3. Security Headers
All responses include:
- `X-Content-Type-Options: nosniff` (prevent MIME type sniffing)
- `X-Frame-Options: DENY` (prevent clickjacking)
- `X-XSS-Protection: 1; mode=block` (XSS protection)

### 4. Request Limits
- **Max Body Size**: 10MB (GitHub webhook payloads can be large)
- **Connect Timeout**: 60 seconds
- **Read Timeout**: 300 seconds (5 minutes - allows long-running doc generation)

## Nginx Configuration Details

### Site Configuration
File: `/etc/nginx/sites-available/y1.andiami.tech`

```nginx
# Documentation Automation Hub - Webhook Service
# Health check endpoint (public for monitoring)
location /doc-hub/health {
    proxy_pass http://127.0.0.1:6000/health;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
}

# Webhook endpoints (protected by HMAC signature validation in Express)
location /doc-hub/webhook/ {
    proxy_pass http://127.0.0.1:6000/webhook/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Webhook-specific settings
    proxy_read_timeout 300s;  # Allow long-running doc generation
    proxy_connect_timeout 60s;
    client_max_body_size 10M;  # GitHub webhook payloads can be large

    # Rate limiting (prevent abuse)
    limit_req zone=webhook_limit burst=5 nodelay;

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
}
```

### Global Configuration
File: `/etc/nginx/nginx.conf`

Added rate limiting zone in `http` block:
```nginx
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=webhook_limit:10m rate=10r/m;
```

## Testing

### Test Health Endpoint
```bash
# Should return 200 OK with JSON status
curl -v http://y1.andiami.tech/doc-hub/health
```

### Test Webhook Authentication
```bash
# Should return 401 Unauthorized (missing signature)
curl -X POST http://y1.andiami.tech/doc-hub/webhook/generate-docs

# Should return 401 Unauthorized (invalid signature)
curl -X POST \
  -H "X-Hub-Signature-256: sha256=invalid" \
  -H "Content-Type: application/json" \
  -d '{"test":"data"}' \
  http://y1.andiami.tech/doc-hub/webhook/generate-docs
```

### Test Rate Limiting
```bash
# Send 15 requests rapidly (should get 429 after 15 requests)
for i in {1..15}; do
  curl -I http://y1.andiami.tech/doc-hub/health
done
```

## Maintenance

### Reload Nginx Configuration
```bash
# Test configuration first
sudo nginx -t

# If test passes, reload
sudo systemctl reload nginx
```

### Check Nginx Logs
```bash
# Access log (successful requests)
sudo tail -f /var/log/nginx/access.log | grep doc-hub

# Error log (failed requests, rate limiting)
sudo tail -f /var/log/nginx/error.log | grep doc-hub
```

### Monitor Rate Limiting
```bash
# Check for rate limit errors
sudo grep "limiting requests" /var/log/nginx/error.log
```

## Backup

Configuration backup created at:
```bash
ls -l /etc/nginx/sites-available/y1.andiami.tech.backup-*
```

## Next Steps

With nginx configured, you can now proceed to **Phase 2: GitHub Actions Integration**:

1. Update GitHub Actions workflows in all 4 repositories
2. Add webhook calls to doc-automation-hub
3. Implement HMAC signature generation in workflows
4. Test end-to-end documentation generation
5. Add post-merge service restart webhooks

## Troubleshooting

### Webhook Returns 502 Bad Gateway
- Check if PM2 service is running: `pm2 status doc-automation-hub`
- Check service logs: `pm2 logs doc-automation-hub`
- Verify port 6000 is listening: `sudo lsof -i :6000`

### Webhook Returns 401 Unauthorized
- Verify HMAC signature calculation matches server expectation
- Check webhook secret matches in both GitHub Actions and `.env`
- Ensure `X-Hub-Signature-256` header format: `sha256=<hex_signature>`

### Rate Limiting Too Aggressive
- Increase rate limit in `/etc/nginx/nginx.conf`:
  ```nginx
  limit_req_zone $binary_remote_addr zone=webhook_limit:10m rate=20r/m;  # Increased to 20/min
  ```
- Reload nginx: `sudo systemctl reload nginx`

### Service Not Restarting on Reboot
- Check PM2 startup configuration: `pm2 startup`
- Verify systemd service: `systemctl status pm2-ubuntu`
- Re-save PM2 process list: `pm2 save`
