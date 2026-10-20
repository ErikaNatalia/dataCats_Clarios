"""Carga del Excel fuente: archivos pendientes, comparación con el Excel vigente y ejecución del pipeline.

Flujo: el front sube un Excel -> se valida y compara (queda pendiente con un token) -> el usuario
confirma -> job en segundo plano: respalda Excel y output/, reemplaza el Excel, corre run_pipeline.py.
Si el pipeline falla se restauran el Excel y output/ anteriores.
"""
import json
import logging
import math
import re
import shutil
import subprocess
import sys
import threading
import uuid
from datetime import datetime

import pandas as pd

from pipeline import config, ingest

log = logging.getLogger(__name__)

FUENTES_DIR = config.ROOT / "entrada" / "fuentes"
PENDIENTES_DIR = FUENTES_DIR / "pendientes"
MAX_CARGAS = 10          # respaldos de cargas que se conservan
MAX_CAMBIOS = 24         # meses modificados que se detallan por serie
MAX_LOG = 40             # últimas líneas del log que se exponen en el estado del job
TOKEN = re.compile(r"^[0-9a-f]{32}$")
# Fases del pipeline según las líneas de log de run_pipeline.py.
FASES = [("R: backtest", "backtest"), ("R: ajuste final", "modelos"), ("monitoreo", "monitoreo")]


class Ocupado(RuntimeError):
    pass


def _ahora():
    return datetime.now().isoformat(timespec="seconds")


# --- Comparación -----------------------------------------------------------------------------

def _totales(path):
    """Filas total por serie (fecha -> consumo, producción) de un Excel válido; {} si no se puede leer."""
    if not path.exists():
        return {}
    sheets, frames, *_ = ingest._cargar(path)
    return {s["id"]: df[df["es_total"]].set_index("fecha")[["consumo", "produccion"]]
            for s, df in zip(sheets, frames)}


def _igual(a, b):
    if pd.isna(a) and pd.isna(b):
        return True
    return not (pd.isna(a) or pd.isna(b)) and math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)


def _num(v):
    return None if pd.isna(v) else float(v)


def comparar(nuevo, actual=config.SOURCE_XLSX):
    """Diferencias de las filas total entre el Excel nuevo y el vigente."""
    n, a = _totales(nuevo), _totales(actual)
    series = []
    for sid in n.keys() & a.keys():
        tn, ta = n[sid], a[sid]
        comunes = tn.index.intersection(ta.index)
        modificados = [
            {"fecha": f"{f:%Y-%m}",
             "consumo_antes": _num(ta.at[f, "consumo"]), "consumo_despues": _num(tn.at[f, "consumo"]),
             "produccion_antes": _num(ta.at[f, "produccion"]), "produccion_despues": _num(tn.at[f, "produccion"])}
            for f in comunes
            if not (_igual(tn.at[f, "consumo"], ta.at[f, "consumo"])
                    and _igual(tn.at[f, "produccion"], ta.at[f, "produccion"]))
        ]
        series.append({
            "id": sid,
            "meses_nuevos": [f"{f:%Y-%m}" for f in tn.index.difference(ta.index)],
            "meses_eliminados": [f"{f:%Y-%m}" for f in ta.index.difference(tn.index)],
            "n_modificados": len(modificados),
            "modificados": modificados[:MAX_CAMBIOS],
        })
    return {
        "plantas_nuevas": sorted(n.keys() - a.keys()),
        "plantas_faltantes": sorted(a.keys() - n.keys()),
        "series": sorted(series, key=lambda s: s["id"]),
        "sin_cambios": not (n.keys() ^ a.keys()) and all(
            not (s["meses_nuevos"] or s["meses_eliminados"] or s["n_modificados"]) for s in series),
    }


# --- Archivos pendientes ---------------------------------------------------------------------

def _pendiente(token):
    if not TOKEN.match(token):
        raise KeyError(token)
    xlsx, meta = PENDIENTES_DIR / f"{token}.xlsx", PENDIENTES_DIR / f"{token}.json"
    if not xlsx.exists() or not meta.exists():
        raise KeyError(token)
    return xlsx, json.loads(meta.read_text(encoding="utf-8"))


def registrar_pendiente(contenido, nombre):
    """Guarda el Excel subido, lo valida y lo compara. Devuelve el resultado con su token."""
    PENDIENTES_DIR.mkdir(parents=True, exist_ok=True)
    for viejo in PENDIENTES_DIR.iterdir():  # un pendiente por vez: el último subido
        viejo.unlink()
    token = uuid.uuid4().hex
    xlsx = PENDIENTES_DIR / f"{token}.xlsx"
    xlsx.write_bytes(contenido)
    try:
        validacion = ingest.validar(xlsx)
    except Exception as e:  # archivo corrupto o que no es un Excel
        log.exception("validación de %s", nombre)
        validacion = {"ok": False, "avisos": [], "hojas": [],
                      "errores": [{"hoja": "(libro)", "fila": None, "mensaje": f"no se pudo leer el archivo: {e}"}]}
    cambios = comparar(xlsx) if validacion["ok"] else None
    resultado = {"token": token, "archivo": nombre, "subido": _ahora(), "validacion": validacion, "cambios": cambios}
    (PENDIENTES_DIR / f"{token}.json").write_text(json.dumps(resultado, ensure_ascii=False), encoding="utf-8")
    return resultado


# --- Job del pipeline ------------------------------------------------------------------------

_lock = threading.Lock()
_jobs = {}
_actual = None


def job(job_id=None):
    """Estado de un job (o del último si no se indica). Busca también en las cargas respaldadas."""
    if job_id is None:
        return _actual or (historial(1) or [None])[0]
    if job_id in _jobs:
        return _jobs[job_id]
    for c in historial():
        if c["id"] == job_id:
            return c
    raise KeyError(job_id)


def aplicar(token, backtest=True):
    """Inicia el reemplazo del Excel con el pendiente `token`. Lanza Ocupado si ya hay un job corriendo."""
    global _actual
    xlsx, meta = _pendiente(token)
    if not meta["validacion"]["ok"]:
        raise ValueError("el archivo no pasó la validación")
    with _lock:
        if _actual and _actual["estado"] == "corriendo":
            raise Ocupado(_actual["id"])
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        j = {"id": ts, "estado": "corriendo", "fase": "preparando", "archivo": meta["archivo"],
             "inicio": _ahora(), "fin": None, "backtest": backtest, "error": None, "log": [],
             "cambios": meta["cambios"]}
        _jobs[ts], _actual = j, j
    threading.Thread(target=_correr, args=(j, xlsx), daemon=True).start()
    return j


def _guardar(j, carpeta):
    (carpeta / "carga.json").write_text(json.dumps(j, ensure_ascii=False, indent=1), encoding="utf-8")


def _correr(j, xlsx):
    carpeta = FUENTES_DIR / j["id"]
    carpeta.mkdir(parents=True)
    excel_ant, output_ant = carpeta / "anterior.xlsx", carpeta / "output_anterior"
    try:
        if config.SOURCE_XLSX.exists():
            shutil.copy2(config.SOURCE_XLSX, excel_ant)
        if config.OUTPUT_DIR.exists():
            shutil.copytree(config.OUTPUT_DIR, output_ant)
        shutil.move(xlsx, carpeta / "cargado.xlsx")
        (PENDIENTES_DIR / f"{xlsx.stem}.json").unlink(missing_ok=True)
        shutil.copy2(carpeta / "cargado.xlsx", config.SOURCE_XLSX)
        j["fase"] = "limpieza"
        cmd = [sys.executable, "run_pipeline.py"] + (["--backtest"] if j["backtest"] else [])
        with open(carpeta / "pipeline.log", "w", encoding="utf-8") as f:
            proc = subprocess.Popen(cmd, cwd=config.ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                    text=True, bufsize=1)
            for linea in proc.stdout:
                f.write(linea)
                j["log"] = (j["log"] + [linea.rstrip()])[-MAX_LOG:]
                j["fase"] = next((fase for clave, fase in FASES if clave in linea), j["fase"])
            proc.wait()
        if proc.returncode != 0:
            raise RuntimeError(f"run_pipeline.py terminó con código {proc.returncode}")
        j["estado"], j["fase"] = "ok", "listo"
    except Exception as e:
        log.exception("carga %s", j["id"])
        j["estado"], j["error"] = "error", str(e)
        _restaurar(excel_ant, output_ant, j)
    finally:
        j["fin"] = _ahora()
        _guardar(j, carpeta)
        _podar()


def _restaurar(excel_ant, output_ant, j):
    try:
        if excel_ant.exists():
            shutil.copy2(excel_ant, config.SOURCE_XLSX)
        if output_ant.exists():
            shutil.rmtree(config.OUTPUT_DIR, ignore_errors=True)
            shutil.copytree(output_ant, config.OUTPUT_DIR)
        j["fase"] = "restaurado"
    except Exception as e:
        log.exception("restauración %s", j["id"])
        j["error"] += f"; además falló la restauración: {e}"


def _cargas():
    return sorted((d for d in FUENTES_DIR.glob("*-*") if d.is_dir() and (d / "carga.json").exists()),
                  reverse=True) if FUENTES_DIR.exists() else []


def _podar():
    for d in _cargas()[MAX_CARGAS:]:
        shutil.rmtree(d, ignore_errors=True)


def historial(limite=MAX_CARGAS):
    """Cargas anteriores, la más reciente primero (sin el log completo)."""
    out = []
    for d in _cargas()[:limite]:
        c = json.loads((d / "carga.json").read_text(encoding="utf-8"))
        out.append({k: v for k, v in c.items() if k != "log"})
    return out
