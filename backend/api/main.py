"""API local del dashboard: carga del Excel fuente, ejecución del pipeline y datos para el front.

Uso (desde la raíz del proyecto):
  uvicorn api.main:app --port 8000

Rutas:
  GET  /api/salud                      estado del servicio
  GET  /api/plantilla                  plantilla_clarios.xlsx
  GET  /api/fuentes/actual             Excel vigente: hojas detectadas y última carga
  GET  /api/fuentes/historial          cargas anteriores
  POST /api/fuentes/validar            sube un Excel (campo `archivo`): validación + cambios; deja un token
  POST /api/fuentes/{token}/aplicar    reemplaza el Excel y corre el pipeline (job en segundo plano)
  GET  /api/jobs/actual | /{id}        estado del job (fase, log, error)
  GET  /api/datos/<archivo>            JSON generados (index.json, <serie>.json, monitoreo.json, historial/...)
"""
import logging
from datetime import datetime

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from pipeline import config, ingest, plantilla
from . import fuentes

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

MAX_BYTES = 30 * 1024 * 1024
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

app = FastAPI(title="Clarios dashboard API")
# El front en desarrollo pasa por el proxy de Vite; CORS cubre `vite preview` y pruebas directas.
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:3000", "http://localhost:3000"],
                   allow_methods=["*"], allow_headers=["*"])


@app.get("/api/salud")
def salud():
    return {"ok": True, "excel": config.SOURCE_XLSX.exists(), "job": (fuentes.job() or {}).get("estado")}


@app.get("/api/plantilla")
def descargar_plantilla():
    if not plantilla.SALIDA.exists():
        plantilla.crear()
    return FileResponse(plantilla.SALIDA, media_type=XLSX, filename=plantilla.SALIDA.name)


@app.get("/api/fuentes/actual")
def fuente_actual():
    if not config.SOURCE_XLSX.exists():
        raise HTTPException(404, "no hay Excel fuente")
    st = config.SOURCE_XLSX.stat()
    return {"archivo": config.SOURCE_XLSX.name, "tamano": st.st_size,
            "modificado": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
            "validacion": ingest.validar(), "ultima_carga": fuentes.job()}


@app.get("/api/fuentes/historial")
def historial_cargas():
    return fuentes.historial()


@app.post("/api/fuentes/validar")
async def validar_fuente(archivo: UploadFile):
    if not (archivo.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(415, "el archivo debe ser .xlsx")
    contenido = await archivo.read(MAX_BYTES + 1)
    if len(contenido) > MAX_BYTES:
        raise HTTPException(413, f"el archivo supera {MAX_BYTES // 2**20} MB")
    return fuentes.registrar_pendiente(contenido, archivo.filename)


@app.post("/api/fuentes/{token}/aplicar", status_code=202)
def aplicar_fuente(token: str, backtest: bool = True):
    try:
        return fuentes.aplicar(token, backtest)
    except KeyError:
        raise HTTPException(404, "archivo pendiente no encontrado; vuelva a subirlo")
    except ValueError as e:
        raise HTTPException(422, str(e))
    except fuentes.Ocupado as e:
        raise HTTPException(409, f"ya hay una carga en curso ({e})")


@app.get("/api/jobs/actual")
def job_actual():
    return fuentes.job()


@app.get("/api/jobs/{job_id}")
def job_por_id(job_id: str):
    try:
        return fuentes.job(job_id)
    except KeyError:
        raise HTTPException(404, "job no encontrado")


app.mount("/api/datos", StaticFiles(directory=config.OUTPUT_DIR, check_dir=False), name="datos")
