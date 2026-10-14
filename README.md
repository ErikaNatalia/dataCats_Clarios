# Clarios SCADA | Consola Industrial de Monitoreo de Energía & Gas

Dashboard industrial automotriz para plantas de baterías **Clarios** (Ensamble & OREC, F&A Formación, y RC Energy & Gas), desarrollado según las especificaciones de diseño y flujos de usuario validados en Figma/Stitch.

---

## 🎨 Sistema de Diseño y Paleta de Colores
- **Fondo Primario:** Carbón obscuro profundo `#121418` con texturas de blueprint técnico.
- **Acentos de Marca Clarios:** Púrpura eléctrico `#7C4DFF` / `#651FFF` con iluminación difusa.
- **Métricas Favorables:** Verde Neón `#00E676` (Dentro de presupuesto / operación óptima).
- **Desviaciones Presupuestarias y Alertas:** Rojo Fuego `#FF3D57` (Sobreconsumo / Critical Trip).
- **Alertas de Precaución:** Ámbar `#FFAB00`.
- **Telemetría y Enlaces de Datos:** Cian `#00E5FF`.

---

## 🚀 Arquitectura y Vistas Implementadas

### 1. Vista 1: Landing / Vista General Multi-Planta
- **Header Global SCADA:** Identidad corporativa Clarios SCADA, fecha de ciclo operativo (2024 Septiembre), selector de vistas, botón de descarga de informe consolidado y sincronización en tiempo real (`SYNC: 12s ago`).
- **KPIs Globales de Cabecera:** 
  - Gasto de Energía General: `2,808,000 kWh` (+2.1% vs mes anterior).
  - Facturación Eléctrica + Gas: `$536,960 USD` (-1.4% dentro de presupuesto).
  - Desviación Consolidada: `+0.3%` (Tolerancia ±2%).
  - Monitoreo de Alertas: `2 alertas` activas en planta RC Energy.
- **Blueprint Técnico de Vehículo Eléctrico (EV Chassis):** 
  - Gráfico vectorial escalable de plataforma skateboard de auto eléctrico.
  - **3 Tarjetas en Forma de Batería Automotriz** con bornes físicos 3D (+ Rojo Cobre, − Plata Cobalto), ranuras de disipación y aletas de sujeción:
    1. *Ensamble & OREC*: 684,000 kWh, ratio 3.42 kWh/u, costo $81,060 USD, desviación -2.1% (Verde Neón), mini curva 24h.
    2. *F&A (Formación)*: 1,260,000 kWh, ratio 6.08 kWh/u, costo $151,200 USD, desviación -3.2% (Verde Neón), mini curva de carga DC.
    3. *RC Energy & Gas*: 864,000 kWh, ratio 4.32 kWh/u, costo $103,680 USD, desviación +8.6% (Rojo Fuego, Alerta Activa / Foco Crítico), pico en fundición.
- **Widget de Carga de Telemetría Masiva:** 
  - Zona interactiva Drag-and-Drop para archivos `.XLSX`, `.CSV` y `.DAT` con validación automática bajo norma **ISO 50001**.
  - Recálculo dinámico e instantáneo de todos los velocímetros y gráficas del dashboard al soltar archivos.
  - Botón de carga rápida de datos de prueba y descarga de plantilla CSV.

---

### 2. Vista 2, 3 y 4: Detalle de Planta (Planta RC Energy & Gas)
- **Barra Lateral Persistente (30% de ancho):**
  - Lista de los 3 módulos de batería con indicador de estado (Activo / Nominal / Sobreconsumo).
  - Acceso directo para alternar entre plantas con un solo clic.
  - Acciones rápidas: *Ajustar Setpoint Quemadores* y *Descargar Logs SCADA (.CSV)*.
- **Área Principal de Contenido (70% de ancho) - Patrón en Z:**
  - **Barra Superior de KPIs:**
    - Total kWh: `864,000` (+10.7% vs 780k ppto).
    - Costo de Energía: `$103,680 USD`.
    - Consumo Unitario: `4.32 kWh/u` (`+8.6% OFF-BUDGET`).
    - Desviación Presupuesto: `+8.6%` (Gasto Excedente).
    - Producción: `200,000` Baterías SLI/AGM (100% cuota).
    - Estado SCADA: `ALERTA CONSUMO ALTO` (54 sensores IoT).
  - **Sección de Gráficas de Proceso:**
    - *Energy Consumption*: Gráfica lineal de series de tiempo de 30 días (Real en Púrpura Clarios vs Meta Máx 38,400 kWh/d).
    - *Consumption by Process Clave*: Gráficas de barras horizontales por proceso (Smelting & Hornos 52%, Formación & Carga 31%, Chilling 17%).
    - *RC Gas Monitor*: Monitoreo de flujo y presión de gas (1.8 Bar High, 9,420 Nm³).
  - **Velocímetro Automotriz de Demanda Eléctrica (Tachometer Gauge):**
    - Cluster análogo/digital renderizado en Canvas de alta resolución.
    - Arco graduado con zonas: Verde Neón (0 a 700k), Ámbar (700k a 780k), Rojo Fuego (780k a 1,000k).
    - Aguja animada con interpolación dinámica y reflejo central.
    - Lectura digital central con **cambio de color automático**: Rojo Fuego si excede presupuesto o Verde Neón si está en rango seguro.
    - Panel lateral de calibración y rango (Promedio meses anteriores, posición de aguja y capacidad máxima contratada).
  - **Tarjeta de Diagnóstico "Check Engine":**
    - Ícono automotriz con luz de advertencia.
    - Reporte de disparo crítico de intensidad térmica.
    - Botones interactivos para confirmar falla (*Acknowledge Fault*) e inspeccionar telemetría (*Inspect SCADA* con tabla Modbus en vivo).
  - **Modal de Ajuste de Setpoint Térmico:**
    - Slider interactivo para reducir la temperatura de quemadores de 470°C a 430°C.
    - Al aplicar el setpoint óptimo, el consumo baja automáticamente por debajo del presupuesto, el velocímetro pasa a **Verde Neón** y la alarma SCADA se desactiva.

---

## 💻 Cómo ejecutar el proyecto

No requiere dependencias externas complejas ni pasos de compilación. Puede ejecutarse directamente:

### Opción 1: Abrir directamente en el navegador
Abre el archivo `index.html` en cualquier navegador web moderno (Chrome, Edge, Firefox, Safari).

### Opción 2: Levantar con servidor web local
```bash
cd /home/usuario/proyectos/dashClarios

# Con Python 3:
python3 -m http.server 8080

# O con npx serve:
npx serve .
```
Luego visita `http://localhost:8080` en tu navegador.

---

## 🔒 Cumplimiento de Seguridad (SecureCoder)
- Manipulación segura del DOM con métodos nativos (`document.createElement`, `textContent`, `setAttribute`).
- Cero uso de `innerHTML` con datos no confiables.
- Validación y sanitización estricta de archivos CSV y hojas de cálculo.
- Aislamiento de ejecución sin dependencias vulnerables en tiempo de ejecución.
