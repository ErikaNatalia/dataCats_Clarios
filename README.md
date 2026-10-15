# Clarios SCADA | Dashboard de Energía y Gas

Dashboard industrial para monitorear el consumo energético, costos, producción, alertas y trazabilidad de datos de las plantas de baterías Clarios.

La aplicación incluye una vista ejecutiva multi-planta, una vista reutilizable de detalle por fábrica, registro dinámico de nuevas plantas y un módulo de fuentes de datos.

## Funcionalidades principales

- KPIs globales comparados contra el promedio histórico.
- KPIs por planta comparados contra el corte o mes anterior.
- Resumen ejecutivo con balance, mayor oportunidad e impacto económico.
- Tarjetas de plantas con consumo, costo, ratio unitario, desviación y alertas.
- Vista de detalle reutilizable para cualquier planta registrada.
- Velocímetro dinámico de demanda eléctrica con rangos operativos.
- Gráficas de consumo diario, procesos y gas.
- Registro de nuevas fábricas desde el dashboard.
- Persistencia local de plantas personalizadas mediante `localStorage`.
- Inventario y trazabilidad de fuentes de datos.
- Vista previa y descarga de archivos CSV.
- Registro de enlaces externos de Excel o repositorios de datos.
- Carga de telemetría CSV y DAT con actualización de KPIs.
- Registro de archivos XLSX para consulta y auditoría.
- Navegación responsive para escritorio, tablet y móvil.

## Vistas disponibles

### Vista general

Presenta el estado consolidado de la operación, comparaciones históricas, lectura ejecutiva y tarjetas de todas las plantas.

### Detalle de planta

La misma vista se reutiliza para Ensamble & OREC, F&A, RC Energy & Gas y cualquier planta creada posteriormente. Incluye:

- Consumo y costo.
- Comparación contra el corte anterior.
- Desviación presupuestaria.
- Ratio energético por unidad.
- Producción y estado SCADA.
- Procesos de mayor consumo.
- Monitor de gas.
- Velocímetro y diagnóstico operativo.

### Fuentes de datos

Muestra el recorrido de la información desde el archivo de origen hasta los KPIs, junto con:

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
- Almacenamiento local del navegador
- SVG dinámico para gráficas y velocímetro

## Ejecutar el proyecto

Requisitos:

- Node.js 18 o superior.
- npm.

```bash
npm install
npm run dev
```

Abrir:

```text
http://127.0.0.1:3000
```

En PowerShell también puede utilizarse `npm.cmd`:

```powershell
npm.cmd install
npm.cmd run dev
```

## Generar la versión de producción

```bash
npm run build
```

El resultado se genera en `dist/`.

Para probar esa versión:

```bash
npm run preview
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

> Los archivos CSV y DAT pueden actualizar los KPIs. Los archivos XLSX quedan registrados como fuente, pero todavía no son interpretados para recalcular indicadores.

## Persistencia

Las plantas creadas desde la interfaz se guardan en el navegador bajo la clave:

```text
clarios.customPlants.v1
```

Esta persistencia es local al dispositivo y al navegador. No reemplaza una base de datos compartida.

## Documentación de la entrega

El detalle completo de cambios, fórmulas, validaciones y pasos sugeridos para Git se encuentra en [DOCUMENTACION_IMPLEMENTACION.md](DOCUMENTACION_IMPLEMENTACION.md).
