#!/usr/bin/env node
/**
 * Secret scanner CLI — Phase 8 Prompt 71 + 76.
 *
 * Standalone Node.js script that scans the project for secrets.
 * Used by CI (`npm run secret-scan`) as a release-blocking gate.
 */

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const SUPABASE_SERVICE_ROLE_PATTERN = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+.*"role"\s*:\s*"service_role"[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/;
const PRIVATE_KEY_PATTERN = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/;
const OAUTH_SECRET_PATTERN = /(?:client_secret|clientSecret|oauth_secret|OAUTH_CLIENT_SECRET)\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}['"]?/i;
const PROVIDER_SECRET_PATTERN = /(?:GOOGLE_CLIENT_SECRET|APPLE_CLIENT_SECRET|GOOGLE_SERVICE_ACCOUNT|APPLE_APP_SPECIFIC_PASSWORD)\s*[:=]/i;
const STRIPE_SECRET_PATTERN = /sk_live_[A-Za-z0-9]{20,}/;
const AWS_KEY_PATTERN = /AKIA[0-9A-Z]{16}/;
const BEARER_TOKEN_PATTERN = /Bearer\s+[A-Za-z0-9_-]{20,}/;
const API_KEY_PATTERN = /(?:api_key|apiKey|apikey|API_KEY)\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}['"]?/i;
const PASSWORD_PATTERN = /(?:password|passwd|pwd)\s*[:=]\s*['"]([A-Za-z0-9!@#$%^&*()_+\-={}|[\]\\:;<>?,./]{16,})['"]/i;

const ALL_PATTERNS = [
  { name: 'supabase_service_role_key', pattern: SUPABASE_SERVICE_ROLE_PATTERN, severity: 'critical' },
  { name: 'private_key_pem', pattern: PRIVATE_KEY_PATTERN, severity: 'critical' },
  { name: 'oauth_client_secret', pattern: OAUTH_SECRET_PATTERN, severity: 'critical' },
  { name: 'provider_secret', pattern: PROVIDER_SECRET_PATTERN, severity: 'critical' },
  { name: 'stripe_secret_key', pattern: STRIPE_SECRET_PATTERN, severity: 'critical' },
  { name: 'aws_access_key', pattern: AWS_KEY_PATTERN, severity: 'critical' },
  { name: 'bearer_token', pattern: BEARER_TOKEN_PATTERN, severity: 'high' },
  { name: 'api_key', pattern: API_KEY_PATTERN, severity: 'high' },
  { name: 'password_assignment', pattern: PASSWORD_PATTERN, severity: 'medium' },
];

function isRealSupabaseAnonKey(value) {
  if (value.length < 150) return false;
  if (/placeholder|example|your-|xxx|fake|test|dummy|sample/i.test(value)) return false;
  return true;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', '.expo', 'dist', 'web-build', '.husky', 'tool-results', 'upload', 'scripts']);
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.env', '.yaml', '.yml', '.md', '.txt', '.sh', '.sql', '.toml']);
const TEMPLATE_FILES = new Set(['.env.example', '.env.template', '.secretlintignore', 'secret-scanner.js']);

function shouldSkip(filePath) {
  const parts = filePath.split(path.sep);
  for (const part of parts) {
    if (SKIP_DIRS.has(part)) return true;
  }
  const base = path.basename(filePath);
  if (TEMPLATE_FILES.has(base)) return true;
  if (base.startsWith('.') && !base.startsWith('.env')) return true;
  const ext = path.extname(filePath);
  if (base === '.env') return false;
  if (ext && !SCAN_EXTENSIONS.has(ext)) return true;
  if (filePath.includes('__tests__') || filePath.includes('.test.')) return true;
  if (base === 'secret-classifier.ts' || base === 'secret-scanner.ts') return true;
  if (filePath.includes('legal/') || filePath.includes('store/')) return true;
  return false;
}

function scanLine(line, lineNumber, filePath) {
  const findings = [];
  for (const { name, pattern, severity } of ALL_PATTERNS) {
    const match = pattern.exec(line);
    if (match) {
      const matched = match[0];
      const masked = matched.length > 16 ? `${matched.slice(0, 8)}...${matched.slice(-4)}` : '***';
      findings.push({ filePath, lineNumber, columnStart: match.index, secretType: name, severity, matchedValue: masked });
    }
  }
  const anonMatches = line.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g);
  for (const m of anonMatches) {
    if (isRealSupabaseAnonKey(m[0])) {
      const masked = `${m[0].slice(0, 8)}...${m[0].slice(-4)}`;
      findings.push({ filePath, lineNumber, columnStart: m.index, secretType: 'supabase_anon_key_real', severity: 'high', matchedValue: masked });
    }
  }
  return findings;
}

function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const findings = [];
    for (let i = 0; i < lines.length; i++) {
      findings.push(...scanLine(lines[i], i + 1, filePath));
    }
    return findings;
  } catch { return []; }
}

function main() {
  const findings = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(fullPath); }
      else if (entry.isFile()) {
        const relPath = path.relative(PROJECT_ROOT, fullPath);
        if (shouldSkip(relPath)) continue;
        findings.push(...scanFile(fullPath));
      }
    }
  }
  walk(PROJECT_ROOT);
  if (findings.length === 0) {
    console.log('✅ Secret scan: CLEAN — no secrets detected.');
    process.exit(0);
  } else {
    console.error(`❌ Secret scan: ${findings.length} secret(s) detected!`);
    for (const f of findings) {
      console.error(`  ${f.filePath}:${f.lineNumber} [${f.severity}] ${f.secretType} — ${f.matchedValue}`);
    }
    process.exit(1);
  }
}

main();
