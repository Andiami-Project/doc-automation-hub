module.exports = {
  apps: [{
    name: 'doc-automation-hub',
    script: 'server.js',
    cwd: '/home/ubuntu/services/doc-automation-hub',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 6000
    },
    error_file: '/home/ubuntu/services/doc-automation-hub/logs/error.log',
    out_file: '/home/ubuntu/services/doc-automation-hub/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    time: true
  }]
};
