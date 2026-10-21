"""Umbral de alerta por planta: cuánto peor que su promedio del año anterior (fracción, 0,10 = 10 %)
puede estar el consumo por unidad de una serie antes de marcarla "con alerta". Lo edita el dashboard;
las series sin valor usan DEFECTO."""
import json
import re
from pathlib import Path

from pipeline import config

ARCHIVO = config.ROOT / "entrada" / "umbrales.json"
DEFECTO = 0.10
MINIMO, MAXIMO = 0.0, 1.0
ID_SERIE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def leer() -> dict:
    if not ARCHIVO.exists():
        return {}
    return json.loads(ARCHIVO.read_text(encoding="utf-8"))


def guardar(umbrales: dict) -> dict:
    """Valida y reemplaza todos los umbrales. ValueError si un id o valor no es válido."""
    limpios = {}
    for serie, valor in umbrales.items():
        if not ID_SERIE.match(str(serie)):
            raise ValueError(f"id de serie no válido: {serie!r}")
        if isinstance(valor, bool) or not isinstance(valor, (int, float)) or not MINIMO <= valor <= MAXIMO:
            raise ValueError(f"umbral de {serie} fuera de rango (0 a 1): {valor!r}")
        limpios[serie] = round(float(valor), 4)
    tmp = Path(str(ARCHIVO) + ".tmp")
    tmp.write_text(json.dumps(limpios, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(ARCHIVO)
    return limpios
