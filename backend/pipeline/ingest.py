"""Lectura y limpieza de las hojas del Excel a un formato largo común."""
import logging

import pandas as pd

from . import esquema, registros
from .config import END_DATE, MONTHS, SOURCE_XLSX
from .esquema import ErrorPlantilla, error, norm

log = logging.getLogger(__name__)

NUMERIC = ["indice", "consumo_planta", "consumo", "produccion", "intensidad_excel",
           "intensidad_ppto", "costo_unitario", "costo_total_excel"]
# Celdas que deben ser numéricas (o vacías / N/A); en las demás un texto se toma como vacío.
NUMERIC_REQUERIDAS = ["indice", "consumo_planta", "consumo", "produccion"]
# Columnas que la plantilla no exige; si faltan quedan vacías.
OPCIONALES = ["dia", "turno", "intensidad_excel", "intensidad_ppto", "costo_unitario", "costo_total_excel"]


def _filas(df, mask, max_filas=10):
    filas = df.loc[mask, "fila_excel"].tolist()
    extra = f" (+{len(filas) - max_filas} más)" if len(filas) > max_filas else ""
    return int(filas[0]), ", ".join(map(str, filas[:max_filas])) + extra


def _read_sheet(raw, sheet):
    """Lee una hoja del libro (ya cargada) al formato canónico; lanza ErrorPlantilla si hay celdas inválidas."""
    hoja = sheet["hoja"]
    cols = {c: sheet["columnas"][norm(c)] for c in raw.columns if norm(c) in sheet["columnas"]}
    df = raw[list(cols)].rename(columns=cols)
    df["fila_excel"] = df.index + 3  # header=1 -> la fila 0 del DataFrame es la fila 3 del Excel
    df = df[df["anio"].notna() & df["proceso"].notna()].copy()
    for col in OPCIONALES:
        if col not in df:
            df[col] = None
    df["proceso"] = df["proceso"].astype(str).str.strip()
    errores = []
    anio = pd.to_numeric(df["anio"], errors="coerce")
    malo = anio.isna() | (anio % 1 != 0)
    if malo.any():
        fila, filas = _filas(df, malo)
        errores.append(error(hoja, f"Año no válido en filas {filas}", fila))
    df["mes_num"] = df["mes"].astype(str).str.strip().str.lower().str[:3].map(MONTHS)
    if df["mes_num"].isna().any():
        fila, filas = _filas(df, df["mes_num"].isna())
        errores.append(error(hoja, f"Mes no reconocido en filas {filas} (use Ene..Dic o Jan..Dec)", fila))
    for col in NUMERIC:
        if col in df:
            v = df[col].replace({"N/A": None, "": None})
            num = pd.to_numeric(v, errors="coerce")
            texto = v.notna() & num.isna() & ~v.astype(str).str.strip().eq("")
            if texto.any() and col in NUMERIC_REQUERIDAS:
                fila, filas = _filas(df, texto)
                encabezado = next(k.strip() for k, v in cols.items() if v == col)
                errores.append(error(hoja, f"valor no numérico en '{encabezado}', filas {filas}", fila))
            df[col] = num
    sin_consumo = (df["proceso"] == sheet["total"]) & df["consumo"].isna()
    if sin_consumo.any():
        fila, filas = _filas(df, sin_consumo)
        errores.append(error(hoja, f"fila total sin consumo en filas {filas} (si son fórmulas, abra y guarde "
                                   "el archivo en Excel para que queden los valores calculados)", fila))
    if not df.empty and df["proceso"].iloc[-1] != sheet["total"]:
        errores.append(error(hoja, f"el último mes no termina en la fila total '{sheet['total']}'",
                             int(df["fila_excel"].iloc[-1])))
    if df.empty:
        errores.append(error(hoja, "no tiene filas de datos"))
    if errores:
        raise ErrorPlantilla(errores)
    df["anio"] = anio.astype(int)
    return df


def _fix_dates(df, hoja, total):
    """Asigna la fecha de cada bloque mensual y corrige años mal etiquetados.

    Las hojas están en orden cronológico, un bloque de filas por mes que termina en la
    fila total de la planta. La fecha del bloque se toma de su primera fila:
    - Si otra fila del bloque trae otra etiqueta (p. ej. el total de diciembre con el
      año siguiente), se alinea con el bloque.
    - Si el bloque trae el mes esperado pero otro año (p. ej. 'Dic 2020' justo después
      de 'Nov 2019'), se corrige al año esperado.
    Toda corrección queda registrada.
    """
    df["bloque"] = (df["proceso"] == total).shift(fill_value=False).cumsum()
    fechas, correcciones, prev = {}, [], None
    for b, g in df.groupby("bloque", sort=True):
        anio, mes = int(g["anio"].iloc[0]), int(g["mes_num"].iloc[0])
        if g["mes_num"].nunique() > 1:  # el año puede venir mal etiquetado; el mes no
            sig = g[g["mes_num"] != mes].iloc[0]
            raise ErrorPlantilla([error(hoja, f"el mes {anio}-{mes:02d} no termina en la fila total '{total}' "
                                              f"(la fila {sig['fila_excel']} ya es de otro mes)", int(sig["fila_excel"]))])
        fecha = pd.Timestamp(anio, mes, 1)
        distintas = g[(g["anio"] != anio) | (g["mes_num"] != mes)]
        for _, r in distintas.iterrows():
            correcciones.append({
                "hoja": hoja, "filas_excel": str(r["fila_excel"]),
                "etiqueta_original": f"{r['anio']}-{int(r['mes_num']):02d}", "motivo": "etiqueta distinta al resto del mes",
            })
        if prev is not None:
            esperada = prev + pd.DateOffset(months=1)
            if fecha != esperada and mes == esperada.month:
                correcciones.append({
                    "hoja": hoja, "filas_excel": f"{g['fila_excel'].min()}-{g['fila_excel'].max()}",
                    "etiqueta_original": fecha.strftime("%Y-%m"), "motivo": "año fuera de secuencia",
                })
                fecha = esperada
            elif fecha <= prev:
                raise ErrorPlantilla([error(hoja, f"mes fuera de orden ({fecha:%Y-%m} después de {prev:%Y-%m})",
                                            int(g["fila_excel"].min()))])
        for c in correcciones:
            c.setdefault("fecha_asignada", fecha.strftime("%Y-%m"))
        fechas[b] = fecha
        prev = fecha
    for c in correcciones:
        log.warning("%s fila(s) %s: %s -> %s (%s)", c["hoja"], c["filas_excel"], c["etiqueta_original"],
                    c["fecha_asignada"], c["motivo"])
    df["fecha"] = df["bloque"].map(fechas)
    return df.drop(columns=["bloque"]), correcciones


def _reassign_idle(df, hoja):
    """Un proceso sin producción en un mes en que otros procesos sí producen se considera apagado:
    su índice pasa a 0 y su participación se reparte proporcionalmente entre los procesos activos.
    El consumo por proceso se recalcula como consumo de planta × índice. Los totales no cambian."""
    proc = ~df["es_total"] & df["indice"].notna()
    mes_con_prod = df[proc & (df["produccion"] > 0)]["fecha"].unique()
    apagado = proc & df["fecha"].isin(mes_con_prod) & ~(df["produccion"] > 0) & (df["indice"] > 0)
    if not apagado.any():
        return df, []
    df.loc[apagado, "indice"] = 0.0
    activos = proc & df["fecha"].isin(df.loc[apagado, "fecha"].unique())
    suma = df[activos].groupby("fecha")["indice"].transform("sum")
    df.loc[activos, "indice"] = df.loc[activos, "indice"] / suma
    df.loc[activos, "consumo"] = df.loc[activos, "consumo_planta"] * df.loc[activos, "indice"]
    correcciones = [{"hoja": hoja, "proceso": p, "fechas": f"{g['fecha'].min():%Y-%m} a {g['fecha'].max():%Y-%m}",
                     "meses": len(g), "motivo": "proceso sin producción: índice 0 y participación repartida "
                                                "entre los procesos activos"}
                    for p, g in df[apagado].groupby("proceso")]
    for c in correcciones:
        log.warning("%s '%s' %s (%d meses): %s", hoja, c["proceso"], c["fechas"], c["meses"], c["motivo"])
    return df, correcciones


def _derive(df, sheet):
    """Recalcula indicadores en lugar de confiar en las fórmulas del Excel.

    - Producción 0 o vacía en un proceso: la intensidad queda indefinida (NaN), no 0.
    - Costo total sin costo unitario: NaN, no 0.
    """
    df["es_total"] = df["proceso"] == sheet["total"]
    if "consumo_planta" not in df:  # gas: una sola fila por mes
        df["consumo_planta"] = df["consumo"]
        df["indice"] = 1.0
    df, correcciones = _reassign_idle(df, sheet["hoja"])
    prod = df["produccion"].where(df["produccion"] > 0)
    df["intensidad"] = df["consumo"] / prod
    df["costo_total"] = df["consumo"] * df["costo_unitario"]
    return df, correcciones


def _quality(df, sheet):
    """Chequeos de consistencia; devuelve una lista de observaciones."""
    obs = []
    fechas = pd.date_range(df["fecha"].min(), df["fecha"].max(), freq="MS")
    faltan = sorted(set(fechas) - set(df.loc[df["es_total"], "fecha"]))
    if faltan:
        obs.append(f"meses sin fila total: {[f.strftime('%Y-%m') for f in faltan]}")
    dup = df.duplicated(["fecha", "proceso"]).sum()
    if dup:
        obs.append(f"{dup} filas duplicadas (fecha, proceso)")
    k = df[df["intensidad"].notna() & (df["intensidad_excel"] > 0)]
    dif = (k["intensidad"] / k["intensidad_excel"] - 1).abs() > 1e-6
    if dif.any():
        obs.append(f"{int(dif.sum())} filas donde la intensidad recalculada difiere del Excel")
    proc = df[~df["es_total"]]
    if not proc.empty:
        suma = proc.groupby("fecha")["indice"].sum()
        raros = suma[(suma - 1).abs() > 0.01]
        if len(raros):
            obs.append(f"{len(raros)} meses donde los índices de proceso no suman 1 "
                       f"({raros.index.min():%Y-%m} a {raros.index.max():%Y-%m}, suma={raros.round(3).unique().tolist()})")
    sin_prod = proc[(proc["consumo"] > 0) & (proc["produccion"].fillna(0) == 0)
                    & (proc["fecha"] >= proc["fecha"].max() - pd.DateOffset(months=5))]
    for p, g in sin_prod.groupby("proceso"):
        obs.append(f"'{p}' tiene consumo asignado sin producción en {len(g)} de los últimos 6 meses "
                   f"(índice {g['indice'].iloc[-1]:.2f}); su intensidad queda indefinida")
    for o in obs:
        log.info("%s: %s", sheet["hoja"], o)
    return obs


def _cargar(path):
    """Procesa todas las hojas de planta. Devuelve (hojas, frames, reporte, errores, avisos)."""
    libro = esquema.leer_libro(path)
    sheets, errores, avisos = esquema.detectar(libro)
    ok, frames, reporte = [], [], {}
    for sheet in sheets:
        try:
            df = _read_sheet(libro[sheet["hoja"]], sheet)
            df, correcciones = _fix_dates(df, sheet["hoja"], sheet["total"])
        except ErrorPlantilla as e:
            errores += e.errores
            continue
        df, apagados = _derive(df, sheet)
        correcciones += apagados
        df["serie_id"], df["planta"] = sheet["id"], sheet["planta"]
        df["servicio"], df["unidad"] = sheet["servicio"], sheet["unidad"]
        reporte[sheet["id"]] = {"correcciones": correcciones, "observaciones": _quality(df, sheet)}
        ok.append(sheet)
        frames.append(df)
    return ok, frames, reporte, errores, avisos


def validar(path=SOURCE_XLSX):
    """Revisa un Excel contra la plantilla sin escribir nada; resultado serializable a JSON."""
    sheets, frames, reporte, errores, avisos = _cargar(path)
    hojas = []
    for sheet, df in zip(sheets, frames):
        tot = df[df["es_total"]]
        hojas.append({
            "hoja": sheet["hoja"], "id": sheet["id"], "planta": sheet["planta"], "servicio": sheet["servicio"],
            "unidad": sheet["unidad"], "procesos": df.loc[~df["es_total"], "proceso"].unique().tolist(),
            "desde": f"{df['fecha'].min():%Y-%m}", "hasta": f"{df['fecha'].max():%Y-%m}", "meses": len(tot),
            "con_costo": bool(tot["costo_unitario"].notna().any()),
            "correcciones": reporte[sheet["id"]]["correcciones"],
            "observaciones": reporte[sheet["id"]]["observaciones"],
        })
    return {"ok": not errores, "errores": errores, "avisos": avisos, "hojas": hojas}


def load_all(path=SOURCE_XLSX):
    """Devuelve (DataFrame largo con todas las plantas, reporte de calidad, hojas detectadas).

    Lanza ErrorPlantilla si alguna hoja no cumple la plantilla (ver pipeline/esquema.py)."""
    sheets, frames, reporte, errores, _ = _cargar(path)
    if errores:
        raise ErrorPlantilla(errores)
    cols = ["serie_id", "planta", "servicio", "unidad", "fecha", "proceso", "es_total", "indice",
            "consumo_planta", "consumo", "produccion", "intensidad", "intensidad_ppto",
            "costo_unitario", "costo_total", "fila_excel"]
    out = pd.concat(frames, ignore_index=True)[cols]
    out = registros.merge(out, reporte, sheets)
    # Los modelos usan todos los meses de cada serie; la fecha fin común solo se informa al front
    # (export.py). END_DATE explícito recorta los datos (p. ej. para reconstruir el historial).
    if END_DATE:
        out = out[out["fecha"] <= pd.Timestamp(END_DATE)]
    out = out.sort_values(["serie_id", "fecha", "es_total", "proceso"]).reset_index(drop=True)
    return out, reporte, sheets
