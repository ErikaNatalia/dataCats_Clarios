import { defineConfig } from 'vite';

// El backend (FastAPI, backend/api) corre en el puerto 8000. Vite reenvía las rutas /api para que el
// navegador las vea en el mismo origen que el dashboard (sin CORS).
const API_TARGET = process.env.CLARIOS_API || 'http://127.0.0.1:8000';

export default defineConfig({
  // backend/ (pipeline, API y datos crudos) no es parte del front: Vite no lo sirve ni lo vigila.
  // Los datos llegan solo por la API (/api/datos). Se mantienen los bloqueos por defecto de Vite.
  server: {
    proxy: { '/api': API_TARGET },
    watch: { ignored: ['**/backend/**'] },
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/backend/**'] }
  },
  preview: { proxy: { '/api': API_TARGET } }
});
