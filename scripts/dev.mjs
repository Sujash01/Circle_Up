import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Ensure backend/.env exists on fresh clones so the API binds the same port as Vite proxy
const backendEnvPath = path.join(rootDir, 'backend', '.env');
const backendExamplePath = path.join(rootDir, 'backend', '.env.example');
if (!fs.existsSync(backendEnvPath) && fs.existsSync(backendExamplePath)) {
  fs.copyFileSync(backendExamplePath, backendEnvPath);
  console.log('[setup] Created backend/.env from backend/.env.example');
}

const children = [];
let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.pid || child.killed) continue;
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // Child may have already exited
      }
    } else {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(exitCode), 150);
}

function prefixStream(stream, label, target) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      target.write(`[${label}] ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer) target.write(`[${label}] ${buffer}\n`);
  });
}

function startWorkspace(label, scriptName) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const args =
    process.platform === 'win32' ? ['/d', '/s', '/c', `npm run ${scriptName}`] : ['run', scriptName];

  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  prefixStream(child.stdout, label, process.stdout);
  prefixStream(child.stderr, label, process.stderr);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[${label}] exited with code ${code ?? 1}`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

startWorkspace('backend', 'dev:backend');
startWorkspace('frontend', 'dev:frontend');
