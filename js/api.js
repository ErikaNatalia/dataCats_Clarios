/**
 * Cliente del backend local (FastAPI, carpeta backend/api del repo).
 *
 * Todas las rutas empiezan por /api; en desarrollo Vite las reenvía al puerto 8000
 * (ver vite.config.js). Los datos del pipeline se leen de /api/datos/<archivo>.json.
 */

const BASE = '/api';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(BASE + path, { cache: 'no-store', ...options });
  } catch (error) {
    throw new ApiError('No hay conexión con el backend (¿está corriendo uvicorn en el puerto 8000?).', 0);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(body?.detail || 'Error HTTP ' + response.status, response.status);
  }
  return body;
}

export const PLANTILLA_URL = BASE + '/plantilla';

export function dataUrl(archivo) {
  return BASE + '/datos/' + encodeURIComponent(archivo);
}

export function salud() {
  return request('/salud');
}

export function indiceSeries() {
  return request('/datos/index.json');
}

export function serie(archivo) {
  return request('/datos/' + encodeURIComponent(archivo));
}

export function fuenteActual() {
  return request('/fuentes/actual');
}

export function historialCargas() {
  return request('/fuentes/historial');
}

/** Sube el Excel; el backend lo valida y lo compara con el vigente sin reemplazar nada. */
export function validarFuente(file) {
  const form = new FormData();
  form.append('archivo', file);
  return request('/fuentes/validar', { method: 'POST', body: form });
}

/** Confirma el archivo validado: el backend reemplaza el Excel y corre el pipeline en segundo plano. */
export function aplicarFuente(token) {
  return request('/fuentes/' + encodeURIComponent(token) + '/aplicar', { method: 'POST' });
}

export function jobActual() {
  return request('/jobs/actual');
}

export function job(id) {
  return request('/jobs/' + encodeURIComponent(id));
}

/**
 * Consulta el job cada `intervalMs` hasta que termine. Llama `onUpdate(job)` en cada consulta.
 * Devuelve el job final (estado "ok" o "error").
 */
export async function esperarJob(id, onUpdate, intervalMs = 1500) {
  for (;;) {
    const estado = await job(id);
    onUpdate?.(estado);
    if (estado.estado !== 'corriendo') return estado;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}
