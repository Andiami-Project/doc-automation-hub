#!/usr/bin/env node

import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
});

const projectPath = process.argv[2];
const outputFile = process.argv[3] || '/tmp/cartographer-output.txt';

if (!projectPath) {
  console.error('❌ Error: Project path is required');
  process.exit(1);
}

console.log('🚀 Starting Programmatic Documentation Generation');
console.log('📁 Project Path:', projectPath);

// Step 1: Run scanner script to analyze codebase
async function runScanner() {
  console.log('\n📊 Step 1: Scanning codebase...');
  
  const scannerScript = '/home/ubuntu/.claude/plugins/cache/kingbootoshi/cartographer/1.4.0/skills/cartographer/scripts/scan-codebase.py';
  
  if (!existsSync(scannerScript)) {
    console.warn('⚠️  Scanner script not found, using fallback file analysis');
    return await fallbackFileAnalysis();
  }
  
  return new Promise((resolve, reject) => {
    const scanner = spawn('uv', ['run', scannerScript, '.', '--format', 'json'], {
      cwd: projectPath,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    // Handle spawn errors (e.g., uv not found)
    scanner.on('error', (error) => {
      console.warn('⚠️  Scanner failed:', error.message, '- using fallback');
      resolve(fallbackFileAnalysis());
    });

    scanner.stdout.on('data', (data) => stdout += data);
    scanner.stderr.on('data', (data) => stderr += data);

    scanner.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          resolve(fallbackFileAnalysis());
        }
      } else {
        resolve(fallbackFileAnalysis());
      }
    });

    setTimeout(() => {
      scanner.kill();
      resolve(fallbackFileAnalysis());
    }, 30000); // 30 second timeout
  });
}

// Fallback if scanner fails
function fallbackFileAnalysis() {
  const files = [];
  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
  
  function scanDir(dir) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory() && !ignoreDirs.includes(entry)) {
          scanDir(fullPath);
        } else if (stat.isFile()) {
          const ext = entry.split('.').pop();
          if (['js', 'ts', 'jsx', 'tsx', 'json', 'md', 'py', 'sh', 'yaml', 'yml'].includes(ext)) {
            files.push({
              path: relative(projectPath, fullPath),
              size: stat.size,
              tokens: Math.ceil(stat.size / 4) // Rough estimate
            });
          }
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  }
  
  scanDir(projectPath);
  return { files, total_tokens: files.reduce((sum, f) => sum + f.tokens, 0) };
}

// Step 2: Group files for analysis
function groupFiles(scanResult) {
  const MAX_TOKENS = 120000; // Leave room for prompt overhead
  const groups = [];
  let currentGroup = [];
  let currentTokens = 0;
  
  for (const file of scanResult.files || []) {
    if (currentTokens + file.tokens > MAX_TOKENS && currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [];
      currentTokens = 0;
    }
    currentGroup.push(file);
    currentTokens += file.tokens;
  }
  
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  
  return groups;
}

// Step 3: Read file contents
function readFiles(group) {
  const contents = [];
  for (const file of group) {
    try {
      const fullPath = join(projectPath, file.path);
      const content = readFileSync(fullPath, 'utf-8');
      contents.push({
        path: file.path,
        content: content
      });
    } catch (e) {
      console.warn(`⚠️  Could not read ${file.path}`);
    }
  }
  return contents;
}

// Step 4: Analyze files with Claude API
async function analyzeGroup(group, groupIndex, totalGroups) {
  console.log(`\n🔍 Analyzing group ${groupIndex + 1}/${totalGroups} (${group.length} files)...`);
  
  const fileContents = readFiles(group);
  
  const prompt = `You are analyzing a subset of a codebase for documentation purposes.

Files in this group:
${fileContents.map(f => `\n## ${f.path}\n\`\`\`\n${f.content.slice(0, 50000)}\n\`\`\``).join('\n')}

Please analyze these files and provide:
1. **Purpose**: What do these files do?
2. **Key Components**: Main classes, functions, or modules
3. **Dependencies**: What do they depend on?
4. **Relationships**: How do they relate to each other?

Keep your analysis concise but comprehensive. Focus on architectural understanding.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    return response.content[0].text;
  } catch (error) {
    console.error(`❌ Error analyzing group ${groupIndex + 1}:`, error.message);
    return `Analysis failed for group ${groupIndex + 1}`;
  }
}

// Step 5: Synthesize final documentation
async function synthesizeDocumentation(analyses, projectName) {
  console.log('\n📝 Synthesizing final documentation...');
  
  const prompt = `You are creating a comprehensive codebase map for the project "${projectName}".

Here are the analyses from different parts of the codebase:

${analyses.map((analysis, i) => `\n## Group ${i + 1} Analysis\n${analysis}`).join('\n')}

Please create a comprehensive CODEBASE_MAP.md with the following sections:

# ${projectName} - Codebase Map

## System Overview
[High-level description of the system architecture]

## Directory Structure
[Annotated directory tree with explanations]

## Core Components
[Description of main components and their responsibilities]

## Data Flow
[How data flows through the system]

## Key Files and Their Purposes
[Important files and what they do]

## Dependencies and Integrations
[External dependencies and how they're used]

## Development Guide
[How to work with this codebase]

## Gotchas and Important Notes
[Non-obvious behaviors, warnings, and tips]

Create a well-structured, comprehensive documentation that helps developers understand this codebase quickly.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    return response.content[0].text;
  } catch (error) {
    console.error('❌ Error synthesizing documentation:', error.message);
    throw error;
  }
}

// Main workflow
async function main() {
  const startTime = Date.now();
  const projectName = projectPath.split('/').pop();
  
  try {
    // Step 1: Scan codebase
    const scanResult = await runScanner();
    console.log(`✅ Found ${scanResult.files?.length || 0} files (${scanResult.total_tokens || 0} tokens)`);
    
    // Step 2: Group files
    const groups = groupFiles(scanResult);
    console.log(`✅ Created ${groups.length} analysis groups`);
    
    // Step 3-4: Analyze each group
    const analyses = [];
    for (let i = 0; i < groups.length; i++) {
      const analysis = await analyzeGroup(groups[i], i, groups.length);
      analyses.push(analysis);
    }
    
    // Step 5: Synthesize documentation
    const documentation = await synthesizeDocumentation(analyses, projectName);
    
    // Step 6: Write to docs/CODEBASE_MAP.md
    const docsDir = join(projectPath, 'docs');
    if (!existsSync(docsDir)) {
      mkdirSync(docsDir, { recursive: true });
    }
    
    const codebaseMapPath = join(docsDir, 'CODEBASE_MAP.md');
    writeFileSync(codebaseMapPath, documentation);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Write summary to output file
    const summary = `✅ Documentation Generation Complete

Project: ${projectName}
Files Analyzed: ${scanResult.files?.length || 0}
Groups: ${groups.length}
Output: docs/CODEBASE_MAP.md
Time: ${elapsed}s

Documentation has been successfully generated at:
${codebaseMapPath}
`;
    
    writeFileSync(outputFile, summary);
    console.log('\n' + summary);
    
    process.exit(0);
  } catch (error) {
    const errorMsg = `❌ Documentation generation failed: ${error.message}`;
    console.error(errorMsg);
    writeFileSync(outputFile, errorMsg);
    process.exit(1);
  }
}

main();
