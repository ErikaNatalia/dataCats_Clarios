"""Configuración del pipeline: fuentes, columnas y parámetros estadísticos.

Las hojas de planta no se configuran aquí: se detectan del Excel (ver pipeline/esquema.py)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_XLSX = ROOT / "Base de datos.xlsx"
OUTPUT_DIR = ROOT / "output"

# Columnas canónicas según el encabezado de cada tipo de hoja.
# Clave: nombre del encabezado en Excel (sin espacios extremos). Valor: nombre canónico.
COLUMNS_ENERGIA = {
    "Año": "anio",
    "Mes": "mes",
    "Dia": "dia",
    "Turno": "turno",
    "Proceso": "proceso",
    "Indice": "indice",
    "Participacion": "indice",
    "KWH": "consumo_planta",
    "KWH por proceso": "consumo",
    "Produccion (Equivalente)": "produccion",
    "KWH/Equ (Reales)": "intensidad_excel",
    "KWH/Equ (Presupuesto)": "intensidad_ppto",
    "Costo por KWH": "costo_unitario",
    "Costo  total KWH": "costo_total_excel",
}

COLUMNS_GAS = {
    "Año": "anio",
    "Mes": "mes",
    "Dia": "dia",
    "Turno": "turno",
    "Proceso": "proceso",
    "(m3)": "consumo",
    "Produccion (Equivalente)": "produccion",
    "m3 /Equ (Reales)": "intensidad_excel",
    "m3 /Equ (presupuesto)": "intensidad_ppto",
    "Costo m3": "costo_unitario",
    "Total Costo m3": "costo_total_excel",
}

# --- Parámetros estadísticos ---
# Meses atípicos (cierre por COVID) que no entran en promedios, estacionalidad ni rangos.
EXCLUDED_PERIODS = [("2020-04-01", "2020-06-01")]
# Recorte opcional de los datos ("YYYY-MM-01"), p. ej. para reconstruir pronósticos pasados.
# None = usar todos los meses. La fecha fin común para el front se calcula aparte (export.py).
END_DATE = None
# Métricas sobre las que se calculan resúmenes y rango normal.
METRICS = ["consumo", "produccion", "intensidad", "costo_unitario", "costo_total"]
# Rango normal móvil: ventana de meses previos, mínimo de observaciones y ancho en sigmas robustas.
RANGE_WINDOW = 24
RANGE_MIN_OBS = 12
RANGE_Z = 3.0
# Estacionalidad: meses mínimos para estimarla y nivel de significancia del test.
SEASONAL_MIN_MONTHS = 36
SEASONAL_ALPHA = 0.05

# --- Modelos de pronóstico ---
MODELS_DIR = OUTPUT_DIR / "modelos"
R_DIR = ROOT / "modelos"
RSCRIPT = "Rscript"
FORECAST_SEED = 2026
# Plan de producción por defecto de los escenarios: promedio de los últimos meses (el front puede
# reemplazarlo). Debe coincidir con PLAN_MONTHS en modelos/bsts_common.R.
PLAN_MONTHS = 3
# MAPE del backtest (con el plan por defecto) por encima del cual el pronóstico se marca de baja confianza.
MAPE_THRESHOLD = 0.20
# Costo unitario: pronóstico naive (último valor) con bandas de los errores empíricos
# observados a cada horizonte. Ver README / discusión del 2026-10-15.
COST_MIN_PAIRS = 5        # pares mínimos para usar el error empírico de un horizonte
COST_JAN_ADJUST = 0.0     # ajuste anual de tarifa aplicado cada enero (0.05 = +5 %)
# Series sin costo propio que toman la tarifa de otra (supuesto: contrato único de energía).
# Una planta nueva sin costo queda sin pronóstico de costo (no se le asigna tarifa ajena).
COST_SOURCE = {"rc-energia": "ensamble"}

MONTHS = {
    "ene": 1, "jan": 1, "feb": 2, "mar": 3, "abr": 4, "apr": 4, "may": 5,
    "jun": 6, "jul": 7, "ago": 8, "aug": 8, "sep": 9, "set": 9, "oct": 10,
    "nov": 11, "dic": 12, "dec": 12,
}

# --- Registros adicionales (granularidad diaria, por turno o mensual) ---
# CSV con columnas: serie_id, fecha (YYYY-MM-DD o YYYY-MM), proceso, consumo, produccion y,
# opcionales, turno y costo_unitario. Ver pipeline/registros.py.
RECORDS_DIR = ROOT / "entrada" / "registros"

# --- Historial de pronósticos y monitoreo de drift ---
HISTORY_DIR = OUTPUT_DIR / "historial"
MONITOR_WINDOW = 6         # meses evaluados para el MAPE móvil
MONITOR_MIN_EVAL = 3       # evaluaciones mínimas para calcular el MAPE móvil
MONITOR_MAPE_FACTOR = 1.5  # alerta si MAPE móvil > factor × MAPE del backtest a 1 mes
MONITOR_OUT_RUN = 2        # alerta si el real cae fuera del IC 95 % estos meses seguidos
MONITOR_BIAS_RUN = 6       # alerta si los errores tienen el mismo signo estos meses seguidos
