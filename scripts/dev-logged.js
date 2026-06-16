/**
 * dev-logged.js — cross-platform tee for `npm run dev`
 *
 * PowerShell 5.1 ile Tee-Object davranışı line-buffered (Vite progress dots
 * görünmez), PS 7'de farklı. Bu Node helper PS sürümünden bağımsız + macOS/Linux
 * uyumlu. Stdout+stderr hem konsola hem logs/dev.log dosyasına yazar.
 *
 * Kullanım: npm run dev:logged
 */
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const logPath = 'logs/dev.log';
mkdirSync(dirname(logPath), { recursive: true });
const out = createWriteStream(logPath, { flags: 'a' });

const startBanner = `\n===== dev start ${new Date().toISOString()} =====\n`;
process.stdout.write(startBanner);
out.write(startBanner);

const child = spawn('npm', ['run', 'dev'], {
  shell: true,
  stdio: ['inherit', 'pipe', 'pipe'],
});

child.stdout.on('data', (d) => {
  process.stdout.write(d);
  out.write(d);
});
child.stderr.on('data', (d) => {
  process.stderr.write(d);
  out.write(d);
});
child.on('exit', (code) => {
  const endBanner = `\n===== dev end (exit ${code ?? 0}) =====\n`;
  process.stdout.write(endBanner);
  out.write(endBanner);
  out.end();
  process.exit(code ?? 0);
});

// Ctrl+C → child'a iletir
process.on('SIGINT', () => {
  child.kill('SIGINT');
});
