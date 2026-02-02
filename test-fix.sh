#!/bin/bash

###############################################################################
# Test Script for Cartographer Branch Logic Fix
###############################################################################

set -e

echo "🧪 Testing Cartographer Branch Logic Fix"
echo "========================================"
echo ""

# Test 1: Check API key validation
echo "Test 1: Verify API key is configured..."
if grep -q "ANTHROPIC_API_KEY=" .env && ! grep -q "ANTHROPIC_API_KEY=$" .env; then
    echo "✅ API key is configured in .env"
else
    echo "❌ FAILED: API key not found in .env"
    exit 1
fi
echo ""

# Test 2: Check script uses programmatic invocation
echo "Test 2: Verify script uses programmatic invocation..."
if grep -q "invoke-cartographer-programmatic.mjs" handlers/generate-docs.sh; then
    echo "✅ Script uses programmatic invocation (no branch checks)"
else
    echo "❌ FAILED: Script not using programmatic invocation"
    exit 1
fi
echo ""

# Test 3: Check API key validation exists in script
echo "Test 3: Verify API key validation in script..."
if grep -q "if \[ -z \"\$ANTHROPIC_API_KEY\" \]; then" handlers/generate-docs.sh; then
    echo "✅ API key validation exists in script"
else
    echo "❌ FAILED: API key validation not found"
    exit 1
fi
echo ""

# Test 4: Check service is running
echo "Test 4: Verify service is running..."
if pm2 list | grep -q "doc-automation-hub.*online"; then
    echo "✅ Service is running"
else
    echo "❌ FAILED: Service is not running"
    exit 1
fi
echo ""

# Test 5: Check health endpoint
echo "Test 5: Verify health endpoint responds..."
if curl -s http://127.0.0.1:6000/health | grep -q '"status":"ok"'; then
    echo "✅ Health endpoint responding"
else
    echo "❌ FAILED: Health endpoint not responding"
    exit 1
fi
echo ""

echo "========================================"
echo "✅ All tests passed!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Test workflow end-to-end: bash handlers/generate-docs.sh wish-backend-x"
echo "2. Monitor logs: pm2 logs doc-automation-hub"
echo "3. Merge a PR to trigger automatic documentation update"
echo ""

exit 0
