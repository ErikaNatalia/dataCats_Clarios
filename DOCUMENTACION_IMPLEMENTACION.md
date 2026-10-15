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

El formulario solicita:

- Nombre de la planta.
- Código o módulo.
- Nodo SCADA.
- Consumo actual.
- Consumo del corte anterior.
- Presupuesto.
- Capacidad máxima.
- Unidades producidas.
- Número de sensores.
- Enlace opcional al Excel o repositorio de origen.

Al guardar una planta, el sistema:

1. Genera un identificador interno único.
2. Calcula costo, ratio unitario, meta, desviación y condición crítica.
3. Crea procesos y curvas iniciales para la nueva fábrica.
4. Añade una tarjeta en la vista general.
5. Añade la planta al selector lateral y al menú móvil.
6. Abre automáticamente su vista de detalle.
7. Actualiza totales, leyendas y resumen ejecutivo.
8. Guarda la configuración en `localStorage`.

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
- XLSX:
  - Se registra como fuente binaria.
  - Puede descargarse nuevamente.
  - No recalcula KPIs porque el proyecto no contiene todavía un motor de lectura de Excel.
- Los enlaces externos solo aceptan protocolos `http://` y `https://`.

## 3. Reglas de cálculo

### 3.1 Cambio frente al corte anterior

```text
cambio % = ((valor actual - valor anterior) / valor anterior) × 100
```

Para consumo, costo, ratio y alertas, un valor menor se interpreta como mejora.

### 3.2 Desviación presupuestaria

```text
desviación % = ((consumo actual - presupuesto) / presupuesto) × 100
```

- Resultado mayor que cero: exceso.
- Resultado igual o menor que cero: dentro del presupuesto.

### 3.3 Ratio energético

```text
ratio kWh/unidad = consumo actual / unidades producidas
```

### 3.4 Meta del ratio

```text
ratio objetivo = presupuesto / unidades producidas
```

### 3.5 Costo inicial de una planta nueva

```text
costo USD = consumo actual × 0.12
```

La tarifa funciona como valor inicial de referencia y puede sustituirse posteriormente por una tarifa configurable.

## 4. Modelo de persistencia

Las plantas creadas por el usuario se guardan como JSON en:

```text
clarios.customPlants.v1
```

Al volver a abrir el dashboard:

1. Se recuperan las plantas personalizadas.
2. Se regeneran sus tarjetas y accesos de navegación.
3. Se vuelven a registrar sus fuentes externas.
4. Se recalculan los consolidados.

Limitación: los datos son locales al navegador. Para uso multiusuario se necesita una API y una base de datos central.

## 5. Archivos principales modificados

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Nuevas acciones, pestaña de fuentes, vista de trazabilidad y formulario de plantas. |
| `css/styles.css` | Sistema visual, responsive, velocímetro, fuentes, tablas y formularios. |
| `js/app.js` | Estado, cálculos, navegación, persistencia, registro de plantas, carga de archivos y fuentes. |
| `README.md` | Descripción y guía de ejecución actualizadas. |
| `DOCUMENTACION_IMPLEMENTACION.md` | Documento técnico y guía de entrega. |
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

### Historia de usuario 2

> Como usuario del dashboard, quiero conocer el origen de los datos para poder validarlos y auditarlos.

- Existe una vista específica de fuentes.
- Se muestran archivos base reales.
- Se pueden previsualizar y descargar.
- Las nuevas cargas se registran automáticamente.
- Una planta puede conservar el vínculo a su Excel o repositorio.
- Se muestra el flujo desde el origen hasta el KPI.

## 10. Limitaciones conocidas y siguientes pasos

- Añadir lectura real de XLSX con una biblioteca especializada.
- Sustituir `localStorage` por persistencia central para trabajo multiusuario.
- Conectar fuentes SCADA o APIs reales.
- Incorporar autenticación y permisos por rol.
- Convertir la descarga simulada del informe consolidado en un PDF real.
- Permitir editar o eliminar plantas personalizadas con auditoría.
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
git add README.md DOCUMENTACION_IMPLEMENTACION.md index.html css/styles.css js/app.js dist
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
