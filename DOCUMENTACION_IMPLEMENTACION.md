# Documentación de implementación — Dashboard Clarios SCADA

## 1. Objetivo de la entrega

Mejorar la calidad visual y la capacidad de toma de decisiones del dashboard, corregir la presentación del velocímetro, permitir el crecimiento a nuevas fábricas y hacer visible el origen de los datos mostrados.

Esta entrega parte de la primera versión del dashboard y conserva su arquitectura HTML, CSS y JavaScript, ampliándola con componentes reutilizables y estado dinámico.

## 2. Alcance implementado

### 2.1 Renovación visual

- Fondo industrial con capas, gradientes, iluminación ambiental y retícula técnica.
- Paleta consistente con Clarios:
  - Púrpura para navegación y acciones.
  - Verde para mejoras y operación nominal.
  - Rojo para deterioro, sobreconsumo y alertas.
  - Ámbar para límites y precauciones.
  - Cian para telemetría y trazabilidad.
- Tipografía `Outfit` para interfaz y `JetBrains Mono` para valores técnicos.
- Jerarquía visual reforzada en encabezados, KPIs, estados y acciones.
- Tarjetas con profundidad, bordes semitransparentes y respuesta visual al foco.
- Adaptación responsive para escritorio, tablet y móvil.
- Navegación móvil mediante menú lateral.

### 2.2 KPIs orientados a decisiones

Se separaron las bases de comparación para evitar interpretaciones incorrectas:

- Los indicadores de la vista general se comparan contra el promedio histórico.
- Los indicadores de cada planta se comparan contra el corte o mes anterior.
- La desviación de presupuesto se mantiene separada de la variación del consumo.
- Se añadieron flechas, porcentaje de cambio y estado semántico de mejora, deterioro o estabilidad.
- Se agregó una franja de lectura ejecutiva con:
  - Número de plantas que mejoran.
  - Consumo neto frente al corte anterior.
  - Planta con mayor deterioro.
  - Impacto económico estimado.

### 2.3 Corrección del velocímetro

- El velocímetro dejó de depender de posiciones fijas y ahora se actualiza con los datos de la planta seleccionada.
- Se corrigieron superposiciones entre lectura, subtítulo, aguja y gráfico.
- Los valores del panel de calibración se alinearon mediante columnas estables.
- La lectura central, los rangos y la aguja responden al consumo, presupuesto y capacidad máxima.
- El componente se adapta a resoluciones de escritorio y móvil.
- Se separaron correctamente:
  - Desviación total contra presupuesto.
  - Desviación de intensidad energética contra la meta de kWh por unidad.

### 2.4 Registro de nuevas fábricas

Se incorporó la acción `Registrar nueva planta` en:

- Vista general.
- Vista de fuentes.
- Menú móvil.

El formulario solicita únicamente el nombre de la planta y un archivo `.xlsx`, `.xls`, `.csv` o `.json` de hasta 15 MB. El lector local detecta fecha, proceso, consumo, producción o intensidad y, cuando existen, presupuesto, costos y rangos estadísticos.

Al guardar una planta, el sistema:

1. Valida el formato y exige al menos dos cortes mensuales comparables.
2. Normaliza las series y crea un consolidado si el archivo solo contiene procesos.
3. Calcula consumo, producción, intensidad, presupuesto, costo, rangos y alertas con los campos disponibles.
4. Genera un identificador interno para la nueva planta.
5. Añade la tarjeta, la navegación, la vista de detalle y la fuente auditada.
6. Compara cada KPI contra el corte mensual anterior real.
7. Guarda la serie normalizada en `localStorage`.
8. Habilita los filtros de mes y año con los períodos detectados en el archivo.

El selector de archivo informa nombre, formato y tamaño, permite cambiarlo, quitarlo o reemplazarlo mediante arrastrar y soltar antes de crear la planta.

Las plantas personalizadas muestran **Eliminar planta registrada**. Al solicitar la eliminación se genera un código temporal `CL-XXXX-XXXX`; la acción solo se habilita cuando el usuario vuelve a introducir exactamente el código mostrado. El código no se guarda con la planta y vence al cerrar o cancelar el diálogo. Un valor incorrecto conserva la planta. Las plantas base no exponen esta acción.

La vista de detalle no se duplica en HTML. Es un componente reutilizable alimentado por el objeto de la planta seleccionada.

### 2.5 Fuentes y trazabilidad

Se añadió la pestaña `Fuentes de Datos`, disponible también en el menú móvil y mediante `#sources`.

Incluye:

- Número de fuentes registradas y validadas.
- Período seleccionado en el filtro global.
- Hora de la última carga manual.
- Flujo de linaje:
  - Archivo de origen.
  - Validación.
  - Transformación.
  - Visualización.
- Inventario de archivos con alcance, formato, período y estado.
- Vista previa segura de archivos de texto.
- Descarga de fuentes locales.
- Apertura de vínculos externos.

Fuentes base incluidas:

- `data/telemetria_muestra_normal.csv`
- `data/telemetria_sobreconsumo_rc.csv`

Ambos archivos se incluyen dentro de la compilación de producción mediante URLs gestionadas por Vite.

### 2.6 Carga de archivos

- CSV y DAT:
  - Se leen como texto.
  - Se registran en el inventario de fuentes.
  - Se muestran en la vista previa.
  - Actualizan las plantas encontradas en el archivo.
- XLSX y XLS:
  - Se interpretan localmente con SheetJS CE.
  - Se buscan encabezados compatibles en todas las hojas.
  - Recalculan KPIs y visualizaciones cuando se usan para crear una planta.
  - El binario puede descargarse durante la sesión de importación; después de recargar se conservan la serie normalizada y una vista previa textual, no el archivo original.
- Los enlaces externos solo aceptan protocolos `http://` y `https://`.

### 2.7 Análisis inteligente e informe por planta

La vista reutilizable de cada planta incorpora **Análisis inteligente e informe**. El análisis es local, automatizado y explicable; no depende de una API externa ni presenta causalidad como hecho.

Evalúa:

- Consumo, producción, intensidad y costo frente al corte anterior.
- Distancia contra la meta y el presupuesto.
- Alertas y posición frente al rango histórico.
- Proceso de mayor participación.
- Cobertura histórica y limitaciones de la fuente.

El resultado incluye prioridad, nivel de confianza, lectura ejecutiva, hallazgos, decisiones sugeridas e indicadores de seguimiento. Las plantas con al menos 12 registros mensuales reciben confianza alta para tendencia; las plantas base se identifican como datos demostrativos referenciales.

Desde la misma ventana se genera un PDF real de una o más páginas. El documento se crea completamente en el navegador, se descarga localmente y contiene fuente, período, métricas, recomendaciones y advertencias de uso.

## 3. Reglas de cálculo

### 3.1 Cambio frente al corte anterior

```text
cambio % = ((valor actual - valor anterior) / valor anterior) × 100
```

Para consumo, costo, intensidad y alertas, un valor menor se interpreta como mejora.

### 3.2 Desviación presupuestaria

```text
desviación % = ((consumo actual - presupuesto) / presupuesto) × 100
```

- Resultado mayor que cero: exceso.
- Resultado igual o menor que cero: dentro del presupuesto.

### 3.3 Intensidad energética

```text
intensidad kWh/unidad = consumo actual / unidades producidas
```

### 3.4 Meta de intensidad

```text
intensidad objetivo = presupuesto / unidades producidas
```

### 3.5 Costo de una planta importada

El costo solo se muestra cuando el archivo contiene `costo_total` o `costo_unitario`. Para este proyecto los campos de costo se interpretan en pesos colombianos (COP); los valores ausentes aparecen como `n.a.`. Las plantas demostrativas usan una tarifa de referencia explícita de 480 COP/kWh.

## 4. Modelo de persistencia

Las plantas creadas por el usuario se guardan como JSON en:

```text
clarios.customPlants.v1
```

Al volver a abrir el dashboard:

1. Se recuperan las plantas personalizadas.
2. Se regeneran sus tarjetas y accesos de navegación.
3. Se reconstruyen sus analíticas desde el dataset normalizado y se restauran los metadatos de la fuente.
4. Se recalculan los consolidados.

Limitación: los datos son locales al navegador. Para uso multiusuario se necesita una API y una base de datos central.

## 5. Archivos principales modificados

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Nuevas acciones, pestaña de fuentes, vista de trazabilidad y formulario de plantas. |
| `css/styles.css` | Sistema visual, responsive, velocímetro, fuentes, tablas y formularios. |
| `js/app.js` | Estado, cálculos, navegación, persistencia, registro de plantas, carga de archivos y fuentes. |
| `js/plant-data.js` | Normalización del JSON, lectura de Excel/CSV, detección de campos, rangos y códigos de seguridad. |
| `README.md` | Descripción y guía de ejecución actualizadas. |
| `DOCUMENTACION_IMPLEMENTACION.md` | Documento técnico y guía de entrega. |
| `GUIA_FUNCIONAL_DASHBOARD.md` | Explicación funcional, origen de datos y propuestas de ciencia de datos. |
| `dist/` | Versión de producción generada por Vite. |

Los nombres hash de los archivos dentro de `dist/assets/` cambian en cada compilación. Por eso es normal ver los bundles anteriores eliminados y bundles nuevos añadidos.

## 6. Ejecución local

```bash
npm install
npm run dev
```

URL local:

```text
http://127.0.0.1:3000
```

Vista directa de fuentes:

```text
http://127.0.0.1:3000/#sources
```

## 7. Compilación de producción

```bash
npm run build
```

Resultado esperado:

- Transformación de módulos sin errores.
- Generación de `dist/index.html`.
- Generación de bundles CSS y JavaScript con hash.

## 8. Validaciones realizadas

- Compilación de producción exitosa con Vite.
- Validación sintáctica de `js/app.js` mediante Node.js.
- Verificación de IDs HTML sin duplicados.
- Revisión visual de la vista general en 1440 × 1100.
- Revisión visual de la vista de fuentes en 1440 × 1100.
- Comprobación de las URLs de las fuentes dentro del bundle de producción.
- Verificación del estado responsive de tarjetas, tabla, formulario y velocímetro.
- Prueba del parser con el JSON real de F&A, un CSV multiproceso y un libro XLSX.
- Prueba funcional en navegador: julio de 2026 muestra `1,144,675 kWh`; junio de 2026 muestra `1,067,147 kWh` y compara contra mayo.
- Comprobación de sincronización entre los filtros principal y móvil.
- Creación de una planta temporal desde el JSON, persistencia local, registro de fuente y filtros propios de mes/año.
- Comprobación del selector de archivo: seleccionar, cambiar y quitar antes de crear la planta.
- Generación del código `CL-XXXX-XXXX` únicamente al iniciar la eliminación.
- Comprobación de que un código incorrecto bloquea la eliminación y conserva la planta.
- Verificación de interfaz sin referencias visibles a USD y presentación consistente en COP.
- Prueba del análisis inteligente en F&A y RC, incluida la diferencia entre historia mensual y snapshot demostrativo.
- Generación y revisión visual de un informe PDF de dos páginas con indicadores, hallazgos, decisiones y limitaciones.
- Limpieza de archivos temporales y dependencias específicas del entorno de validación.

## 9. Criterios de aceptación cubiertos

### Historia de usuario 1

> Como responsable de operación, quiero registrar una nueva fábrica para visualizar sus indicadores dentro del dashboard.

- Se puede crear una planta desde la interfaz.
- La nueva planta tiene tarjeta y vista de detalle.
- Sus KPIs se calculan automáticamente.
- Se compara contra el corte anterior.
- Se integra a la navegación.
- Permanece después de recargar en el mismo navegador.
- Se crea desde el archivo sin diligenciar KPIs manualmente.
- Se puede eliminar únicamente reingresando el código temporal generado al iniciar la eliminación.

### Historia de usuario 2

> Como usuario del dashboard, quiero conocer el origen de los datos para poder validarlos y auditarlos.

- Existe una vista específica de fuentes.
- Se muestran archivos base reales.
- Se pueden previsualizar y descargar.
- Las nuevas cargas se registran automáticamente.
- Una planta conserva el nombre, formato, período y vista previa de su archivo de origen.
- Se muestra el flujo desde el origen hasta el KPI.

## 10. Limitaciones conocidas y siguientes pasos

- Sustituir `localStorage` por persistencia central para trabajo multiusuario.
- Conectar fuentes SCADA o APIs reales.
- Incorporar autenticación y permisos por rol.
- Convertir la descarga simulada del informe consolidado en un PDF real.
- Añadir edición de plantas y una auditoría central de altas y eliminaciones.
- Configurar tarifas de energía y gas por planta y período.
- Añadir pruebas automatizadas de interfaz y cálculos.

## 11. Preparación sugerida para Git

Antes del commit:

```bash
git status
git diff --check
git diff --stat
```

Agregar los cambios:

```bash
git add .gitignore README.md DOCUMENTACION_IMPLEMENTACION.md index.html css/styles.css js/app.js js/plant-data.js data/planta_fya_energia.json package.json package-lock.json dist
```

Commit sugerido:

```bash
git commit -m "feat: mejora dashboard Clarios y agrega plantas y trazabilidad"
```

La rama actual verificada es `feature/dashboard-lorena`. Para publicarla:

```bash
git push origin feature/dashboard-lorena
```

Si la rama todavía no tiene seguimiento remoto:

```bash
git push -u origin feature/dashboard-lorena
```

No se debe incluir información sensible, credenciales ni archivos locales de configuración en el commit.

## 12. Integración del dataset JSON de F&A

### Archivo y convención

El archivo procesado desde Excel se incorporó sin alterar su contenido:

```text
data/planta_fya_energia.json
```

Convención: `planta_<identificador>_<servicio>.json`.

- Identificador de la fuente: `fya`.
- Planta mostrada: `F&A`.
- Clave histórica del dashboard: `fa`.
- Servicio: `energia`.
- Período: octubre de 2019 a julio de 2026.
- Registros: 82 meses por serie total.

La referencia se resuelve mediante Vite para que funcione tanto en desarrollo como en el bundle:

```js
const FYA_DATA_URL = new URL('../data/planta_fya_energia.json', import.meta.url).href;
```

Durante la inicialización, `loadFyaEnergyDataset()` usa `fetch`, valida el esquema, normaliza el contenido y lo adapta a `DashboardStore.plants.fa`. Si la carga falla, se conserva el estado anterior del dashboard y la fuente queda como registrada, no validada.

La navegación y los botones se inicializan antes de solicitar el JSON. La carga de F&A se ejecuta en segundo plano y vuelve a renderizar los indicadores cuando termina; de esta forma una fuente lenta, ausente o bloqueada no congela la interfaz.

### Filtros de período

Los selectores de la cabecera y del menú móvil muestran el nombre de la planta analítica activa. Se construyen con `availablePeriods`, por lo que solo habilitan años y meses presentes en su propia serie y que tienen un corte anterior comparable. Cada cambio ejecuta `selectAnalyticsPeriod()` sobre esa planta y actualiza:

- KPI actual y comparación contra el mes anterior.
- Tendencias, alertas y diagnóstico.
- Ventanas de consumo e intensidad hasta el corte seleccionado.
- Período visible en Fuentes de Datos.

En la vista general y en Fuentes de Datos, el filtro conserva el alcance de F&A. En la vista de detalle de una planta creada desde archivo controla la serie de esa planta y su selección se guarda localmente. Ensamble y RC no tienen series mensuales importadas, por lo que sus filtros quedan deshabilitados en lugar de fabricar cortes inexistentes.

### Controles que no provienen del archivo

- **Simular punto de ajuste térmico (RC):** conserva el prototipo original como simulación local y solo se muestra en RC Energía y Gas. El valor de temperatura y el escenario resultante están definidos en `js/app.js`; no se leen ni escriben en PLC, Modbus o SCADA.
- **Ver datos del corte:** sustituye la tabla SCADA estática. Para plantas analíticas toma el período activo y los registros por proceso desde `analytics.processes`; para plantas base aclara que solo existe un snapshot demostrativo local.
- **Revisar señales del corte / Ver cálculo del corte:** sustituye la acción sin efecto “Señal derivada de la fuente” y abre la trazabilidad del valor que alimenta los KPI.

No se añadieron curvas horarias, potencia pico ni órdenes de control porque el JSON mensual no contiene timestamps horarios, demanda kW, tags de sensores ni confirmaciones de actuadores. Incluirlas con los datos actuales implicaría inventar telemetría.

### Mapeo al dashboard

| Campo JSON | Uso |
| --- | --- |
| `procesos[].serie[].consumo` | KPI de consumo, tendencia y serie mensual |
| `produccion` | KPI de producción en ECU |
| `intensidad` | Consumo unitario en kWh/ECU |
| `intensidad_ppto` | Meta de intensidad |
| `desviacion_ppto` | Brecha presupuestaria |
| `costo_unitario` y `costo_total` | Análisis de tarifa y costo |
| `rangos.*` | Valor esperado, límites, z-score y estado |
| `alertas_ultimo_mes` | Alertas accionables del corte |
| `estacionalidad` | Validación de patrones mensuales |
| `calidad` y `parametros` | Cobertura, exclusiones y reglas estadísticas |

El presupuesto energético del corte se deriva como:

```text
producción × intensidad presupuestada
```

Para julio de 2026, esto permite estimar el exceso de consumo frente al presupuesto sin inventar un campo inexistente.

### Nuevas visualizaciones estratégicas

- Cinco señales ejecutivas: consumo, producción, intensidad, brecha presupuestaria y costo.
- Serie de consumo mensual real frente al consumo esperado.
- Gráfico de control de intensidad de 24 meses con banda esperada, referencia histórica y presupuesto.
- Comparación de F&A total, Formación y Línea Acabado Principal.
- Detección de señal dual en Acabado: favorable frente al presupuesto, pero alta frente a su propia historia.
- Listado de las cinco alertas del último corte.
- Panel de cobertura y calidad con meses disponibles, exclusiones, estacionalidad y parámetros de rango.
- Exportación CSV mensual basada en la serie real del JSON.

### Precauciones semánticas

- Los campos `costo_unitario` y `costo_total` se interpretan como COP para este proyecto. Una futura fuente multimoneda deberá declarar código de moneda y tasa de conversión.
- `costo_unitario` se interpreta como tarifa por kWh porque `costo_total = consumo × costo_unitario`.
- Los dos procesos internos no se registran como plantas nuevas.
- Los valores nulos no se reemplazan por cero.
- No se derivan del archivo datos de gas, sensores, SCADA en tiempo real, emisiones, capacidad contratada ni frecuencia diaria/horaria.
