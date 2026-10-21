"""Plantilla del Excel fuente: detecta las hojas de planta a partir de su estructura.

Convención que debe cumplir el Excel (es la estructura de `Base de datos.xlsx`):
- Fila 1: notas libres (se ignora). Fila 2: encabezados. Desde la fila 3: datos.
- Nombre de hoja = "<Planta>" o "<Planta> <Servicio>" con servicio Energia o Gas
  (p. ej. "RC GAS" -> planta RC). El id de la serie es el nombre de la hoja en minúsculas
  ("F&A" -> "fya", "RC GAS" -> "rc-gas").
- El servicio sale de los encabezados: columna "(m3)" -> gas (m3); columna "KWH" -> energía (kWh).
- Cada mes es un bloque de filas que termina en la fila total, cuyo Proceso es el nombre de la planta.
- Las hojas "Instrucciones" o cuyo nombre empieza por "_" se ignoran.
"""
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

import pandas as pd

from .config import COLUMNS_ENERGIA, COLUMNS_GAS, SOURCE_XLSX

IGNORADAS = {"instrucciones"}
SUFIJO_SERVICIO = re.compile(r"\s+(energia|gas)$", re.IGNORECASE)
REQUERIDAS = {
    "energia": ["anio", "mes", "proceso", "indice", "consumo_planta", "consumo", "produccion"],
    "gas": ["anio", "mes", "proceso", "consumo", "produccion"],
}


class ErrorPlantilla(ValueError):
    """El Excel no cumple la plantilla. `errores`: lista de {hoja, fila, mensaje}."""

    def __init__(self, errores):
        self.errores = errores
        super().__init__("; ".join(formato(e) for e in errores))


def error(hoja, mensaje, fila=None):
    return {"hoja": hoja, "fila": fila, "mensaje": mensaje}


def formato(e):
    fila = f" fila {e['fila']}" if e["fila"] else ""
    return f"{e['hoja']}{fila}: {e['mensaje']}"


def norm(texto):
    """Minúsculas, sin tildes ni espacios repetidos (para comparar encabezados y nombres)."""
    t = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    return " ".join(t.lower().split())


def slug(hoja):
    return re.sub(r"[^a-z0-9]+", "-", norm(hoja).replace("&", "y")).strip("-")


def columnas(servicio):
    """Mapa encabezado normalizado -> nombre canónico."""
    return {norm(k): v for k, v in (COLUMNS_GAS if servicio == "gas" else COLUMNS_ENERGIA).items()}


@lru_cache(maxsize=4)
def _leer(path, mtime):
    return pd.read_excel(path, sheet_name=None, header=1, dtype=object)


def leer_libro(path=SOURCE_XLSX):
    """Todas las hojas del libro (encabezado en la fila 2), cacheadas mientras el archivo no cambie."""
    path = Path(path)
    return _leer(path, path.stat().st_mtime)


def _servicio(encabezados):
    if "(m3)" in encabezados:
        return "gas", "m3"
    if "kwh" in encabezados:
        return "energia", "kWh"
    return None, None


def detectar(libro):
    """Describe cada hoja de planta del libro.

    Devuelve (hojas, errores, avisos). Una hoja con errores no se incluye en `hojas`.
    """
    hojas, errores, avisos, ids = [], [], [], {}
    for nombre, raw in libro.items():
        if norm(nombre) in IGNORADAS or nombre.startswith("_"):
            continue
        encabezados = {norm(c) for c in raw.columns}
        servicio, unidad = _servicio(encabezados)
        if servicio is None:
            errores.append(error(nombre, "no se reconoce el servicio: la fila 2 debe tener la columna "
                                         "'KWH' (energía) o '(m3)' (gas)"))
            continue
        mapa = columnas(servicio)
        presentes = {mapa[c] for c in encabezados if c in mapa}
        faltan = [k for k, v in (COLUMNS_GAS if servicio == "gas" else COLUMNS_ENERGIA).items()
                  if v in REQUERIDAS[servicio] and v not in presentes and k != "Participacion"]
        if faltan:
            errores.append(error(nombre, f"faltan columnas obligatorias en la fila 2: {faltan}"))
            continue
        sid = slug(nombre)
        if sid in ids:
            errores.append(error(nombre, f"genera el mismo id '{sid}' que la hoja '{ids[sid]}'"))
            continue
        ids[sid] = nombre
        planta = SUFIJO_SERVICIO.sub("", nombre.strip()) or nombre.strip()
        col_proc = next(c for c in raw.columns if mapa.get(norm(c)) == "proceso")
        procesos = raw[col_proc].dropna().astype(str).str.strip()
        total = next((p for p in procesos.unique() if norm(p) == norm(planta)), None)
        if total is None:
            errores.append(error(nombre, f"no hay fila total: ningún Proceso se llama '{planta}' "
                                         "(la última fila de cada mes debe llamarse como la planta)"))
            continue
        if "costo_unitario" not in presentes:
            avisos.append(error(nombre, "sin columna de costo: el pronóstico de costo queda vacío"))
        hojas.append({"hoja": nombre, "planta": planta, "id": sid, "servicio": servicio, "unidad": unidad,
                      "total": total, "columnas": mapa})
    if not hojas and not errores:
        errores.append(error("(libro)", "no hay hojas de planta (se ignoran 'Instrucciones' y las que empiezan por '_')"))
    return hojas, errores, avisos


def hojas(path=SOURCE_XLSX):
    """Hojas de planta del Excel; lanza ErrorPlantilla si alguna no cumple la plantilla."""
    h, errores, _ = detectar(leer_libro(path))
    if errores:
        raise ErrorPlantilla(errores)
    return h
