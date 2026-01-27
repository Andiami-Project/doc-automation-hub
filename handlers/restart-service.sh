#!/bin/bash

###############################################################################
# Service Restart Handler
#
# Restarts application services after documentation PR is merged
#
# Usage: ./restart-service.sh <project-name>
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Input validation
if [ -z "${1:-}" ]; then
    echo -e "${RED}Error: Project name required${NC}"
    echo "Usage: $0 <project-name>"
    exit 1
fi

PROJECT_NAME="$1"
SERVICE_TYPE="${SERVICE_TYPE:-pm2}"
SERVICE_NAME="${SERVICE_NAME:-$PROJECT_NAME}"
RESTART_COMMAND="${RESTART_COMMAND:-pm2 restart $SERVICE_NAME}"
WORKSPACE_PATH="${WORKSPACE_PATH:-/home/ubuntu/workspace/$PROJECT_NAME}"

echo -e "${GREEN}=== Restarting Service ===${NC}"
echo "Project: $PROJECT_NAME"
echo "Service Type: $SERVICE_TYPE"
echo "Service Name: $SERVICE_NAME"

# Change to workspace
cd "$WORKSPACE_PATH" || {
    echo -e "${RED}Error: Workspace path not found: $WORKSPACE_PATH${NC}"
    exit 1
}

# Pull latest changes (including merged documentation)
echo -e "${YELLOW}Pulling latest changes...${NC}"
git fetch origin
git checkout main
git pull origin main

# Restart service based on type
echo -e "${YELLOW}Restarting service...${NC}"

case "$SERVICE_TYPE" in
    pm2)
        if ! command -v pm2 &> /dev/null; then
            echo -e "${RED}Error: PM2 is not installed${NC}"
            exit 1
        fi

        # Check if service exists
        if pm2 list | grep -q "$SERVICE_NAME"; then
            echo "Restarting PM2 service: $SERVICE_NAME"
            eval "$RESTART_COMMAND"
            pm2 save

            # Verify service is running
            sleep 2
            if pm2 list | grep "$SERVICE_NAME" | grep -q "online"; then
                echo -e "${GREEN}Service restarted successfully${NC}"
            else
                echo -e "${RED}Warning: Service may not be running properly${NC}"
                pm2 logs "$SERVICE_NAME" --lines 20
            fi
        else
            echo -e "${YELLOW}Service not found in PM2, attempting to start...${NC}"
            cd "$WORKSPACE_PATH"
            npm install --production 2>/dev/null || true
            pm2 start ecosystem.config.js --only "$SERVICE_NAME" 2>/dev/null || \
            pm2 start package.json --name "$SERVICE_NAME"
            pm2 save
        fi
        ;;

    docker)
        if ! command -v docker &> /dev/null; then
            echo -e "${RED}Error: Docker is not installed${NC}"
            exit 1
        fi

        echo "Restarting Docker container: $SERVICE_NAME"
        docker restart "$SERVICE_NAME" || {
            echo -e "${RED}Failed to restart Docker container${NC}"
            exit 1
        }

        # Verify container is running
        sleep 2
        if docker ps | grep -q "$SERVICE_NAME"; then
            echo -e "${GREEN}Container restarted successfully${NC}"
        else
            echo -e "${RED}Warning: Container may not be running${NC}"
            docker logs "$SERVICE_NAME" --tail 20
        fi
        ;;

    systemd)
        if ! command -v systemctl &> /dev/null; then
            echo -e "${RED}Error: systemctl is not available${NC}"
            exit 1
        fi

        echo "Restarting systemd service: $SERVICE_NAME"
        sudo systemctl restart "$SERVICE_NAME" || {
            echo -e "${RED}Failed to restart systemd service${NC}"
            exit 1
        }

        # Verify service is active
        sleep 2
        if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
            echo -e "${GREEN}Service restarted successfully${NC}"
        else
            echo -e "${RED}Warning: Service may not be active${NC}"
            sudo systemctl status "$SERVICE_NAME" --no-pager
        fi
        ;;

    custom)
        echo "Executing custom restart command"
        eval "$RESTART_COMMAND" || {
            echo -e "${RED}Custom restart command failed${NC}"
            exit 1
        }
        echo -e "${GREEN}Custom command executed${NC}"
        ;;

    *)
        echo -e "${RED}Error: Unknown service type: $SERVICE_TYPE${NC}"
        echo "Supported types: pm2, docker, systemd, custom"
        exit 1
        ;;
esac

echo -e "${GREEN}=== Service Restart Complete ===${NC}"

exit 0
