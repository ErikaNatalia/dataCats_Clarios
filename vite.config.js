import { defineConfig } from 'vite';

// El backend (FastAPI, ../api) corre en el puerto 8000. Vite reenvía las rutas /api para que el
// navegador las vea en el mismo origen que el dashboard (sin CORS).
const API_TARGET = process.env.CLARIOS_API || 'http://127.0.0.1:8000';

export default defineConfig({
  server: { proxy: { '/api': API_TARGET } },
  preview: { proxy: { '/api': API_TARGET } }
});
