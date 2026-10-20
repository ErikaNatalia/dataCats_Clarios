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

Luego, en la raíz del repo, `npm start` inicia la API y el front y abre el dashboard en el navegador.

### Windows / PowerShell

Desde la raíz del repositorio, prepara el entorno de Python una sola vez:

```powershell
py -3.13 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Desde la raíz del repositorio, la forma recomendada de iniciar todo es:

```powershell
npm.cmd start
```

El comando reutiliza una API que ya esté respondiendo en el puerto 8000; Vite selecciona un puerto
disponible y abre automáticamente el dashboard. Para detenerlo, pulsa `Ctrl+C`. No abras
`index.html` directamente desde el Explorador de archivos. Para regenerar los modelos o cargar un
Excel nuevo, instala R y los paquetes `bsts` y `jsonlite`; consultar los JSON existentes no requiere R.

### R en Windows

Instala R desde [CRAN](https://cran.r-project.org/bin/windows/base/). El backend busca `Rscript`
en el PATH y en las instalaciones estándar de Windows (`%LOCALAPPDATA%\Programs\R` y
`%ProgramFiles%\R`). Si está en otra carpeta, indica la ruta antes de iniciar la aplicación:

```powershell
$env:CLARIOS_RSCRIPT = 'C:\ruta\a\R\bin\Rscript.exe'
```

Instala `bsts` y `jsonlite` en la consola de esa misma instalación de R:

```r
install.packages(c("bsts", "jsonlite"), repos = "https://cloud.r-project.org")
```

El backtest se ejecuta con un núcleo en Windows, porque `mclapply` no admite varios en ese
sistema. En Linux conserva la ejecución en paralelo. Las cargas ejecutan Python y leen sus logs
en UTF-8 para conservar los acentos en ambos sistemas.

### Linux

Desde la raíz del repositorio:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
npm ci
npm start
```

R debe estar disponible como `Rscript` en el PATH, o mediante `CLARIOS_RSCRIPT`. Instala los
paquetes en la misma instalación de R que ejecutará el backend.

## Datos

- `Base de datos.xlsx` no se versiona (datos de Clarios). Colóquelo en esta carpeta o cárguelo
  desde el dashboard (Fuentes de datos → Cargar datos fuente). Debe cumplir la plantilla:
  `entrada/plantilla_clarios.xlsx` (hoja Instrucciones).
- `output/` sí se versiona para que el dashboard funcione al clonar, salvo `datos_limpios.csv`
  (los datos completos ya limpios, entrada de los modelos).
- Cada carga desde el dashboard guarda un respaldo en `entrada/fuentes/` (no versionado).
