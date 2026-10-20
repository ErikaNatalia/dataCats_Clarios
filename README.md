# Clarios SCADA | Dashboard de Energía y Gas

Dashboard industrial para monitorear el consumo energético, costos, producción, alertas y trazabilidad de datos de las plantas de baterías Clarios.

La aplicación incluye una vista ejecutiva multi-planta, una vista reutilizable de detalle por fábrica, registro dinámico de nuevas plantas y un módulo de fuentes de datos.

## Funcionalidades principales

- KPIs globales comparados contra el promedio histórico.
- KPIs por planta comparados contra el corte o mes anterior.
- Resumen ejecutivo con balance, mayor oportunidad e impacto económico.
- Tarjetas de plantas con consumo, costo en COP, intensidad, desviación y alertas.
- Vista de detalle reutilizable para cualquier planta registrada.
- Velocímetro dinámico de demanda eléctrica con rangos operativos.
- Gráficas de consumo diario, procesos y gas.
- Registro de nuevas fábricas con solo nombre y archivo XLSX, XLS, CSV o JSON.
- Persistencia local de plantas personalizadas mediante `localStorage`.
- Eliminación de plantas personalizadas protegida por un código temporal generado al solicitar la eliminación.
- Inventario y trazabilidad de fuentes de datos.
- Vista previa y descarga de archivos CSV.
- Carga de telemetría CSV y DAT desde la parte superior de Fuentes de datos.
- Lectura local de Excel con detección de períodos, procesos y métricas energéticas.
- Filtros de mes y año conectados a los cortes reales del JSON de F&A.
- Análisis automatizado y explicable para cada planta, con hallazgos, prioridad y decisiones sugeridas.
- Informe PDF descargable generado localmente desde el análisis de cada planta.
- Menú hamburguesa visible en escritorio, tablet y móvil, con navegación, filtros y acciones de las plantas.
- Switch de tema claro/oscuro que conserva la identidad Clarios y recuerda la selección.

## Vistas disponibles

### Vista general

Presenta el estado consolidado de la operación, comparaciones históricas, lectura ejecutiva y tarjetas de todas las plantas.

### Detalle de planta

La misma vista se reutiliza para Ensamble & OREC, F&A, RC Energía y Gas y cualquier planta creada posteriormente. Incluye:

- Consumo y costo.
- Comparación contra el corte anterior.
- Desviación presupuestaria.
- Intensidad energética por unidad.
- Producción y estado SCADA.
- Procesos de mayor consumo.
- Monitor de gas.
- Velocímetro y diagnóstico operativo.
- Análisis inteligente explicable e informe PDF por planta.

### Fuentes de datos

Muestra el recorrido de la información desde el archivo de origen hasta los KPIs, junto con:

- Carga masiva de telemetría, situada antes del resumen y del inventario de documentos.
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

En **Vista General** y **Fuentes de datos** está disponible **Registrar nueva planta**. Las plantas
creadas desde ese formulario se guardan en el navegador actual y se pueden eliminar después; son
adicionales a las series del pipeline.

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

## Formato de telemetría

Los archivos CSV deben incluir como mínimo:

```csv
Planta,Consumo_kWh,Presupuesto_kWh,Unidades
ensamble,684000,700000,200000
fa,1260000,1300000,207200
rc_energy,864000,780000,200000
```

La columna `Planta` debe corresponder al identificador interno de la fábrica.

Este formato corresponde al cargador masivo heredado. Para crear una fábrica nueva se usa el formulario **Registrar nueva planta**, que analiza el archivo mensual y crea la vista completa automáticamente.

## Dataset JSON mensual de F&A

El ejemplo procesado desde Excel se incorporó con el nombre:

```text
data/planta_fya_energia.json
```

La convención usada es `planta_<id>_<servicio>.json`. El identificador declarado por el archivo es `fya`; en la interfaz se adapta a la clave histórica `fa` de la planta F&A.

Vite referencia el archivo como un recurso del proyecto y conserva su URL correcta en desarrollo y producción:

```js
const FYA_DATA_URL = new URL('../data/planta_fya_energia.json', import.meta.url).href;
const response = await fetch(FYA_DATA_URL);
const dataset = await response.json();
```

El dashboard valida que existan `id`, `procesos`, una serie total y al menos dos cortes. Los selectores de período se llenan exclusivamente con los meses y años disponibles en la planta analítica que se está consultando. Al cambiar el corte se recalculan KPIs, comparaciones, alertas y gráficas frente al mes anterior real. En la vista general el filtro conserva el alcance de F&A; dentro de una planta creada desde archivo pasa a controlar esa planta. El archivo también aparece en **Fuentes de Datos**, donde se puede previsualizar y descargar.

Campos aprovechados en la nueva vista estratégica:

- Consumo, producción e intensidad mensual.
- Intensidad presupuestada y desviación frente al presupuesto.
- Rango estadístico esperado, límites, estado y puntaje z.
- Costo unitario y costo total interpretados y presentados en pesos colombianos (COP).
- Comparación por proceso: F&A total, Formación y Línea Acabado Principal.
- Alertas del último corte.
- Cobertura histórica, períodos excluidos, calidad y estacionalidad.

Los campos nulos se muestran como no disponibles; no se rellenan con cero. El JSON tampoco se interpreta como fuente de gas, sensores, emisiones, datos horarios o capacidad contratada.

## Crear y eliminar una planta

En **Registrar nueva planta** solo se solicita:

1. Nombre de la planta.
2. Archivo `.xlsx`, `.xls`, `.csv` o `.json` de hasta 15 MB.

Para hojas tabulares, el lector reconoce encabezados equivalentes a fecha/período, proceso, consumo, producción, intensidad, presupuesto, costo y rangos. Debe haber al menos dos cortes mensuales comparables. Si no existe una fila total, se construye el consolidado a partir de los procesos detectados.

El selector muestra claramente el nombre, formato y tamaño del archivo elegido. Antes de crear la planta se puede **Cambiar** o **Quitar** el archivo sin cerrar el formulario; también admite arrastrar y soltar.

Después de la validación, se genera la tarjeta, la vista de detalle, los filtros de mes y año, las comparaciones mensuales y el registro en **Fuentes de Datos**. El archivo se procesa localmente y no se envía a un servidor.

El código no se crea ni se guarda al registrar la planta. Al pulsar **Eliminar planta registrada**, el dashboard genera un código temporal con formato `CL-XXXX-XXXX`, lo muestra dentro del diálogo y exige copiarlo o escribirlo exactamente para habilitar la eliminación. Al cancelar o cerrar el diálogo, el código vence. Las tres plantas base no pueden eliminarse desde esta acción.

## Controles operativos y evidencia del dato

- **Ver datos del corte:** es la única acción del diagnóstico. Muestra los registros del período activo tomados del archivo fuente, desglosados por proceso, con consumo, intensidad, rango histórico y sobrepresupuesto. Los valores bajos, inactivos o sin historia no se presentan como alertas de intensidad alta. En plantas sin historial importado se identifica el snapshot demostrativo.
- Se retiró **Ver cálculo del corte / Revisar señales del corte** porque abría exactamente la misma tabla.
- Se retiró **Simular punto de ajuste térmico**: asignaba un consumo fijo al cruzar un umbral de temperatura, sin un modelo validado con los datos de la planta.
- El informe distingue señales de procesos afectados y limita la historia al corte seleccionado. Describe el alcance de los datos sin atribuir una confianza estadística no calculada. La ausencia de meta e historia válida se identifica como evaluación limitada.

## Persistencia

Las plantas creadas desde la interfaz se guardan en el navegador bajo la clave:

```text
clarios.customPlants.v1
```

Esta persistencia es local al dispositivo y al navegador. No reemplaza una base de datos compartida.
Los metadatos y la serie normalizada se restauran al recargar; por seguridad y tamaño, el archivo binario original solo puede descargarse durante la sesión en la que se importó.

## Documentación de la entrega

El detalle completo de cambios, fórmulas, validaciones y pasos sugeridos para Git se encuentra en [DOCUMENTACION_IMPLEMENTACION.md](DOCUMENTACION_IMPLEMENTACION.md).

La explicación funcional de cada componente, los datos utilizados y las propuestas de ciencia de datos se encuentra en [GUIA_FUNCIONAL_DASHBOARD.md](GUIA_FUNCIONAL_DASHBOARD.md).
