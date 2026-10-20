"""Pronósticos: ejecuta los modelos BSTS (R), pronostica el costo unitario y arma los bloques JSON."""
import json
import logging
import subprocess

import numpy as np
import pandas as pd

from . import config
from .stats import excluded_mask

log = logging.getLogger(__name__)
QUANTILES = {"p2_5": 2.5, "p10": 10, "p50": 50, "p90": 90, "p97_5": 97.5}


def run_r(backtest=False):
    """Ejecuta los scripts de R. El backtest es lento (~2 min) y solo hace falta al cambiar los datos
    de forma importante o las especificaciones candidatas; si no existe su salida, se corre igual."""
    csv = config.OUTPUT_DIR / "datos_limpios.csv"
    bt = config.MODELS_DIR / "backtest_bsts.csv"
    if not backtest and bt.exists():
        # Una serie nueva (hoja nueva en el Excel) necesita backtest para elegir su especificación.
        nuevas = set(pd.read_csv(csv)["serie_id"]) - set(pd.read_csv(bt)["serie"])
        if nuevas:
            log.info("R: series sin backtest %s", sorted(nuevas))
            backtest = True
    if backtest or not bt.exists():
        log.info("R: backtest BSTS")
        subprocess.run([config.RSCRIPT, str(config.R_DIR / "bsts_backtest.R"), str(csv), str(bt)], check=True)
    log.info("R: ajuste final BSTS")
    subprocess.run([config.RSCRIPT, str(config.R_DIR / "bsts_forecast.R"), str(csv), str(bt), str(config.MODELS_DIR)],
                   check=True)


def _cost_series(df, serie_id):
    fuente = config.COST_SOURCE.get(serie_id, serie_id)
    s = df[(df["serie_id"] == fuente) & df["es_total"]].set_index("fecha")["costo_unitario"].dropna()
    return s, fuente


def naive_draws(s, fechas, n_draws, ajuste_enero=0.0, seed=config.FORECAST_SEED):
    """Simulaciones naive: último valor × (1 + error empírico al horizonte h).

    Los errores son y[t+h]/y[t] - 1 para todos los pares observados a h meses de distancia.
    Si un horizonte tiene menos de COST_MIN_PAIRS pares se usa el mayor horizonte que sí los tenga.
    Los errores se centran en su mediana: el pronóstico central es el último valor y la tendencia
    de largo plazo solo entra por el ajuste explícito de enero.
    Devuelve (matriz draws x horizonte, detalle por horizonte).
    """
    meses = s.index.year * 12 + s.index.month
    v = s.to_numpy()
    errores = {}
    for i in range(len(v)):
        for j in range(i + 1, len(v)):
            errores.setdefault(int(meses[j] - meses[i]), []).append(v[j] / v[i] - 1)
    validos = sorted(h for h, e in errores.items() if len(e) >= config.COST_MIN_PAIRS)
    rng = np.random.default_rng(seed)
    ultimo_mes = s.index.max()
    out = np.empty((n_draws, len(fechas)))
    pares = []
    for k, f in enumerate(pd.to_datetime(fechas)):
        h = (f.year * 12 + f.month) - (ultimo_mes.year * 12 + ultimo_mes.month)
        usado = max([x for x in validos if x <= h], default=None) if validos else None
        pool = np.array(errores[usado]) if usado else np.zeros(1)
        pool = pool - np.median(pool)
        eneros = sum(1 for m in pd.date_range(ultimo_mes, f, freq="MS")[1:] if m.month == 1)
        out[:, k] = v[-1] * (1 + rng.choice(pool, n_draws)) * (1 + ajuste_enero) ** eneros
        pares.append({"fecha": f.strftime("%Y-%m"), "horizonte": h, "horizonte_usado": usado,
                      "n_pares": len(errores.get(usado, []))})
    return out, pares


def cost_draws(df, serie_id, fechas, n_draws):
    """Simulaciones del costo unitario (naive con errores empíricos; ver `naive_draws`)."""
    s, fuente = _cost_series(df, serie_id)
    meta = {"metodo": "último valor + errores empíricos centrados por horizonte", "fuente": fuente,
            "supuesto_tarifa_compartida": fuente != serie_id, "ajuste_enero": config.COST_JAN_ADJUST}
    if s.empty:
        return None, meta | {"disponible": False}
    out, pares = naive_draws(s, fechas, n_draws, config.COST_JAN_ADJUST)
    return out, meta | {"disponible": True, "ultimo_valor": s.iloc[-1], "ultimo_mes": s.index.max().strftime("%Y-%m"),
                        "meses_con_dato": len(s), "horizontes": pares}


def consumption_naive_draws(df, serie_id, fechas, n_draws):
    """Pronóstico naive del consumo total (último valor + errores empíricos)."""
    t = df[(df["serie_id"] == serie_id) & df["es_total"]].set_index("fecha")["consumo"]
    t = t[~excluded_mask(t.index)].dropna()
    out, _ = naive_draws(t, fechas, n_draws, seed=config.FORECAST_SEED + 1)
    return out


def production_draws(df, serie_id, x_ref, n_draws, seed=config.FORECAST_SEED + 2):
    """Simulaciones de la producción futura alrededor del plan por defecto.

    Errores empíricos del plan por defecto a cada horizonte h: x[t+h] / promedio(x[t-PLAN_MONTHS+1..t]) - 1,
    centrados en su mediana para que el valor central siga siendo el plan. Así el pronóstico por
    defecto incluye la incertidumbre de no conocer la producción (sin ella el IC 95 % queda corto).
    """
    x = df[(df["serie_id"] == serie_id) & df["es_total"]].set_index("fecha")["produccion"]
    x = x[~excluded_mask(x.index)].dropna()
    v = x[x > 0].to_numpy()
    k = config.PLAN_MONTHS
    rng = np.random.default_rng(seed)
    out = np.empty((n_draws, len(x_ref)))
    for h in range(1, len(x_ref) + 1):
        e = np.array([v[t + h] / v[t - k + 1:t + 1].mean() - 1 for t in range(k - 1, len(v) - h)])
        e = e - np.median(e) if len(e) >= config.COST_MIN_PAIRS else np.zeros(1)
        out[:, h - 1] = x_ref[h - 1] * (1 + rng.choice(e, n_draws))
    return out


def choose_forecast(bt):
    """Modelo del pronóstico por defecto según el backtest con el plan de producción por defecto.

    Si el MAPE del BSTS supera MAPE_THRESHOLD se pasa al naive, salvo que el naive sea aún peor.
    Devuelve ("bsts" | "naive", MAPE del modelo elegido).
    """
    mape_bsts = (bt.get("plan_por_defecto") or {}).get("mape")
    mape_naive = (bt.get("naive") or {}).get("mape")
    if mape_bsts is None:
        return "bsts", None
    if mape_bsts > config.MAPE_THRESHOLD and mape_naive is not None and mape_naive < mape_bsts:
        return "naive", mape_naive
    return "bsts", mape_bsts


def _q(m):
    """Cuantiles por columna de una matriz draws x horizonte."""
    return {k: np.percentile(m, q, axis=0) for k, q in QUANTILES.items()} | {"media": m.mean(axis=0)}


def forecast_block(df, serie_id):
    """Bloques `pronostico` y `escenarios` de una serie, o None si no hay salida del modelo.

    El pronóstico por defecto es el escenario con el plan de producción por defecto; los
    escenarios permiten al front recalcularlo con cualquier plan.
    """
    path = config.MODELS_DIR / f"{serie_id}_bsts.json"
    if not path.exists():
        log.warning("%s: no hay salida BSTS en %s", serie_id, path)
        return None, None
    m = json.loads(path.read_text(encoding="utf-8"))
    fechas = m["fechas"]
    e = m["escenarios"]
    beta = np.array(e["beta"])
    s = np.array(e["s"])
    x_ref = np.array(e["x_referencia"])
    n_draws = len(beta)
    modelo, mape = choose_forecast(e["backtest"])
    x_dr = None
    if modelo == "naive":
        a = consumption_naive_draws(df, serie_id, fechas, n_draws)
    else:
        x_dr = production_draws(df, serie_id, x_ref, n_draws)
        a = s + beta[:, None] * x_dr
    precio, costo_meta = cost_draws(df, serie_id, fechas, n_draws)

    qa = _q(a)
    qx = _q(x_dr) if x_dr is not None else None
    qp = _q(precio) if precio is not None else None
    qc = _q(a * precio) if precio is not None else None
    meses = []
    for k, f in enumerate(fechas):
        mes = {"fecha": f, "consumo": {q: v[k] for q, v in qa.items()}}
        if qx is not None:
            mes["produccion"] = {q: v[k] for q, v in qx.items()}
        if qp is not None:
            mes["costo_unitario"] = {q: v[k] for q, v in qp.items()}
            mes["costo_total"] = {q: v[k] for q, v in qc.items()}
        meses.append(mes)

    pronostico = {
        "modelo": e["modelo"] if modelo == "bsts" else "naive",
        "descripcion": ("escenario con el plan de producción por defecto; las bandas incluyen la incertidumbre "
                        "de la producción (error histórico del plan por defecto)" if modelo == "bsts"
                        else "último valor + errores empíricos (el BSTS supera el umbral de error y el naive es mejor)"),
        "plan_produccion": x_ref.tolist() if modelo == "bsts" else None,
        "mape_backtest": mape,
        "umbral_mape": config.MAPE_THRESHOLD,
        "confianza": "baja" if mape is not None and mape > config.MAPE_THRESHOLD else "normal",
        "costo_modelo": costo_meta,
        "meses": meses,
    }
    escenarios = {
        "modelo": e["modelo"],
        "backtest": e["backtest"],
        "descripcion": "consumo[d,h] = s[d][h] + beta[d] * produccion[h]; costo[d,h] = consumo[d,h] * precio[d][h]",
        "fechas": fechas,
        "produccion_referencia": e["x_referencia"],
        "plan_meses": e["plan_meses"],
        "beta_resumen": {"media": beta.mean(), "p2_5": np.percentile(beta, 2.5), "p97_5": np.percentile(beta, 97.5)},
        "consumo_base_resumen": [{"fecha": f, "media": s[:, k].mean(), "p2_5": np.percentile(s[:, k], 2.5),
                                  "p97_5": np.percentile(s[:, k], 97.5)} for k, f in enumerate(fechas)],
        "consumo_base_historico": m["consumo_base_historico"],
        "beta": beta.round(6).tolist(),
        "s": s.round(1).tolist(),
        "precio": precio.round(2).tolist() if precio is not None else None,
    }
    return pronostico, escenarios
