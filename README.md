# Clarios SCADA | Dashboard de Energía y Gas

Dashboard industrial para monitorear el consumo energético, costos, producción, alertas y trazabilidad de datos de las plantas de baterías Clarios.

La aplicación incluye una vista ejecutiva multi-planta, una vista reutilizable de detalle por fábrica y un módulo de fuentes de datos. Todos los datos salen del pipeline del backend.

## Funcionalidades principales

- KPIs globales comparados contra el promedio histórico.
- KPIs por planta comparados contra el corte o mes anterior.
- Resumen ejecutivo con balance, mayor oportunidad e impacto económico.
- Tarjetas de plantas con consumo, costo en COP, intensidad, desviación y alertas.
- Vista de detalle reutilizable para cualquier planta registrada.
- Velocímetro dinámico de demanda eléctrica con rangos operativos.
- Gráficas de consumo mensual (real vs esperado) y consumo por proceso.
- Inventario y trazabilidad de fuentes de datos.
- Vista previa y descarga de los JSON generados.
- Carga del Excel fuente desde Fuentes de datos: validación, revisión de cambios y recálculo del pipeline.
- Filtros de mes y año conectados a los cortes reales de cada planta.
- Análisis automatizado y explicable para cada planta, con hallazgos, prioridad y decisiones sugeridas.
- Informe PDF descargable generado localmente desde el análisis de cada planta.
- Menú hamburguesa visible en escritorio, tablet y móvil, con navegación, filtros y acciones de las plantas.
- Switch de tema claro/oscuro que conserva la identidad Clarios y recuerda la selección.

## Vistas disponibles

### Vista general

Presenta el estado consolidado de la operación, comparaciones históricas, lectura ejecutiva y tarjetas de todas las plantas.

### Detalle de planta

La misma vista se reutiliza para cada serie del pipeline (Ensamble, OREC, F&A, RC Energía, RC Gas y cualquier hoja nueva del Excel). Incluye:

- Consumo y costo.
- Comparación contra el corte anterior.
- Desviación presupuestaria.
- Intensidad energética por unidad.
- Producción y estado analítico (procesos con alerta).
- Consumo por proceso (se oculta en plantas de un solo proceso).
- Velocímetro y diagnóstico operativo.
- Análisis inteligente explicable e informe PDF por planta.

### Fuentes de datos

Muestra el recorrido de la información desde el archivo de origen hasta los KPIs, junto con:

- Carga del Excel fuente e historial de cargas.
- Inventario de fuentes.
- Alcance y formato.
- Estado de validación.
- Período o fecha de carga.
- Vista previa.
- Descarga o apertura del vínculo original.

También puede abrirse directamente con:

```text
http://127.0.0.1:3000/#sources
```

## Tecnologías

- HTML5
- CSS3
- JavaScript ES Modules
- Vite 5
- SheetJS CE para lectura local de Excel y CSV
- Almacenamiento local del navegador
- SVG dinámico para gráficas y velocímetro

## Ejecutar el proyecto

Para usar la aplicación con sus datos del pipeline, se necesitan:

- Node.js 18 o superior.
- npm.
- Python 3.12 o superior.

No abras `index.html` con doble clic: un archivo HTML no puede iniciar por sí solo la API y el
servidor web. Usa el comando de inicio desde la terminal integrada de VS Code o PowerShell.

### Preparación (una sola vez)

Desde la carpeta raíz del repositorio:

```powershell
npm.cmd ci
py -3.13 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Si tienes Python 3.12 en vez de 3.13, cambia `-3.13` por `-3.12`.

En Linux, crea un entorno propio (no copies la carpeta `.venv` de otro sistema):

```bash
npm ci
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
npm start
```

Para actualizar el código, conserva primero tus cambios locales en un commit o en un stash y,
desde tu rama de trabajo con seguimiento remoto configurado, ejecuta:

```bash
git fetch origin
git pull --ff-only
```

Repite la instalación de dependencias cuando cambien `package-lock.json` o
`backend/requirements.txt`.

### Iniciar la aplicación

Desde la raíz del repositorio, ejecuta:

```powershell
npm.cmd start
```

El comando inicia la API y Vite, y abre el dashboard en el navegador. Si los puertos 3000 o 8000 ya
están ocupados por esta misma aplicación, reutiliza la API existente y Vite selecciona otro puerto
disponible (por ejemplo, 3001). Para detener los servicios, pulsa `Ctrl+C` en esa terminal.

El dashboard necesita la API: si no responde, muestra una pantalla "Backend no disponible" con un
botón **Reintentar** (no hay datos de demostración).

`npm.cmd run dev` sigue disponible para ejecutar solamente el front; no inicia la API.

Para procesar un Excel o regenerar pronósticos también se requiere R y los paquetes `bsts` y
`jsonlite`. Los datos JSON ya generados se pueden consultar sin R.

El Excel privado `backend/Base de datos.xlsx` no se descarga con Git. Sin ese archivo puedes
consultar los datos publicados; para regenerarlos, coloca allí el Excel real o cárgalo desde el
dashboard. Consulta [la preparación de R en Windows](backend/README.md#r-en-windows).

## Generar la versión de producción

```powershell
npm.cmd run build
```

El resultado se genera en `dist/`.

Para probar esa versión:

```powershell
npm.cmd run preview
```

## Datos del dashboard

Todas las plantas salen de los JSON que genera el pipeline (`backend/output/`), servidos por la API en
`/api/datos/`: `index.json` lista las series y cada serie tiene su archivo (`ensamble.json`,
`rc-gas.json`, …). El dashboard valida que cada archivo tenga `id`, `procesos`, una serie total y al
menos dos cortes. Los selectores de período solo ofrecen los meses disponibles: en la vista general,
los meses que tienen todas las plantas; dentro de una planta, los de esa planta.

Si el backend responde pero aún no hay JSON generados, el dashboard pide cargar el Excel fuente.

## Agregar una planta

Una planta nueva es una hoja nueva en el Excel fuente. Descarga la plantilla en **Fuentes de datos →
Descargar plantilla Excel**, agrega la hoja con el mismo formato y vuelve a cargar el Excel con
**Cargar datos fuente**: el pipeline la detecta y regenera todos los JSON (indicadores, alertas y
pronósticos).

## Controles operativos y evidencia del dato

- **Ver datos del corte:** es la única acción del diagnóstico. Muestra los registros del período activo tomados del archivo fuente, desglosados por proceso, con consumo, intensidad, rango histórico y sobrepresupuesto. Los valores bajos, inactivos o sin historia no se presentan como alertas de intensidad alta.
- Se retiró **Ver cálculo del corte / Revisar señales del corte** porque abría exactamente la misma tabla.
- Se retiró **Simular punto de ajuste térmico**: asignaba un consumo fijo al cruzar un umbral de temperatura, sin un modelo validado con los datos de la planta.
- El informe distingue señales de procesos afectados y limita la historia al corte seleccionado. Describe el alcance de los datos sin atribuir una confianza estadística no calculada. La ausencia de meta e historia válida se identifica como evaluación limitada.

## Documentación de la entrega

El detalle completo de cambios, fórmulas, validaciones y pasos sugeridos para Git se encuentra en [DOCUMENTACION_IMPLEMENTACION.md](DOCUMENTACION_IMPLEMENTACION.md).

La explicación funcional de cada componente, los datos utilizados y las propuestas de ciencia de datos se encuentra en [GUIA_FUNCIONAL_DASHBOARD.md](GUIA_FUNCIONAL_DASHBOARD.md).
