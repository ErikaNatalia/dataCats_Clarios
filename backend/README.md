# Backend: pipeline de datos y API

Convierte el Excel fuente de Clarios en los JSON que consume el dashboard y expone una API local
para cargar un Excel nuevo desde el front.

```
Base de datos.xlsx ──► pipeline/ (limpieza, estadística) ──► modelos/ (BSTS en R) ──► output/*.json
                                                                                       │
                       api/ (FastAPI :8000) ◄──── front (Vite :3000, proxy /api) ◄─────┘
```

## Requisitos

- Python 3.12+: `pip install -r requirements.txt`
- R con `bsts` y `jsonlite`: `install.packages(c("bsts", "jsonlite"))`

## Uso (desde esta carpeta)

```bash
uvicorn api.main:app --port 8000      # API para el dashboard
python run_pipeline.py                 # corrida completa (Excel -> JSON, ~2 min)
python run_pipeline.py --sin-modelos   # solo limpieza y estadística, sin R
python -m pipeline.plantilla           # regenera entrada/plantilla_clarios.xlsx
```

Luego, en la raíz del repo: `npm run dev` y abrir http://127.0.0.1:3000.

## Datos

- `Base de datos.xlsx` no se versiona (datos de Clarios). Colóquelo en esta carpeta o cárguelo
  desde el dashboard (Fuentes de datos → Cargar datos fuente). Debe cumplir la plantilla:
  `entrada/plantilla_clarios.xlsx` (hoja Instrucciones).
- `output/` sí se versiona para que el dashboard funcione al clonar, salvo `datos_limpios.csv`
  (los datos completos ya limpios, entrada de los modelos).
- Cada carga desde el dashboard guarda un respaldo en `entrada/fuentes/` (no versionado).
