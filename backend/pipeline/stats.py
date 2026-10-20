"""Estadística descriptiva: promedios, estacionalidad y rango normal por serie."""
import numpy as np
import pandas as pd
from scipy import stats

from .config import (EXCLUDED_PERIODS, RANGE_MIN_OBS, RANGE_WINDOW, RANGE_Z,
                     SEASONAL_ALPHA, SEASONAL_MIN_MONTHS)

MAD_TO_SIGMA = 1.4826  # factor para que la MAD estime sigma bajo normalidad


def excluded_mask(fechas):
    """True para los meses que no deben entrar en los cálculos estadísticos."""
    fechas = pd.to_datetime(pd.Series(fechas))
    mask = pd.Series(False, index=fechas.index)
    for ini, fin in EXCLUDED_PERIODS:
        mask |= fechas.between(ini, fin)
    return mask.to_numpy()


def summary(s):
    """Promedios y dispersión de una serie mensual (índice = fecha), sin meses excluidos."""
    s = s[~excluded_mask(s.index)].dropna()
    if s.empty:
        return None
    ult12 = s[s.index > s.index.max() - pd.DateOffset(months=12)]
    por_anio = s.groupby(s.index.year).agg(["mean", "size"])
    return {
        "n": int(s.size),
        "promedio": s.mean(),
        "mediana": s.median(),
        "desviacion": s.std(),
        "cv": s.std() / s.mean() if s.mean() else None,
        "promedio_12m": ult12.mean(),
        "min": s.min(),
        "max": s.max(),
        "por_anio": [{"anio": int(a), "promedio": r["mean"], "meses": int(r["size"])} for a, r in por_anio.iterrows()],
    }


def seasonality(s):
    """Índices estacionales multiplicativos por mes calendario.

    Método clásico: tendencia = media móvil centrada 2x12; razón = valor / tendencia;
    índice = promedio de razones por mes, normalizado a media 1. La significancia se
    evalúa con Kruskal-Wallis sobre las razones agrupadas por mes.
    """
    s = s.asfreq("MS")
    s[excluded_mask(s.index)] = np.nan
    if s.notna().sum() < SEASONAL_MIN_MONTHS or (s <= 0).any():
        return None
    tendencia = s.rolling(12, center=True, min_periods=12).mean().rolling(2, min_periods=2).mean().shift(-1)
    razon = (s / tendencia).dropna()
    grupos = [g.to_numpy() for _, g in razon.groupby(razon.index.month)]
    if len(grupos) < 12 or min(len(g) for g in grupos) < 2:
        return None
    idx = razon.groupby(razon.index.month).mean()
    idx = idx / idx.mean()
    p = stats.kruskal(*grupos).pvalue
    return {
        "indices": [{"mes": int(m), "indice": v} for m, v in idx.items()],
        "p_valor": p,
        "significativa": bool(p < SEASONAL_ALPHA),
        "amplitud": idx.max() - idx.min(),
        "mes_alto": int(idx.idxmax()),
        "mes_bajo": int(idx.idxmin()),
        "n": int(razon.size),
    }


def normal_range(s):
    """Rango normal móvil para cada mes, calculado solo con los meses anteriores.

    esperado = mediana de los últimos RANGE_WINDOW meses válidos;
    sigma = 1.4826 * MAD (robusta a atípicos); rango = esperado ± RANGE_Z * sigma.
    Devuelve un DataFrame con esperado, rango_min, rango_max, z y estado.
    """
    valid = s.where(~excluded_mask(s.index))
    previos = valid.shift(1).rolling(RANGE_WINDOW, min_periods=RANGE_MIN_OBS)
    esperado = previos.median()
    mad = previos.apply(lambda w: np.nanmedian(np.abs(w - np.nanmedian(w))), raw=True)
    sigma = (MAD_TO_SIGMA * mad).where(mad > 0, previos.std())
    out = pd.DataFrame({
        "esperado": esperado,
        "rango_min": esperado - RANGE_Z * sigma,
        "rango_max": esperado + RANGE_Z * sigma,
        "z": (s - esperado) / sigma,
    })
    estado = np.select([s.isna(), esperado.isna(), s > out["rango_max"], s < out["rango_min"]],
                       ["sin_dato", "sin_historia", "alto", "bajo"], "normal")
    out["estado"] = np.where(excluded_mask(s.index) & (estado != "sin_dato"), "excluido", estado)
    return out
