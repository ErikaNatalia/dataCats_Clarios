# Guía funcional y analítica del dashboard Clarios

## 1. Propósito

El dashboard resume consumo energético, producción, eficiencia, presupuesto, costos y alertas de las plantas. Su objetivo es ayudar a responder cuatro preguntas:

1. ¿Qué planta o proceso necesita atención?
2. ¿El resultado mejoró o empeoró frente al período comparable?
3. ¿La energía consumida es coherente con la producción y el presupuesto?
4. ¿Qué decisión conviene validar con operación, mantenimiento o finanzas?

El tablero combina dos tipos de información:

- **Series importadas:** F&A y plantas creadas desde JSON, Excel o CSV. Sus indicadores se recalculan con el mes seleccionado.
- **Datos demostrativos locales:** Ensamble y RC mientras no se les cargue una serie mensual. Sirven para mostrar la interfaz, pero no representan una conexión SCADA activa.

## 2. Cabecera y navegación

### Vista General

Regresa al consolidado de todas las plantas.

### Detalle de planta

Abre la vista reutilizable de la planta seleccionada. No existe una página duplicada por fábrica: los mismos componentes cambian según el objeto de datos activo.

### Fuentes de Datos

Muestra el archivo, formato, período, estado y origen de cada fuente. Permite revisar la trazabilidad entre archivo, transformación y KPI.

### Filtro de mes y año

En la vista general controla F&A. En el detalle de una planta importada controla esa planta. Solo se habilitan períodos presentes en su serie y con un corte anterior comparable.

Al cambiar el período se actualizan consumo, producción, intensidad, presupuesto, costo, alertas, gráficas, análisis inteligente e informe.

Ensable y RC mantienen el filtro deshabilitado porque todavía no cuentan con una serie mensual importada.

### Análisis e informe

Abre el análisis de la planta activa. Desde esa ventana se descarga un PDF con la lectura ejecutiva, indicadores, hallazgos, decisiones sugeridas y limitaciones.

## 3. Vista general

### Gasto de Energía General

- **Dato:** suma de `consumo` de las plantas activas.
- **Comparación:** promedio histórico global configurado en el estado del dashboard.
- **Lectura:** una reducción se interpreta como mejora, pero debe revisarse junto con producción para no confundir ahorro con menor actividad.

### Gasto Total de Energía

- **Dato:** suma del costo energético de las plantas.
- **Moneda:** pesos colombianos (COP).
- **Fuente:** `costo_total` cuando viene en el archivo; para las plantas demostrativas se usa una tarifa de referencia de 480 COP/kWh.
- **Comparación:** promedio histórico global.

Los campos `costo_unitario` y `costo_total` de archivos importados se interpretan como COP. Si en el futuro se admiten otras monedas, el archivo deberá incluir un campo explícito de moneda y tasa de conversión.

### Desviación de Presupuesto

```text
desviación % = ((consumo - presupuesto) / presupuesto) × 100
```

- Positivo: consumo sobre presupuesto.
- Negativo: consumo por debajo del presupuesto.
- En F&A, el presupuesto energético se estima como `producción × intensidad_ppto`.

### Estado de Plantas

Cuenta plantas con alertas y plantas en rango. Las alertas de archivos importados se derivan de presupuesto y rangos estadísticos; las plantas base usan estados demostrativos locales.

### Lectura ejecutiva

Resume:

- cuántas plantas mejoran frente al corte anterior;
- cuál presenta el mayor deterioro de consumo;
- cuál es su impacto económico incremental en COP.

### Tarjetas de plantas

Cada tarjeta muestra consumo, cambio mensual, intensidad energética, costo, desviación y estado. Al seleccionarla se abre su detalle.

### Carga masiva de telemetría

Es el cargador heredado para CSV o DAT con columnas de planta, consumo, presupuesto y producción. Actualiza valores básicos de plantas existentes. Para crear una fábrica con historia completa debe usarse **Registrar nueva planta**.

## 4. Detalle de planta

### Total kWh

Consumo del corte activo. Se compara contra el corte anterior de la misma planta.

### Costo de energía

Costo total en COP. Para series importadas usa `costo_total`; la tarifa visible proviene de `costo_unitario`. Para plantas demostrativas se calcula con la tarifa de referencia configurada.

### Consumo unitario o intensidad

```text
intensidad = consumo / unidades producidas
```

Permite comparar eficiencia aunque cambie el volumen de producción. Menor intensidad normalmente significa mejor desempeño energético por unidad.

### Desviación presupuestaria

Compara la intensidad real contra `intensidad_ppto`. Se mantiene separada de la variación mensual porque una planta puede mejorar frente al mes anterior y aun así incumplir el presupuesto.

### Producción

Unidades producidas en el período. Sirve para interpretar si un cambio de consumo proviene de actividad o de eficiencia.

### Estado analítico / SCADA

- En plantas importadas muestra el número de alertas calculadas con rango histórico y presupuesto.
- En plantas base muestra el estado local demostrativo.

No debe interpretarse como una conexión SCADA en tiempo real salvo que posteriormente se integre una fuente industrial real.

### Gráfica de consumo

- Para series importadas: consumo mensual real frente al esperado durante los últimos 24 meses disponibles.
- Para plantas base: curva diaria demostrativa generada localmente.

### Gráfico de control de intensidad

Usa `intensidad`, valor esperado, límites inferior/superior y presupuesto. Ayuda a distinguir una desviación contra presupuesto de una anomalía frente a la propia historia.

### Comparación por proceso

Desglosa consumo e intensidad por proceso. La participación permite identificar dónde iniciar una revisión, pero no demuestra por sí sola la causa del problema.

### Alertas del corte

Muestra señales fuera de rango o sobre presupuesto. Para F&A provienen de `alertas_ultimo_mes` cuando coincide con el corte; para otros meses se derivan de las reglas almacenadas en cada registro.

### Cobertura y calidad

Informa meses disponibles, períodos excluidos, observaciones y parámetros estadísticos. Ayuda a juzgar la confiabilidad de la lectura.

### Velocímetro de demanda

Ubica el consumo entre cero, meta y capacidad máxima. La aguja representa el consumo del corte; la marca de meta representa presupuesto. Es una ayuda visual, no una medición instantánea de potencia.

### Diagnóstico energético

Resume presupuesto, rango estadístico y primera señal relevante. **Ver datos del corte** abre los registros exactos que alimentan los KPI.

### Monitor de gas

Solo aparece en plantas base y actualmente contiene valores demostrativos. Se oculta en plantas importadas porque el JSON mensual no contiene gas.

### Simulación del punto de ajuste térmico

Solo aparece en RC. Es un escenario local: una temperatura de 435 °C o menos simula consumo de 765.000 kWh y tarifa de referencia de 480 COP/kWh. No lee ni escribe PLC, Modbus o SCADA.

## 5. Análisis inteligente

El análisis es automatizado y explicable; no llama a un modelo externo. Usa reglas transparentes sobre:

- cambio de consumo contra el corte anterior;
- cambio de producción e intensidad;
- distancia frente a la meta;
- desviación presupuestaria;
- cambio de costo y tarifa;
- alertas activas;
- proceso de mayor participación;
- posición frente al rango histórico;
- cobertura de la serie.

La prioridad se clasifica como alta, media o controlada. La confianza es alta para tendencias mensuales con al menos 12 registros, media para historias cortas y referencial para snapshots demostrativos.

Las decisiones son sugerencias para validar. Incluyen un indicador de seguimiento y nunca afirman una causa que no esté en los datos.

## 6. Informe PDF

El botón **Descargar informe PDF** genera localmente un documento con:

- planta, período y fuente;
- prioridad y confianza;
- resumen ejecutivo;
- indicadores del corte;
- hallazgos;
- decisiones sugeridas;
- alcance y datos faltantes;
- fecha de generación.

El archivo no se envía a un servidor.

## 7. Registro y eliminación de plantas

Para registrar una fábrica se solicita nombre y archivo. El lector detecta períodos, procesos, consumo, producción, intensidad, presupuesto, costos y rangos. Antes de crear se puede cambiar o quitar el archivo.

Al crearla se generan tarjeta, navegación, filtros, detalle, fuentes y análisis. La serie normalizada se guarda en `localStorage` del navegador.

Al eliminar se genera un código temporal. La eliminación solo se habilita cuando el usuario vuelve a escribir exactamente ese código. El código vence al cerrar el diálogo y no queda almacenado.

## 8. Propuestas de ciencia de datos

Estas son propuestas; no forman parte de la implementación actual.

### Prioridad 1: pronóstico mensual con intervalo de confianza

Predecir consumo, intensidad y costo a tres meses, mostrando escenario esperado, optimista y de riesgo. Puede construirse con la historia mensual actual y aportaría anticipación presupuestaria.

### Prioridad 2: explicación de la desviación por proceso

Crear un waterfall que separe cuánto de la brecha total corresponde a Formación, Acabado u otros procesos, y cuánto se relaciona con volumen de producción. Aporta una ruta de acción más directa.

### Prioridad 3: detección de cambios estructurales

Detectar cambios persistentes de nivel o tendencia, no solo puntos fuera de rango. Ayudaría a reconocer degradación gradual, modificaciones de proceso o una nueva condición operativa.

### Prioridad 4: modelo de impulsores de intensidad

Relacionar intensidad con producción, mezcla de producto, turnos, temperatura ambiente, tiempos ociosos, rechazos y reprocesos. Permitiría pasar de detectar una anomalía a explicar sus factores probables.

### Prioridad 5: demanda máxima y perfil horario

Con datos cada 15 minutos u horarios, analizar picos de kW, factor de carga y simultaneidad entre equipos. Esto permitiría gestionar cargos por demanda y programar cargas flexibles.

### Prioridad 6: optimización tarifaria

Incorporar tarifas por franja, cargos de demanda y contratos. El objetivo sería separar ahorro operativo de ahorro contractual y simular horarios de menor costo.

### Prioridad 7: mantenimiento predictivo energético

Con tags de equipos, vibración, temperatura, corriente y estados de máquina, detectar consumos anómalos que anticipen fallas o ensuciamiento de equipos.

### Prioridad 8: calidad del dato

Crear un puntaje por planta que mida completitud, retraso, valores faltantes, duplicados, saltos y cobertura. Ningún KPI gerencial debería mostrarse sin su nivel de confiabilidad.

### Prioridad 9: energía, calidad y producción

Cruzar consumo con rechazo, scrap, reproceso y OEE. Una reducción energética que empeore la calidad o disponibilidad no debe clasificarse automáticamente como mejora.

## 9. Datos adicionales recomendados

Para aumentar el valor analítico conviene incluir:

- timestamp y zona horaria;
- potencia kW y energía kWh;
- equipo, línea, turno y lote;
- estado operativo y horas de marcha;
- producción buena, rechazo y reproceso;
- tarifa COP/kWh y cargos por demanda;
- temperatura ambiente y variables de proceso;
- eventos de mantenimiento;
- gas, agua, emisiones y factores de conversión;
- moneda explícita en cada fuente.
