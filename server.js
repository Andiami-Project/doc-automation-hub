#!/usr/bin/env node

/**
 * Documentation Automation Hub - Central Webhook Listener
 *
 * Receives webhooks from GitHub Actions and orchestrates documentation generation
 * for multiple projects using Claude Code CLI and Cartographer.
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 6000;

// Middleware - capture raw body for webhook signature verification
app.use(express.json({
  verify: (req, res, buf, encoding) => {
    if (req.path.startsWith('/webhook/')) {
      req.rawBody = buf.toString('utf8');
    }
  }
}));
app.use(express.urlencoded({ extended: true }));

// Load project registry
let projectRegistry;
async function loadProjectRegistry() {
  const registryPath = path.join(__dirname, 'project-registry.json');
  const content = await fs.readFile(registryPath, 'utf8');
  projectRegistry = JSON.parse(content);
  return projectRegistry;
}

// Job queue for managing concurrent documentation generation
const jobQueue = [];
let activeJobs = 0;
const MAX_CONCURRENT_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS || '2');

// Logging utility
function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...meta
  };
  console.log(JSON.stringify(logEntry));

  // Also write to log file
  const logFile = path.join(__dirname, 'logs', `hub-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFile(logFile, JSON.stringify(logEntry) + '\n').catch(err => {
    console.error('Failed to write to log file:', err);
  });
}

// HMAC signature verification
function verifyWebhookSignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    log('warn', 'Missing signature header', {
      headers: Object.keys(req.headers)
    });
    return false;
  }

  const secret = process.env.WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    log('error', 'WEBHOOK_SECRET not configured');
    return false;
  }

  // Use raw body (before JSON parsing) for signature verification
  const payload = req.rawBody || JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));

  if (!isValid) {
    log('warn', 'Signature mismatch', {
      received: signature,
      expected: digest,
      payloadLength: payload.length,
      payloadPreview: payload.substring(0, 100)
    });
  }

  return isValid;
}

// Job processor
async function processJob(job) {
  const { project, payload } = job;
  const startTime = Date.now();

  log('info', 'Processing documentation job', {
    project: project.repo_name,
    commit: payload.after?.substring(0, 7),
    ref: payload.ref
  });

  try {
    // Step 1: Generate documentation using handler script
    const handlerPath = path.join(__dirname, 'handlers', 'generate-docs.sh');
    const result = await execAsync(`bash ${handlerPath} ${project.repo_name}`, {
      env: {
        ...process.env,
        PROJECT_NAME: project.repo_name,
        WORKSPACE_PATH: project.workspace_path,
        COMMIT_SHA: payload.after,
        TRIGGER_EVENT: payload.ref,
        PR_BRANCH_PREFIX: projectRegistry.settings.pr_branch_prefix
      },
      timeout: (parseInt(process.env.JOB_TIMEOUT_MINUTES) || 30) * 60 * 1000
    });

    // Log stderr as warnings if present (e.g., Cartographer scanner warnings)
    if (result.stderr) {
      log('warn', 'Script produced stderr output (may be harmless warnings)', {
        project: project.repo_name,
        stderr: result.stderr.substring(0, 500)
      });
    }

    log('info', 'Documentation generation completed', {
      project: project.repo_name,
      duration: Date.now() - startTime,
      stdout: result.stdout.substring(0, 500)
    });

    return {
      success: true,
      duration: Date.now() - startTime,
      output: result.stdout
    };

  } catch (error) {
    // Only treat as failure if the script actually failed (non-zero exit code)
    // Note: execAsync throws on non-zero exit codes or timeout
    const isTimeout = error.message.includes('timeout') || error.killed;
    const exitCode = error.code || (isTimeout ? 'TIMEOUT' : 'UNKNOWN');

    log('error', 'Documentation generation failed', {
      project: project.repo_name,
      duration: Date.now() - startTime,
      exitCode: exitCode,
      error: error.message,
      stderr: error.stderr?.substring(0, 500),
      stdout: error.stdout?.substring(0, 500)
    });

    return {
      success: false,
      duration: Date.now() - startTime,
      error: error.message,
      exitCode: exitCode
    };
  }
}

// Queue manager
async function processQueue() {
  while (jobQueue.length > 0 && activeJobs < MAX_CONCURRENT_JOBS) {
    const job = jobQueue.shift();
    activeJobs++;

    processJob(job)
      .then(result => {
        log('info', 'Job completed', {
          project: job.project.repo_name,
          success: result.success,
          duration: result.duration
        });
      })
      .catch(error => {
        log('error', 'Job processing error', {
          project: job.project.repo_name,
          error: error.message
        });
      })
      .finally(() => {
        activeJobs--;
        // Process next job in queue
        setImmediate(processQueue);
      });
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeJobs,
    queueLength: jobQueue.length
  });
});

// Webhook endpoint for GitHub Actions
app.post('/webhook/generate-docs', async (req, res) => {
  // Verify webhook signature
  if (!verifyWebhookSignature(req)) {
    log('warn', 'Invalid webhook signature', {
      ip: req.ip,
      headers: req.headers
    });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = req.body;
  const projectName = payload.repository?.name;

  if (!projectName) {
    log('warn', 'Missing project name in webhook payload', { payload });
    return res.status(400).json({ error: 'Missing repository name' });
  }

  // Load project configuration
  if (!projectRegistry) {
    await loadProjectRegistry();
  }

  const project = projectRegistry.projects[projectName];

  if (!project) {
    log('warn', 'Unknown project received webhook', { projectName });
    return res.status(404).json({ error: 'Project not found in registry' });
  }

  if (!project.enabled) {
    log('info', 'Webhook received for disabled project', { projectName });
    return res.status(200).json({ message: 'Project is disabled' });
  }

  // Add job to queue
  jobQueue.push({ project, payload });

  log('info', 'Documentation job queued', {
    project: projectName,
    queuePosition: jobQueue.length,
    activeJobs
  });

  // Respond immediately
  res.status(202).json({
    message: 'Documentation generation queued',
    project: projectName,
    queuePosition: jobQueue.length,
    estimatedWaitTime: activeJobs >= MAX_CONCURRENT_JOBS ?
      `${Math.ceil(jobQueue.length / MAX_CONCURRENT_JOBS) * 5} minutes` :
      'Processing soon'
  });

  // Start processing queue
  setImmediate(processQueue);
});

// Webhook endpoint for service restart (called after PR merge)
app.post('/webhook/restart-service', async (req, res) => {
  // Verify webhook signature
  if (!verifyWebhookSignature(req)) {
    log('warn', 'Invalid webhook signature for restart', {
      ip: req.ip
    });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = req.body;
  const projectName = payload.repository?.name;

  if (!projectName) {
    return res.status(400).json({ error: 'Missing repository name' });
  }

  // Load project configuration
  if (!projectRegistry) {
    await loadProjectRegistry();
  }

  const project = projectRegistry.projects[projectName];

  if (!project || !project.enabled) {
    return res.status(404).json({ error: 'Project not found or disabled' });
  }

  // Check if this is a merge to default branch
  const isMerge = payload.ref === `refs/heads/${project.default_branch}` &&
                  payload.head_commit?.message?.includes('Merge pull request');

  if (!isMerge) {
    return res.status(200).json({ message: 'Not a merge event, skipping restart' });
  }

  log('info', 'Service restart requested', {
    project: projectName,
    commit: payload.after?.substring(0, 7)
  });

  try {
    // Execute restart handler
    const handlerPath = path.join(__dirname, 'handlers', 'restart-service.sh');
    const result = await execAsync(`bash ${handlerPath} ${projectName}`, {
      env: {
        ...process.env,
        PROJECT_NAME: projectName,
        SERVICE_TYPE: project.service_type,
        SERVICE_NAME: project.service_name,
        RESTART_COMMAND: project.restart_command,
        WORKSPACE_PATH: project.workspace_path
      }
    });

    log('info', 'Service restarted successfully', {
      project: projectName,
      output: result.stdout
    });

    res.json({
      success: true,
      message: 'Service restarted',
      output: result.stdout
    });

  } catch (error) {
    log('error', 'Service restart failed', {
      project: projectName,
      error: error.message,
      stderr: error.stderr
    });

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  log('error', 'Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url
  });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    // Create logs directory
    await fs.mkdir(path.join(__dirname, 'logs'), { recursive: true });

    // Load project registry
    await loadProjectRegistry();

    app.listen(PORT, '0.0.0.0', () => {
      log('info', 'Documentation Automation Hub started', {
        port: PORT,
        projects: Object.keys(projectRegistry.projects).length,
        maxConcurrentJobs: MAX_CONCURRENT_JOBS
      });
    });
  } catch (error) {
    log('error', 'Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  log('info', 'SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('info', 'SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server
start();
