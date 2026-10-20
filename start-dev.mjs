import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const backend = path.join(root, 'backend');
const python = path.join(
  backend,
  '.venv',
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python'
);
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const apiUrl = 'http://127.0.0.1:8000/api/salud';
let apiProcess;
let viteProcess;

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function apiIsReady() {
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) return false;
    const health = await response.json();
    return health.ok === true;
  } catch {
    return false;
  }
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 3000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function shutdown() {
  await stop(viteProcess);
  await stop(apiProcess);
}

async function main() {
  if (!(await exists(python))) {
    throw new Error(
      'No encuentro el entorno de Python del backend. Prepáralo con:\n' +
      '  py -3.13 -m venv backend\\.venv\n' +
      '  backend\\.venv\\Scripts\\python.exe -m pip install -r backend\\requirements.txt'
    );
  }

  if (!(await apiIsReady())) {
    apiProcess = spawn(
      python,
      ['-m', 'uvicorn', 'api.main:app', '--host', '127.0.0.1', '--port', '8000'],
      { cwd: backend, stdio: 'inherit', windowsHide: true }
    );
    apiProcess.once('error', error => {
      console.error('No se pudo iniciar la API:', error.message);
      process.exitCode = 1;
    });
    apiProcess.once('exit', code => {
      if (viteProcess && viteProcess.exitCode === null) {
        console.error(`La API se cerró${code === null ? '' : ` (código ${code})`}.`);
        void shutdown().then(() => {
          process.exitCode = code || 1;
        });
      }
    });

    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await apiIsReady()) {
        ready = true;
        break;
      }
      if (apiProcess.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) {
      throw new Error('La API no respondió en http://127.0.0.1:8000/api/salud.');
    }
  }

  if (!(await exists(vite))) {
    throw new Error('No encuentro Vite. Instala las dependencias con npm ci.');
  }

  viteProcess = spawn(
    process.execPath,
    [vite, '--host', '127.0.0.1', '--port', '3000', '--open'],
    { cwd: root, stdio: 'inherit', windowsHide: true }
  );
  viteProcess.once('error', error => {
    console.error('No se pudo iniciar Vite:', error.message);
    process.exitCode = 1;
    void shutdown();
  });
  viteProcess.once('exit', code => {
    process.exitCode = code ?? 0;
    void shutdown();
  });
}

process.once('SIGINT', () => {
  void shutdown().then(() => {
    process.exit(0);
  });
});
process.once('SIGTERM', () => {
  void shutdown().then(() => {
    process.exit(0);
  });
});

main().catch(async error => {
  console.error(error.message);
  process.exitCode = 1;
  await shutdown();
});
