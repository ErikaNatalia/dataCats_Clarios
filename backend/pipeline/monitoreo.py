"""Historial de pronósticos y monitoreo de drift.

Cada corrida guarda una copia del pronóstico en HISTORY_DIR/<serie>/<ultimo_mes>.json. Cuando
llegan datos reales, se comparan con los pronósticos guardados y se escribe output/monitoreo.json.

El error del modelo se mide con la producción REAL del mes (s + beta * x_real), para separarlo del
error del plan de producción. El error del pronóstico por defecto (plan = promedio de los últimos
meses) se reporta aparte, solo como información.

Reglas de alerta (sobre la evaluación a 1 mes, la más reciente para cada mes):
- mape_alto:    MAPE de los últimos MONITOR_WINDOW meses > MONITOR_MAPE_FACTOR × MAPE del backtest a 1 mes.
- fuera_ic95:   el real cae fuera del IC 95 % MONITOR_OUT_RUN meses seguidos.
- sesgo:        MONITOR_BIAS_RUN errores seguidos con el mismo signo.
- cambio_beta:  la media de beta del último ajuste sale del IC 95 % de beta del ajuste anterior.
"""
import json
import logging
from datetime import datetime

import numpy as np
import pandas as pd

from . import config
from .stats import excluded_mask

log = logging.getLogger(__name__)

ACCIONES = {
    "mape_alto": "correr `python run_pipeline.py --backtest` para re-elegir la especificación; si persiste, "
                 "revisar cambios en la planta y acortar la ventana de entrenamiento",
    "fuera_ic95": "revisar si hubo un evento puntual (paro, falla de medición); si no, reentrenar con --backtest",
    "sesgo": "el modelo sub/sobreestima de forma sistemática: revisar cambios estructurales (nuevas máquinas, "
             "líneas apagadas) y considerar una variable de intervención",
    "cambio_beta": "cambió el consumo por unidad producida: confirmar con la planta y revisar índices de proceso",
}


def save_snapshot(serie_id, history_dir=config.HISTORY_DIR):
    """Copia el pronóstico vigente (salida BSTS) al historial, una por último mes con datos."""
    src = config.MODELS_DIR / f"{serie_id}_bsts.json"
    if not src.exists():
        return None
    m = json.loads(src.read_text(encoding="utf-8"))
    e = m["escenarios"]
    snap = {
        "serie": serie_id,
        "generado": m["generado"],
        "ultimo_mes": m["ultimo_mes"],
        "fechas": m["fechas"],
        "modelo": e["modelo"],
        "x_referencia": e["x_referencia"],
        "backtest": e["backtest"],
        "beta": e["beta"],
        "s": e["s"],
    }
    out = history_dir / serie_id / f"{m['ultimo_mes']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snap), encoding="utf-8")
    return out


def _load_history(serie_id, history_dir):
    d = history_dir / serie_id
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(d.glob("*.json"))] if d.exists() else []


def _evaluate(snaps, real):
    """Una fila por (pronóstico guardado, mes ya observado)."""
    filas = []
    for sn in snaps:
        beta, s = np.array(sn["beta"]), np.array(sn["s"])
        for h, f in enumerate(sn["fechas"]):
            fecha = pd.Timestamp(f + "-01")
            if fecha not in real.index:
                continue
            y, x = real.loc[fecha, "consumo"], real.loc[fecha, "produccion"]
            if pd.isna(y) or pd.isna(x) or y <= 0:
                continue
            dr = s[:, h] + beta * x
            plan = s[:, h] + beta * sn["x_referencia"][h]
            lo, hi = np.percentile(dr, [2.5, 97.5])
            filas.append({"origen": sn["ultimo_mes"], "fecha": f, "h": h + 1, "real": y, "produccion_real": x,
                          "pred": dr.mean(), "lo95": lo, "hi95": hi, "error_rel": dr.mean() / y - 1,
                          "fuera_ic95": bool(y < lo or y > hi), "pred_plan": plan.mean(),
                          "error_rel_plan": plan.mean() / y - 1})
    return pd.DataFrame(filas)


def _run_length(valores):
    """Largo de la racha final de valores iguales (True/False o signos)."""
    n = 0
    for v in reversed(list(valores)):
        if v != valores[-1]:
            break
        n += 1
    return n


def _serie_status(serie_id, real, snaps):
    ev = _evaluate(snaps, real)
    estado = {"serie": serie_id, "pronosticos_guardados": len(snaps), "evaluaciones": len(ev), "alertas": []}
    if snaps:
        bt = (snaps[-1]["backtest"].get("produccion_real") or {})
        estado["mape_backtest_h1"] = (bt.get("mape_por_horizonte") or {}).get("1", bt.get("mape"))
    prod = real["produccion"].dropna()
    if not prod.empty:
        ult = prod.tail(24)
        estado["rango_produccion_24m"] = {"min": ult.min(), "max": ult.max()}

    if len(snaps) >= 2:
        prev, last = np.array(snaps[-2]["beta"]), np.array(snaps[-1]["beta"])
        lo, hi = np.percentile(prev, [2.5, 97.5])
        estado["beta"] = {"anterior": {"origen": snaps[-2]["ultimo_mes"], "media": prev.mean(), "p2_5": lo, "p97_5": hi},
                          "actual": {"origen": snaps[-1]["ultimo_mes"], "media": last.mean()}}
        if not lo <= last.mean() <= hi:
            estado["alertas"].append({"tipo": "cambio_beta", "detalle": f"beta {prev.mean():.3f} -> {last.mean():.3f}"})

    if ev.empty:
        estado["estado"] = "sin_datos" if not estado["alertas"] else "alerta"
        estado["detalle"] = []
        return _finish(estado)

    h1 = ev[ev["h"] == 1].sort_values("fecha")
    estado["detalle"] = ev.sort_values(["fecha", "h"]).to_dict("records")
    if len(h1) >= config.MONITOR_MIN_EVAL:
        ventana = h1.tail(config.MONITOR_WINDOW)
        mape = ventana["error_rel"].abs().mean()
        estado["mape_movil"] = {"meses": len(ventana), "mape": mape, "mape_plan": ventana["error_rel_plan"].abs().mean()}
        ref = estado.get("mape_backtest_h1")
        if ref and mape > config.MONITOR_MAPE_FACTOR * ref:
            estado["alertas"].append({"tipo": "mape_alto",
                                      "detalle": f"MAPE móvil {mape:.1%} > {config.MONITOR_MAPE_FACTOR} × {ref:.1%}"})
    if not h1.empty:
        fuera = h1["fuera_ic95"].tolist()
        if fuera[-1] and _run_length(fuera) >= config.MONITOR_OUT_RUN:
            estado["alertas"].append({"tipo": "fuera_ic95", "detalle": f"{_run_length(fuera)} meses seguidos fuera del IC 95 %"})
        signos = np.sign(h1["error_rel"]).tolist()
        if _run_length(signos) >= config.MONITOR_BIAS_RUN:
            lado = "sobreestima" if signos[-1] > 0 else "subestima"
            estado["alertas"].append({"tipo": "sesgo", "detalle": f"{_run_length(signos)} meses seguidos: {lado}"})
    estado["estado"] = "alerta" if estado["alertas"] else "ok"
    return _finish(estado)


def _finish(estado):
    for a in estado["alertas"]:
        a["accion"] = ACCIONES[a["tipo"]]
    return estado


def monitor(df, sheets, history_dir=config.HISTORY_DIR, out=config.OUTPUT_DIR / "monitoreo.json"):
    """Evalúa los pronósticos guardados contra los datos reales y escribe monitoreo.json."""
    from .export import _clean
    series = []
    for sheet in sheets:
        sid = sheet["id"]
        real = df[(df["serie_id"] == sid) & df["es_total"]].set_index("fecha")[["consumo", "produccion"]]
        real = real[~excluded_mask(real.index)]
        st = _serie_status(sid, real, _load_history(sid, history_dir))
        log.info("monitoreo %-11s %-9s evaluaciones=%d %s", sid, st["estado"], st["evaluaciones"],
                 "; ".join(a["tipo"] for a in st["alertas"]))
        series.append(st)
    data = {
        "generado": datetime.now().isoformat(timespec="seconds"),
        "parametros": {"ventana_meses": config.MONITOR_WINDOW, "min_evaluaciones": config.MONITOR_MIN_EVAL,
                       "factor_mape": config.MONITOR_MAPE_FACTOR, "meses_fuera_ic95": config.MONITOR_OUT_RUN,
                       "meses_sesgo": config.MONITOR_BIAS_RUN},
        "series": series,
    }
    out.write_text(json.dumps(_clean(data), ensure_ascii=False, indent=1), encoding="utf-8")
    return series
