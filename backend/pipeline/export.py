"""Construcción de los JSON estáticos que consume el front."""
import json
import math
from datetime import datetime

import numpy as np
import pandas as pd

from . import config
from .forecast import forecast_block
from .stats import normal_range, seasonality, summary

RANGE_METRICS = ["consumo", "produccion", "intensidad"]


def _clean(obj):
    """Convierte tipos numpy/pandas a JSON nativo; NaN -> null; redondea flotantes."""
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        return None if math.isnan(obj) or math.isinf(obj) else round(float(obj), 4)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, pd.Timestamp):
        return obj.strftime("%Y-%m")
    return obj


def _process_block(g):
    g = g.set_index("fecha").sort_index()
    rangos = {m: normal_range(g[m]) for m in RANGE_METRICS}
    # Un proceso con índice 0 está apagado: no se evalúa contra su rango normal.
    for r in rangos.values():
        r.loc[g["indice"] == 0, "estado"] = "inactivo"
    serie = []
    for fecha, r in g.iterrows():
        punto = {
            "fecha": fecha,
            "indice": r["indice"],
            "consumo": r["consumo"],
            "produccion": r["produccion"],
            "intensidad": r["intensidad"],
            "intensidad_ppto": r["intensidad_ppto"],
            "desviacion_ppto": r["intensidad"] / r["intensidad_ppto"] - 1 if r["intensidad_ppto"] else None,
            "costo_unitario": r["costo_unitario"],
            "costo_total": r["costo_total"],
            "rangos": {m: rangos[m].loc[fecha].to_dict() for m in RANGE_METRICS},
        }
        serie.append(punto)
    return {
        "proceso": g["proceso"].iloc[0],
        "es_total": bool(g["es_total"].iloc[0]),
        "indice_actual": g["indice"].iloc[-1],
        "resumen": {m: summary(g[m]) for m in config.METRICS},
        "estacionalidad": {m: seasonality(g[m]) for m in RANGE_METRICS},
        "serie": serie,
    }


def _alerts(procesos, fecha):
    """Alertas del último mes por proceso (sin la fila total de la planta): desempeño energético
    (intensidad) peor que su rango normal, o por encima del presupuesto. Misma regla que el front
    (deriveAnalyticalAlerts en js/plant-data.js)."""
    alertas = []
    for p in procesos:
        if p["es_total"]:
            continue
        punto = next((x for x in p["serie"] if x["fecha"] == fecha), None)
        if punto is None:
            continue
        r = punto["rangos"].get("intensidad", {})
        if r.get("estado") == "alto":
            alertas.append({"proceso": p["proceso"], "tipo": "fuera_de_rango", "metrica": "intensidad",
                            "estado": "alto", "valor": punto["intensidad"], "esperado": r["esperado"], "z": r["z"]})
        d = punto["desviacion_ppto"]
        if d is not None and not math.isnan(d) and d > 0:
            alertas.append({"proceso": p["proceso"], "tipo": "sobre_presupuesto", "metrica": "intensidad",
                            "valor": punto["intensidad"], "presupuesto": punto["intensidad_ppto"], "desviacion": d})
    return alertas


def build_series_json(df, sheet, calidad):
    d = df[df["serie_id"] == sheet["id"]]
    # Total primero, luego procesos en el orden en que aparecen en el Excel.
    orden = d.sort_values("fila_excel").drop_duplicates("proceso")["proceso"].tolist()
    orden = [sheet["total"]] + [p for p in orden if p != sheet["total"]]
    procesos = [_process_block(d[d["proceso"] == p]) for p in orden]
    ultima = d["fecha"].max()
    pronostico, escenarios = forecast_block(df, sheet["id"])
    return _clean({
        "id": sheet["id"],
        "planta": sheet["planta"],
        "servicio": sheet["servicio"],
        "unidad": sheet["unidad"],
        "unidad_intensidad": f"{sheet['unidad']}/ECU",
        "generado": datetime.now().isoformat(timespec="seconds"),
        "periodo": {"inicio": d["fecha"].min(), "fin": ultima, "meses": d["fecha"].nunique()},
        "parametros": {
            "periodos_excluidos": config.EXCLUDED_PERIODS,
            "rango_ventana_meses": config.RANGE_WINDOW,
            "rango_min_obs": config.RANGE_MIN_OBS,
            "rango_z": config.RANGE_Z,
            "estacionalidad_alpha": config.SEASONAL_ALPHA,
        },
        "calidad": calidad,
        "alertas_ultimo_mes": {"fecha": ultima, "alertas": _alerts(procesos, ultima)},
        "procesos": procesos,
        "pronostico": pronostico,
        "escenarios": escenarios,
    })


def write_clean_csv(df, out_dir=config.OUTPUT_DIR):
    """Datos limpios en formato largo; es la entrada de los modelos en R."""
    out_dir.mkdir(parents=True, exist_ok=True)
    df.drop(columns=["fila_excel"]).to_csv(out_dir / "datos_limpios.csv", index=False, date_format="%Y-%m-%d")


def write_json(df, reporte, sheets, out_dir=config.OUTPUT_DIR):
    out_dir.mkdir(parents=True, exist_ok=True)
    # Último mes que tienen todas las series: el front lo usa para comparar plantas en la misma ventana.
    fin_comun = df.groupby("serie_id")["fecha"].max().min().strftime("%Y-%m")
    indice = []
    for sheet in sheets:
        data = build_series_json(df, sheet, reporte[sheet["id"]])
        data["periodo"]["fin_comun"] = fin_comun
        archivo = f"{sheet['id']}.json"
        (out_dir / archivo).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        total = data["procesos"][0]
        indice.append({
            "id": data["id"], "planta": data["planta"], "servicio": data["servicio"], "unidad": data["unidad"],
            "archivo": archivo, "periodo": data["periodo"],
            "procesos": [p["proceso"] for p in data["procesos"]],
            "ultimo_mes": {k: v for k, v in total["serie"][-1].items() if k != "rangos"},
            "n_alertas": len(data["alertas_ultimo_mes"]["alertas"]),
            "tiene_pronostico": data["pronostico"] is not None,
        })
    (out_dir / "index.json").write_text(
        json.dumps({"generado": datetime.now().isoformat(timespec="seconds"), "fecha_fin_comun": fin_comun,
                    "series": indice},
                   ensure_ascii=False, indent=1), encoding="utf-8")
    df.drop(columns=["fila_excel"]).to_csv(out_dir / "datos_limpios.csv", index=False, date_format="%Y-%m-%d")
    return indice
