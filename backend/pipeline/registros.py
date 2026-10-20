"""Registros adicionales al Excel con cualquier granularidad (diaria, por turno o mensual).

Cada CSV en RECORDS_DIR trae una fila por (serie, fecha, [turno], proceso):
    serie_id, fecha, turno (opcional), proceso, consumo, produccion, costo_unitario (opcional)
- `fecha` es YYYY-MM-DD (diario/turno) o YYYY-MM (mensual).
- `proceso` es un proceso de la planta o el total (nombre `total` de la hoja, ver pipeline/esquema.py).
  Si un mes no trae fila total, el total es la suma de los procesos.

El detalle normalizado se guarda en output/registros_detalle.csv (insumo de modelos futuros de
mayor granularidad). Para los modelos mensuales actuales se agrega a mes:
- Solo entran meses completos: con datos diarios, todos los días del mes.
- Si el mes ya existe en el Excel, manda el Excel y la diferencia queda registrada.
"""
import logging

import pandas as pd

from . import config

log = logging.getLogger(__name__)

REQUIRED = ["serie_id", "fecha", "proceso", "consumo", "produccion"]


def read_records(sheets, records_dir=config.RECORDS_DIR):
    """Lee y normaliza todos los CSV de registros; DataFrame vacío si no hay."""
    files = sorted(records_dir.glob("*.csv")) if records_dir.exists() else []
    frames = []
    for f in files:
        r = pd.read_csv(f, dtype={"serie_id": str, "fecha": str, "proceso": str, "turno": str})
        faltan = [c for c in REQUIRED if c not in r]
        if faltan:
            raise ValueError(f"{f.name}: faltan columnas {faltan}")
        r["archivo"] = f.name
        frames.append(r)
    if not frames:
        return pd.DataFrame()
    r = pd.concat(frames, ignore_index=True)
    for c in ["turno", "costo_unitario"]:
        if c not in r:
            r[c] = None
    r["proceso"] = r["proceso"].str.strip()
    r["granularidad"] = r["fecha"].str.len().map({7: "mensual", 10: "diaria"})
    r.loc[(r["granularidad"] == "diaria") & r["turno"].notna(), "granularidad"] = "turno"
    if r["granularidad"].isna().any():
        raise ValueError(f"fechas no reconocidas: {r.loc[r['granularidad'].isna(), 'fecha'].unique()[:5]}")
    r["dia"] = pd.to_datetime(r["fecha"].where(r["granularidad"] != "mensual", r["fecha"] + "-01"))
    r["mes"] = r["dia"].dt.to_period("M").dt.to_timestamp()
    for c in ["consumo", "produccion", "costo_unitario"]:
        r[c] = pd.to_numeric(r[c], errors="coerce")
    ids = {s["id"] for s in sheets}
    otras = set(r["serie_id"]) - ids
    if otras:
        raise ValueError(f"serie_id desconocido(s): {sorted(otras)}; válidos: {sorted(ids)}")
    dup = r.duplicated(["serie_id", "dia", "turno", "proceso"], keep="last")
    if dup.any():
        log.warning("registros: %d filas duplicadas (serie, fecha, turno, proceso); se conserva la última", dup.sum())
        r = r[~dup]
    return r


def monthly(r, sheets):
    """Agrega los registros a mes con el mismo formato que `ingest.load_all`.

    Devuelve (meses completos, reporte de meses incompletos por serie).
    """
    totales = {s["id"]: s["total"] for s in sheets}
    r = r.assign(costo_x_consumo=r["costo_unitario"] * r["consumo"])
    g = r.groupby(["serie_id", "mes", "proceso"], as_index=False).agg(
        consumo=("consumo", "sum"), produccion=("produccion", "sum"), costo_x_consumo=("costo_x_consumo", "sum"),
        con_costo=("costo_unitario", "count"), dias=("dia", "nunique"), granularidad=("granularidad", "first"))
    g["costo_unitario"] = (g["costo_x_consumo"] / g["consumo"]).where(g["con_costo"] > 0)
    g["es_total"] = g["proceso"] == g["serie_id"].map(totales)

    # Completitud: datos diarios deben cubrir todos los días del mes (en la fila con más días).
    cobertura = g.groupby(["serie_id", "mes"]).agg(dias=("dias", "max"), granularidad=("granularidad", "first"))
    cobertura["dias_mes"] = cobertura.index.get_level_values("mes").days_in_month
    cobertura["completo"] = (cobertura["granularidad"] == "mensual") | (cobertura["dias"] >= cobertura["dias_mes"])
    incompletos = {sid: [f"{m:%Y-%m} ({d}/{n} días)" for (_, m), d, n in zip(c.index, c["dias"], c["dias_mes"])]
                   for sid, c in cobertura[~cobertura["completo"]].groupby(level="serie_id")}
    g = g.merge(cobertura["completo"].reset_index(), on=["serie_id", "mes"])
    g = g[g["completo"]]

    # Fila total: la registrada o la suma de procesos.
    sin_total = g.groupby(["serie_id", "mes"])["es_total"].transform("any") == False  # noqa: E712
    suma = (g[sin_total].groupby(["serie_id", "mes"], as_index=False)
            .agg(consumo=("consumo", "sum"), produccion=("produccion", "sum"), costo_x_consumo=("costo_x_consumo", "sum"),
                 con_costo=("con_costo", "sum")))
    suma["costo_unitario"] = (suma["costo_x_consumo"] / suma["consumo"]).where(suma["con_costo"] > 0)
    suma["proceso"] = suma["serie_id"].map(totales)
    suma["es_total"] = True
    g = pd.concat([g, suma], ignore_index=True)

    planta = g[g["es_total"]].set_index(["serie_id", "mes"])["consumo"]
    g["consumo_planta"] = planta.reindex(pd.MultiIndex.from_frame(g[["serie_id", "mes"]])).to_numpy()
    g["indice"] = g["consumo"] / g["consumo_planta"]
    g["intensidad"] = g["consumo"] / g["produccion"].where(g["produccion"] > 0)
    g["costo_total"] = g["consumo"] * g["costo_unitario"]
    g["intensidad_ppto"] = float("nan")
    g["fila_excel"] = float("nan")
    meta = {s["id"]: s for s in sheets}
    for k in ["planta", "servicio", "unidad"]:
        g[k] = g["serie_id"].map(lambda sid: meta[sid][k])
    g = g.rename(columns={"mes": "fecha"})
    return g, incompletos


def merge(df, reporte, sheets, records_dir=config.RECORDS_DIR, detalle_csv=config.OUTPUT_DIR / "registros_detalle.csv"):
    """Agrega al DataFrame del Excel los meses nuevos que traen los registros."""
    r = read_records(sheets, records_dir)
    if r.empty:
        return df
    detalle_csv.parent.mkdir(parents=True, exist_ok=True)
    r.drop(columns=["mes"]).to_csv(detalle_csv, index=False, date_format="%Y-%m-%d")
    m, incompletos = monthly(r, sheets)
    for sid, meses in incompletos.items():
        reporte[sid]["observaciones"].append(f"registros: meses incompletos no usados en los modelos: {meses}")

    excel_meses = set(zip(df.loc[df["es_total"], "serie_id"], df.loc[df["es_total"], "fecha"]))
    clave = list(zip(m["serie_id"], m["fecha"]))
    en_excel = pd.Series([k in excel_meses for k in clave], index=m.index)
    if en_excel.any():
        tot = m[en_excel & m["es_total"]].merge(df[df["es_total"]][["serie_id", "fecha", "consumo"]],
                                                on=["serie_id", "fecha"], suffixes=("", "_excel"))
        for _, t in tot.iterrows():
            dif = t["consumo"] / t["consumo_excel"] - 1 if t["consumo_excel"] else float("nan")
            reporte[t["serie_id"]]["observaciones"].append(
                f"registros: {t['fecha']:%Y-%m} ya está en el Excel; se usa el Excel (diferencia de consumo {dif:+.1%})")
    nuevos = m[~en_excel]
    conocidos = set(zip(df["serie_id"], df["proceso"]))
    for (sid, p), _ in nuevos.groupby(["serie_id", "proceso"]):
        if (sid, p) not in conocidos:
            log.warning("%s: proceso '%s' no existe en el Excel (¿nuevo o mal escrito?)", sid, p)
            reporte[sid]["observaciones"].append(f"registros: proceso nuevo '{p}' (no existe en el Excel)")
    for sid, g in nuevos[nuevos["es_total"]].groupby("serie_id"):
        log.info("%s: %d mes(es) nuevos desde registros (%s)", sid, len(g), ", ".join(f"{f:%Y-%m}" for f in g["fecha"]))
        reporte[sid]["correcciones"].append({"hoja": "registros", "motivo": "meses agregados desde registros",
                                             "fechas": [f"{f:%Y-%m}" for f in g["fecha"]]})
    return pd.concat([df, nuevos[df.columns]], ignore_index=True).sort_values(
        ["serie_id", "fecha", "es_total", "proceso"]).reset_index(drop=True)
