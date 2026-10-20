"""Ejecuta el pipeline completo: Excel + registros -> datos limpios -> modelos BSTS (R) -> JSON para el
front -> historial de pronósticos y monitoreo de drift.

Uso:
  python run_pipeline.py               # corrida mensual
  python run_pipeline.py --backtest    # además recalcula el backtest para elegir especificaciones
  python run_pipeline.py --sin-modelos # solo limpieza y estadística (no ejecuta R)
"""
import argparse
import logging
import sys

from pipeline.export import write_clean_csv, write_json
from pipeline.forecast import run_r
from pipeline.monitoreo import monitor, save_snapshot
from pipeline.esquema import ErrorPlantilla, formato
from pipeline.ingest import load_all


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backtest", action="store_true", help="recalcular el backtest BSTS")
    parser.add_argument("--sin-modelos", action="store_true", help="no ejecutar los modelos en R")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        df, reporte, sheets = load_all()
    except ErrorPlantilla as e:
        for err in e.errores:
            logging.error(formato(err))
        sys.exit(1)
    write_clean_csv(df)
    if not args.sin_modelos:
        run_r(backtest=args.backtest)
        for s in sheets:
            save_snapshot(s["id"])
    indice = write_json(df, reporte, sheets)
    for s in indice:
        logging.info("%-11s %s a %s  procesos=%d  alertas=%d  pronostico=%s", s["id"], s["periodo"]["inicio"],
                     s["periodo"]["fin"], len(s["procesos"]), s["n_alertas"], s["tiene_pronostico"])
    monitor(df, sheets)


if __name__ == "__main__":
    main()
