import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT_DIR = process.cwd();
const CAD_EXTENSIONS = new Set(['.dwg', '.dxf', '.obj', '.skp']);
const SEARCH_DIRS = ['.', 'uploads', 'ornekler'];

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function isCadFile(filePath) {
  return CAD_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isWithinRoot(candidatePath) {
  const relative = path.relative(ROOT_DIR, candidatePath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function walkCadFiles(directory, bucket = []) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
      await walkCadFiles(fullPath, bucket);
      continue;
    }
    if (entry.isFile() && isCadFile(fullPath)) {
      bucket.push({
        name: entry.name,
        relativePath: path.relative(ROOT_DIR, fullPath).replaceAll('\\', '/'),
        absolutePath: fullPath,
      });
    }
  }
  return bucket;
}

async function findAvailableCadFiles() {
  const discovered = [];
  for (const dir of SEARCH_DIRS) {
    const fullDir = path.join(ROOT_DIR, dir);
    try {
      const stat = await fs.stat(fullDir);
      if (!stat.isDirectory()) continue;
      await walkCadFiles(fullDir, discovered);
    } catch {
      // ignore missing dirs
    }
  }
  return discovered
    .filter((item, index, array) => array.findIndex((other) => other.relativePath === item.relativePath) === index)
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'tr'));
}

async function runPrepareSimulation(cadFile) {
  return new Promise((resolve) => {
    const child = spawn('python', ['prepare_simulation.py', cadFile], {
      cwd: ROOT_DIR,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
      });
    });
  });
}

function localCadApiPlugin() {
  return {
    name: 'local-cad-api',
    configureServer(server) {
      server.middlewares.use('/api/cad-files', async (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }
        try {
          const files = await findAvailableCadFiles();
          sendJson(res, 200, { files: files.map(({ absolutePath, ...rest }) => rest) });
        } catch (error) {
          sendJson(res, 500, { error: String(error) });
        }
      });

      server.middlewares.use('/api/prepare-simulation', async (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        try {
          const body = await readJsonBody(req);
          const cadFile = String(body?.cadFile || '').trim();
          if (!cadFile) {
            sendJson(res, 400, { ok: false, error: 'cadFile gerekli.' });
            return;
          }
          const absolutePath = path.resolve(ROOT_DIR, cadFile);
          if (!isWithinRoot(absolutePath) || !isCadFile(absolutePath)) {
            sendJson(res, 400, { ok: false, error: 'Gecersiz CAD yolu.' });
            return;
          }
          await fs.access(absolutePath);
          const result = await runPrepareSimulation(absolutePath);
          if (!result.ok) {
            sendJson(res, 500, result);
            return;
          }
          sendJson(res, 200, result);
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error) });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localCadApiPlugin()],
  server: {
    proxy: {
      // FAZ 6: FastAPI catalog endpoint
      // /api/catalog* → http://localhost:8000
      // /api/cad-files ve /api/prepare-simulation Vite middleware'inde kalır
      '/api/catalog': 'http://localhost:8000',
      '/api/health': 'http://localhost:8000',
    },
    // OneDrive ile senkronize klasörde native dosya izleme (FSEvents/inotify)
    // güvenilmez — OneDrive sync dosyaları kilitleyip izleyiciyi çökertebiliyor.
    // Polling tabanlı izleme bu ortamlarda kararlıdır. node_modules hariç tutulur.
    watch: {
      usePolling: true,
      interval: 300,
      ignored: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.git/**'],
    },
  },
  build: {
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react-vendor';
          if (id.includes('node_modules/@react-three')) return 'r3f';
        },
      },
    },
  },
});
