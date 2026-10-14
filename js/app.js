/**
 * CLARIOS SCADA INDUSTRIAL AUTOMOTIVE DASHBOARD
 * Core Engine & Interactive State Management
 * 
 * Strict compliance with SecureCoder principles:
 * - Framework-native safe DOM creation (createElement, textContent, setAttribute)
 * - Zero innerHTML injection with untrusted input
 * - Safe numeric parsing and sanitization
 */

(function () {
  'use strict';

  // --- DASHBOARD DATA STORE ---
  const DashboardStore = {
    currentView: 'landing', // 'landing' | 'detail'
    currentPlantId: 'rc_energy', // 'ensamble' | 'fa' | 'rc_energy'
    faultAcknowledged: false,

    // Global Aggregate Metrics
    global: {
      totalEnergyKwh: 2808000,
      energyCostUsd: 536960,
      budgetDeviationPct: 0.3,
      alertCount: 2,
      lastSyncSeconds: 12
    },

    // Detailed Plant Datasets
    plants: {
      ensamble: {
        id: 'ensamble',
        number: '1',
        name: 'Ensamble & OREC',
        fullName: 'Planta Ensamble & Ensacado OREC',
        tag: 'MOD-01-AS',
        status: 'normal',
        statusLabel: 'Planta Activa',
        isCritical: false,
        kwh: 684000,
        budgetKwh: 700000,
        maxCapacityKwh: 850000,
        costUsd: 81060,
        ratioKwhUnit: 3.42,
        ratioTarget: 3.50,
        deviationPct: -2.1,
        productionUnits: 200000,
        productionType: 'Baterías SLI / EFB',
        sensorsCount: 42,
        nodeUri: 'NODE-MTY-AS-01',
        alertSnippet: 'Operación dentro de límites ISO 50001 nominales',
        sparklinePoints: [22, 24, 21, 23, 20, 22, 21, 23, 22, 20, 19, 21],
        processes: [
          { name: '1. Líneas Ensamble & Robótica', kwh: 342000, pct: 50, color: 'purple' },
          { name: '2. Ensacado & OREC Filtrado', kwh: 205200, pct: 30, color: 'purple-light' },
          { name: '3. Test Eléctrico & Empaque', kwh: 136800, pct: 20, color: 'purple-dark' }
        ],
        processAlert: null,
        gas: {
          flowHigh: '0.4 Bar Nom',
          flowTot: '1,820 Nm³ tot',
          trend: [10, 12, 11, 13, 12, 10, 11]
        },
        dailyData: generateDailyCurve(684000 / 30, 0.08, false)
      },

      fa: {
        id: 'fa',
        number: '2',
        name: 'F&A (Formación)',
        fullName: 'Planta Formación & Acabado Celular',
        tag: 'MOD-02-FA',
        status: 'normal',
        statusLabel: 'Planta Activa',
        isCritical: false,
        kwh: 1260000,
        budgetKwh: 1300000,
        maxCapacityKwh: 1500000,
        costUsd: 151200,
        ratioKwhUnit: 6.08,
        ratioTarget: 6.25,
        deviationPct: -3.2,
        productionUnits: 207200,
        productionType: 'Celdas Formadas',
        sensorsCount: 48,
        nodeUri: 'NODE-MTY-FA-02',
        alertSnippet: 'Formación celular en baño ácido sin anomalías térmicas',
        sparklinePoints: [38, 40, 42, 41, 39, 40, 41, 40, 39, 38, 40, 39],
        processes: [
          { name: '1. Rectificadores Formación DC', kwh: 882000, pct: 70, color: 'purple' },
          { name: '2. Bombeo & Circulación Ácido', kwh: 252000, pct: 20, color: 'purple-light' },
          { name: '3. Extracción de Vapores & Scrubber', kwh: 126000, pct: 10, color: 'purple-dark' }
        ],
        processAlert: null,
        gas: {
          flowHigh: '0.7 Bar Nom',
          flowTot: '3,140 Nm³ tot',
          trend: [15, 16, 17, 16, 15, 14, 16]
        },
        dailyData: generateDailyCurve(1260000 / 30, 0.06, false)
      },

      rc_energy: {
        id: 'rc_energy',
        number: '3',
        name: 'RC Energy & Gas',
        fullName: 'Planta RC Energy & Gas Ops',
        tag: 'MOD-03-RC',
        status: 'critical',
        statusLabel: 'Alerta Activa',
        isCritical: true,
        kwh: 864000,
        budgetKwh: 780000,
        maxCapacityKwh: 950000,
        costUsd: 103680,
        ratioKwhUnit: 4.32,
        ratioTarget: 3.98,
        deviationPct: 8.6,
        productionUnits: 200000,
        productionType: 'Baterías SLI / AGM',
        sensorsCount: 54,
        nodeUri: 'NODE-MTY-RC-01',
        alertSnippet: 'Bornes de fundición superan rampa térmica (+14.2% sobre setpoint)',
        sparklinePoints: [25, 27, 26, 30, 28, 32, 38, 42, 45, 41, 39, 44],
        processes: [
          { name: '1. Smelting & Hornos de Fundición', kwh: 449280, pct: 52, color: 'purple' },
          { name: '2. Formación & Carga Inicial', kwh: 267840, pct: 31, color: 'purple-light' },
          { name: '3. Chilling / Auxiliares Industriales', kwh: 146880, pct: 17, color: 'purple-dark' }
        ],
        processAlert: 'Hornos Smelting: +14.2% sobre setpoint estándar de gas y potencia',
        gas: {
          flowHigh: '1.8 Bar High',
          flowTot: '9,420 Nm³ tot',
          trend: [20, 24, 22, 35, 48, 42, 50]
        },
        dailyData: generateDailyCurve(864000 / 30, 0.15, true)
      }
    }
  };

  /** Helper to generate 30 days of telemetry data with a configurable spike */
  function generateDailyCurve(baseAvg, variance, hasSpike) {
    const data = [];
    for (let day = 1; day <= 30; day++) {
      let val = baseAvg * (1 + (Math.sin(day * 0.8) * variance) + ((Math.random() - 0.5) * 0.05));
      if (hasSpike && day >= 17 && day <= 20) {
        val = baseAvg * 1.38; // Spike detected around day 18
      }
      data.push({ day, kwh: Math.round(val) });
    }
    return data;
  }

  // --- INITIALIZATION ---
  document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initTachometer();
    initCharts();
    initFileUpload();
    initModals();
    renderAllViews();
    startLiveHeartbeat();
  });

  // --- NAVIGATION CONTROLLER ---
  function initNavigation() {
    const tabLanding = document.getElementById('tab-landing');
    const tabDetail = document.getElementById('tab-detail');
    const btnBack = document.getElementById('btn-back-to-landing');

    if (tabLanding) {
      tabLanding.addEventListener('click', () => switchView('landing'));
    }
    if (tabDetail) {
      tabDetail.addEventListener('click', () => switchView('detail'));
    }
    if (btnBack) {
      btnBack.addEventListener('click', () => switchView('landing'));
    }

    // Attach click listeners to battery cards on Landing page
    document.querySelectorAll('.car-battery-card').forEach(card => {
      card.addEventListener('click', () => {
        const plantId = card.getAttribute('data-plant-id');
        if (plantId && DashboardStore.plants[plantId]) {
          DashboardStore.currentPlantId = plantId;
          switchView('detail');
        }
      });
    });

    // Attach click listeners to sidebar cards
    document.querySelectorAll('.sidebar-battery-card').forEach(card => {
      card.addEventListener('click', () => {
        const plantId = card.getAttribute('data-plant-id');
        if (plantId && DashboardStore.plants[plantId]) {
          DashboardStore.currentPlantId = plantId;
          updatePlantDetailView();
        }
      });
    });

    // Quick report download button simulation
    const btnQuickReport = document.getElementById('btn-quick-report');
    if (btnQuickReport) {
      btnQuickReport.addEventListener('click', exportSCADAReport);
    }

    // Sidebar CSV download button
    const btnDownloadCsv = document.getElementById('btn-download-scada-csv');
    if (btnDownloadCsv) {
      btnDownloadCsv.addEventListener('click', exportPlantCSV);
    }
  }

  function switchView(viewName) {
    DashboardStore.currentView = viewName;
    const landingView = document.getElementById('view-landing');
    const detailView = document.getElementById('view-detail');
    const tabLanding = document.getElementById('tab-landing');
    const tabDetail = document.getElementById('tab-detail');

    if (viewName === 'landing') {
      landingView.classList.add('active-view');
      detailView.classList.remove('active-view');
      tabLanding.classList.add('active');
      tabDetail.classList.remove('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      landingView.classList.remove('active-view');
      detailView.classList.add('active-view');
      tabLanding.classList.remove('active');
      tabDetail.classList.add('active');
      updatePlantDetailView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // --- RENDER VIEWS ---
  function renderAllViews() {
    renderLandingMetrics();
    renderLandingBatteryCards();
    updatePlantDetailView();
  }

  function renderLandingMetrics() {
    const g = DashboardStore.global;
    setElementText('landing-global-kwh', formatNumber(g.totalEnergyKwh) + ' kWh');
    setElementText('landing-global-cost', '$' + formatNumber(g.energyCostUsd) + ' USD');
    setElementText('landing-global-deviation', (g.budgetDeviationPct > 0 ? '+' : '') + g.budgetDeviationPct.toFixed(1) + '%');
    setElementText('landing-global-alerts', g.alertCount + ' alertas');
  }

  function renderLandingBatteryCards() {
    Object.keys(DashboardStore.plants).forEach(plantId => {
      const p = DashboardStore.plants[plantId];
      const card = document.querySelector(`.car-battery-card[data-plant-id="${plantId}"]`);
      if (!card) return;

      const kwhEl = card.querySelector('.battery-metric-kwh');
      if (kwhEl) kwhEl.textContent = formatNumber(p.kwh) + ' kWh';

      const ratioEl = card.querySelector('.submetric-ratio');
      if (ratioEl) ratioEl.textContent = p.ratioKwhUnit.toFixed(2) + ' kWh/u';

      const costEl = card.querySelector('.submetric-cost');
      if (costEl) costEl.textContent = '$' + formatNumber(p.costUsd);

      const devEl = card.querySelector('.submetric-dev');
      if (devEl) {
        devEl.textContent = (p.deviationPct > 0 ? '+' : '') + p.deviationPct.toFixed(1) + '% ' + (p.deviationPct > 0 ? 'Exceso' : 'A favor');
        devEl.className = 'submetric-val submetric-dev ' + (p.deviationPct > 0 ? 'red' : 'green');
      }

      // Draw SVG mini sparkline
      renderMiniSparkline(card.querySelector('.sparkline-svg'), p.sparklinePoints, p.isCritical ? '#FF3D57' : (plantId === 'fa' ? '#7C4DFF' : '#00E676'));
    });
  }

  function renderMiniSparkline(svgEl, points, strokeColor) {
    if (!svgEl) return;
    svgEl.replaceChildren();

    const width = 280;
    const height = 36;
    const minVal = Math.min(...points) * 0.9;
    const maxVal = Math.max(...points) * 1.1;
    const stepX = width / (points.length - 1);

    const coords = points.map((p, idx) => {
      const x = idx * stepX;
      const y = height - ((p - minVal) / (maxVal - minVal)) * (height - 8) - 4;
      return { x, y };
    });

    let d = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cx1 = prev.x + (curr.x - prev.x) / 2;
      const cy1 = prev.y;
      const cx2 = prev.x + (curr.x - prev.x) / 2;
      const cy2 = curr.y;
      d += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${curr.x} ${curr.y}`;
    }

    // Path element
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', strokeColor);
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svgEl.appendChild(path);

    // Glowing last circle point
    const lastCoord = coords[coords.length - 1];
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(lastCoord.x));
    circle.setAttribute('cy', String(lastCoord.y));
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', strokeColor);
    circle.setAttribute('filter', 'drop-shadow(0px 0px 4px ' + strokeColor + ')');
    svgEl.appendChild(circle);
  }

  // --- PLANT DETAIL VIEW CONTROLLER ---
  function updatePlantDetailView() {
    const currentPlant = DashboardStore.plants[DashboardStore.currentPlantId];
    if (!currentPlant) return;

    // 1. Update Sidebar Active state
    document.querySelectorAll('.sidebar-battery-card').forEach(card => {
      const pid = card.getAttribute('data-plant-id');
      if (pid === currentPlant.id) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // 2. Breadcrumb and title
    setElementText('detail-current-plant-name', currentPlant.name);
    setElementText('detail-breadcrumb-plant', currentPlant.name);
    setElementText('detail-node-id', currentPlant.nodeUri);

    // Status alert badge in header
    const statusPill = document.getElementById('detail-header-status-pill');
    if (statusPill) {
      statusPill.replaceChildren();
      const dot = document.createElement('span');
      dot.className = 'pulse-dot';
      const text = document.createElement('span');

      if (currentPlant.isCritical && !DashboardStore.faultAcknowledged) {
        statusPill.className = 'status-badge-live danger';
        text.textContent = '▲ PLANTA EN SOBRECONSUMO';
      } else {
        statusPill.className = 'status-badge-live normal';
        text.textContent = '● PLANTA EN OPERACIÓN NOMINAL';
      }
      statusPill.appendChild(dot);
      statusPill.appendChild(text);
    }

    // 3. High-level KPI Summary Cards (Detail)
    setElementText('detail-kpi-total-kwh', formatNumber(currentPlant.kwh));
    setElementText('detail-kpi-kwh-sub', (currentPlant.deviationPct > 0 ? '+' : '') + currentPlant.deviationPct.toFixed(1) + '% vs ' + formatNumber(Math.round(currentPlant.budgetKwh / 1000)) + 'k ppto');

    setElementText('detail-kpi-cost', '$' + formatNumber(currentPlant.costUsd) + ' USD');
    setElementText('detail-kpi-unit-ratio', currentPlant.ratioKwhUnit.toFixed(2) + ' kWh/u');
    setElementText('detail-kpi-unit-target', 'Neto: ' + currentPlant.ratioTarget.toFixed(2) + ' kWh/u');

    const badgeRatio = document.getElementById('detail-kpi-badge-ratio');
    if (badgeRatio) {
      if (currentPlant.deviationPct > 0) {
        badgeRatio.className = 'detail-kpi-badge badge-danger';
        badgeRatio.textContent = '+' + currentPlant.deviationPct.toFixed(1) + '% OFF-BUDGET';
      } else {
        badgeRatio.className = 'detail-kpi-badge badge-success';
        badgeRatio.textContent = currentPlant.deviationPct.toFixed(1) + '% ON-BUDGET';
      }
    }

    const devEl = document.getElementById('detail-kpi-deviation');
    if (devEl) {
      devEl.textContent = (currentPlant.deviationPct > 0 ? '+' : '') + currentPlant.deviationPct.toFixed(1) + '%';
      devEl.className = 'detail-kpi-val ' + (currentPlant.deviationPct > 0 ? 'red' : 'green');
    }
    setElementText('detail-kpi-dev-sub', currentPlant.deviationPct > 0 ? 'Gasto Excedente' : 'Dentro de Presupuesto');

    setElementText('detail-kpi-prod-qty', formatNumber(currentPlant.productionUnits));
    setElementText('detail-kpi-prod-sub', currentPlant.productionType + ' (100% cuota)');

    const scadaStatusEl = document.getElementById('detail-kpi-scada-status');
    if (scadaStatusEl) {
      scadaStatusEl.textContent = currentPlant.isCritical && !DashboardStore.faultAcknowledged ? 'ALERTA CONSUMO ALTO' : 'OPERACIÓN NORMAL';
      scadaStatusEl.className = 'detail-kpi-val ' + (currentPlant.isCritical && !DashboardStore.faultAcknowledged ? 'red' : 'green');
    }
    setElementText('detail-kpi-scada-sensors', currentPlant.sensorsCount + ' Sensores IoT');

    // 4. Update Automotive Tachometer
    updateTachometer(currentPlant.kwh, currentPlant.budgetKwh, currentPlant.maxCapacityKwh);

    // 5. Update Charts
    renderLineChart(currentPlant.dailyData, currentPlant.budgetKwh / 30);
    renderProcessBars(currentPlant.processes, currentPlant.processAlert);
    renderGasMonitor(currentPlant.gas);

    // 6. Diagnostic Alert Card
    updateDiagnosticCard(currentPlant);
  }

  // --- AUTOMOTIVE TACHOMETER (VELOCÍMETRO DE DEMANDA ELÉCTRICA) ---
  let tachometerCanvas, tachometerCtx;
  let currentAnimatedKwh = 0;
  let targetKwh = 864000;
  let currentBudgetKwh = 780000;
  let currentMaxCapacity = 950000;
  let animFrameId = null;

  function initTachometer() {
    tachometerCanvas = document.getElementById('tachometer-canvas');
    if (!tachometerCanvas) return;
    tachometerCtx = tachometerCanvas.getContext('2d');

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = tachometerCanvas.getBoundingClientRect();
    tachometerCanvas.width = rect.width * dpr;
    tachometerCanvas.height = rect.height * dpr;
    tachometerCtx.scale(dpr, dpr);
  }

  function updateTachometer(newKwh, budgetKwh, maxKwh) {
    targetKwh = newKwh;
    currentBudgetKwh = budgetKwh;
    currentMaxCapacity = maxKwh;

    // Update textual panel
    setElementText('cal-promedio-val', formatNumber(budgetKwh) + ' kWh');
    setElementText('cal-capacidad-val', formatNumber(maxKwh) + ' kWh');

    const exceso = newKwh - budgetKwh;
    const posValEl = document.getElementById('cal-posicion-val');
    const posSubEl = document.getElementById('cal-posicion-sub');
    if (posValEl) posValEl.textContent = formatNumber(newKwh) + ' kWh';
    if (posSubEl) {
      if (exceso > 0) {
        posSubEl.textContent = 'Zona de Sobreconsumo: +' + formatNumber(exceso) + ' kWh Exceso';
        posSubEl.className = 'cal-sub red';
      } else {
        posSubEl.textContent = 'Margen de Seguridad: ' + formatNumber(Math.abs(exceso)) + ' kWh Restante';
        posSubEl.className = 'cal-sub green';
      }
    }

    const dialStatus = document.getElementById('cal-dial-status');
    if (dialStatus) {
      dialStatus.textContent = exceso > 0 ? 'DEFLEXIÓN ANÓMALA DETECTADA' : 'OPERACIÓN BALANCEADA';
      dialStatus.className = exceso > 0 ? 'active' : '';
    }

    // Start needle animation loop
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animateTachometer();
  }

  function animateTachometer() {
    const diff = targetKwh - currentAnimatedKwh;
    if (Math.abs(diff) < 500) {
      currentAnimatedKwh = targetKwh;
    } else {
      currentAnimatedKwh += diff * 0.12;
      animFrameId = requestAnimationFrame(animateTachometer);
    }

    drawTachometerFrame(currentAnimatedKwh, currentBudgetKwh, currentMaxCapacity);
  }

  function drawTachometerFrame(kwh, budget, maxKwh) {
    if (!tachometerCtx || !tachometerCanvas) return;
    const ctx = tachometerCtx;
    const dpr = window.devicePixelRatio || 1;
    const width = tachometerCanvas.width / dpr;
    const height = tachometerCanvas.height / dpr;

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height - 12;
    const radius = 95;

    // Angle span: from -140 deg to -40 deg (or 130 to 410 in standard radian coordinates)
    const startAngle = Math.PI * 0.85; // ~153 deg
    const endAngle = Math.PI * 2.15;   // ~387 deg
    const totalAngle = endAngle - startAngle;

    // Ratio of budget threshold and danger zone
    const budgetPct = budget / maxKwh; // e.g. 780k / 950k = 0.82
    const currentPct = Math.min(Math.max(kwh / maxKwh, 0), 1.05);

    // 1. Background Track Arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineCap = 'round';
    ctx.stroke();

    // 2. Green Safe Arc (0% to ~70%)
    const safeAngle = startAngle + totalAngle * 0.70;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, safeAngle);
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#00E676';
    ctx.lineCap = 'butt';
    ctx.stroke();

    // 3. Amber Caution Arc (70% to budget threshold)
    const warnAngle = startAngle + totalAngle * budgetPct;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, safeAngle, warnAngle);
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#FFAB00';
    ctx.lineCap = 'butt';
    ctx.stroke();

    // 4. Fire Red Critical Over-budget Arc (budget to max)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, warnAngle, endAngle);
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#FF3D57';
    ctx.lineCap = 'round';
    ctx.stroke();

    // 5. Radial Tick Marks
    const numTicks = 10;
    for (let i = 0; i <= numTicks; i++) {
      const tickAngle = startAngle + (totalAngle * (i / numTicks));
      const tickLen = (i % 2 === 0) ? 8 : 4;
      const x1 = centerX + Math.cos(tickAngle) * (radius - 12);
      const y1 = centerY + Math.sin(tickAngle) * (radius - 12);
      const x2 = centerX + Math.cos(tickAngle) * (radius - 12 - tickLen);
      const y2 = centerY + Math.sin(tickAngle) * (radius - 12 - tickLen);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = (i % 2 === 0) ? 2 : 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.stroke();
    }

    // 6. Animated Needle
    const needleAngle = startAngle + (totalAngle * Math.min(currentPct, 1.0));
    const needleLength = radius - 10;

    ctx.save();
    ctx.shadowColor = kwh > budget ? 'rgba(255, 61, 87, 0.6)' : 'rgba(0, 230, 118, 0.5)';
    ctx.shadowBlur = 10;

    // Needle shape
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    const needleTipX = centerX + Math.cos(needleAngle) * needleLength;
    const needleTipY = centerY + Math.sin(needleAngle) * needleLength;
    ctx.lineTo(needleTipX, needleTipY);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = kwh > budget ? '#FF3D57' : '#00E676';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // Needle Pivot Hub
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#222732';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#7C4DFF';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // 7. Update Digital readout below gauge
    const digitalReadout = document.getElementById('gauge-digital-value');
    const gaugeAlertPill = document.getElementById('gauge-alert-pill');

    if (digitalReadout) {
      digitalReadout.textContent = formatNumber(Math.round(kwh));
      if (kwh > budget) {
        digitalReadout.className = 'gauge-digital-kwh over-budget';
      } else {
        digitalReadout.className = 'gauge-digital-kwh under-budget';
      }
    }

    if (gaugeAlertPill) {
      const pctOver = (((kwh - budget) / budget) * 100).toFixed(1);
      if (kwh > budget) {
        gaugeAlertPill.className = 'gauge-alert-pill danger';
        gaugeAlertPill.textContent = `Límite superado (+${pctOver}% sobre ppto de ${formatNumber(budget)} kWh)`;
      } else {
        gaugeAlertPill.className = 'gauge-alert-pill normal';
        gaugeAlertPill.textContent = `Consumo seguro (${Math.abs(pctOver)}% bajo ppto)`;
      }
    }
  }

  // --- INTERACTIVE CHARTS ---

  // 1. Time Series Line Chart (Real vs Budget)
  function renderLineChart(dailyData, dailyBudgetKwh) {
    const svg = document.getElementById('line-chart-svg');
    if (!svg) return;
    svg.replaceChildren();

    const width = 500;
    const height = 180;
    const padding = { top: 20, right: 20, bottom: 25, left: 45 };

    const maxKwh = Math.max(...dailyData.map(d => d.kwh), dailyBudgetKwh * 1.3);
    const minKwh = Math.min(...dailyData.map(d => d.kwh)) * 0.7;

    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const getX = (idx) => padding.left + (idx / (dailyData.length - 1)) * chartW;
    const getY = (val) => padding.top + chartH - ((val - minKwh) / (maxKwh - minKwh)) * chartH;

    // SVG Definitions (Gradients & Glow)
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="purpleAreaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7C4DFF" stop-opacity="0.38"/>
        <stop offset="100%" stop-color="#7C4DFF" stop-opacity="0.0"/>
      </linearGradient>
      <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    `;
    svg.appendChild(defs);

    // Grid lines (3 horizontal lines)
    for (let i = 0; i <= 3; i++) {
      const gridY = padding.top + (chartH / 3) * i;
      const valLabel = Math.round(maxKwh - ((maxKwh - minKwh) / 3) * i);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(padding.left));
      line.setAttribute('y1', String(gridY));
      line.setAttribute('x2', String(width - padding.right));
      line.setAttribute('y2', String(gridY));
      line.setAttribute('stroke', 'rgba(255, 255, 255, 0.05)');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(padding.left - 6));
      text.setAttribute('y', String(gridY + 3));
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('fill', '#6C7689');
      text.setAttribute('font-size', '9');
      text.setAttribute('font-family', 'var(--font-mono)');
      text.textContent = (valLabel / 1000).toFixed(0) + 'k';
      svg.appendChild(text);
    }

    // Budget Target Threshold Line (Dashed)
    const budgetY = getY(dailyBudgetKwh);
    const budgetLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    budgetLine.setAttribute('x1', String(padding.left));
    budgetLine.setAttribute('y1', String(budgetY));
    budgetLine.setAttribute('x2', String(width - padding.right));
    budgetLine.setAttribute('y2', String(budgetY));
    budgetLine.setAttribute('stroke', '#FFAB00');
    budgetLine.setAttribute('stroke-width', '1.5');
    budgetLine.setAttribute('stroke-dasharray', '4 4');
    svg.appendChild(budgetLine);

    // Build Curve Path
    let pathD = `M ${getX(0)} ${getY(dailyData[0].kwh)}`;
    let areaD = `M ${getX(0)} ${getY(dailyData[0].kwh)}`;

    for (let i = 1; i < dailyData.length; i++) {
      const prevX = getX(i - 1);
      const prevY = getY(dailyData[i - 1].kwh);
      const currX = getX(i);
      const currY = getY(dailyData[i].kwh);
      const midX = (prevX + currX) / 2;

      pathD += ` C ${midX} ${prevY}, ${midX} ${currY}, ${currX} ${currY}`;
      areaD += ` C ${midX} ${prevY}, ${midX} ${currY}, ${currX} ${currY}`;
    }

    // Complete Area Polygon
    areaD += ` L ${getX(dailyData.length - 1)} ${padding.top + chartH} L ${getX(0)} ${padding.top + chartH} Z`;

    const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    areaPath.setAttribute('d', areaD);
    areaPath.setAttribute('fill', 'url(#purpleAreaGrad)');
    svg.appendChild(areaPath);

    const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    linePath.setAttribute('d', pathD);
    linePath.setAttribute('fill', 'none');
    linePath.setAttribute('stroke', '#7C4DFF');
    linePath.setAttribute('stroke-width', '2.5');
    linePath.setAttribute('filter', 'url(#lineGlow)');
    svg.appendChild(linePath);

    // X-Axis Day labels (Day 1, 10, 20, 30)
    [0, 9, 19, 29].forEach(idx => {
      if (dailyData[idx]) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(getX(idx)));
        text.setAttribute('y', String(height - 6));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', '#6C7689');
        text.setAttribute('font-size', '9');
        text.textContent = 'Día ' + dailyData[idx].day;
        svg.appendChild(text);
      }
    });
  }

  // 2. Process Breakdown Horizontal Bar Charts
  function renderProcessBars(processes, alertText) {
    const container = document.getElementById('process-bars-container');
    if (!container) return;
    container.replaceChildren();

    processes.forEach(proc => {
      const item = document.createElement('div');
      item.className = 'process-item';

      const header = document.createElement('div');
      header.className = 'process-item-header';

      const name = document.createElement('span');
      name.className = 'process-name';
      name.textContent = proc.name;

      const stats = document.createElement('span');
      stats.className = 'process-stats';
      stats.textContent = `${formatNumber(proc.kwh)} kWh (${proc.pct}%)`;

      header.appendChild(name);
      header.appendChild(stats);

      const track = document.createElement('div');
      track.className = 'process-bar-track';

      const fill = document.createElement('div');
      fill.className = `process-bar-fill ${proc.color}`;
      fill.style.width = '0%';
      setTimeout(() => { fill.style.width = proc.pct + '%'; }, 60);

      track.appendChild(fill);
      item.appendChild(header);
      item.appendChild(track);
      container.appendChild(item);
    });

    if (alertText) {
      const alertBox = document.createElement('div');
      alertBox.className = 'process-alert-note';
      alertBox.textContent = '▲ ' + alertText;
      container.appendChild(alertBox);
    }
  }

  // 3. RC Gas Monitor Chart
  function renderGasMonitor(gasData) {
    setElementText('gas-flow-high', gasData.flowHigh);
    setElementText('gas-flow-tot', gasData.flowTot);

    const svg = document.getElementById('gas-chart-svg');
    if (!svg) return;
    svg.replaceChildren();

    const width = 240;
    const height = 90;
    const trend = gasData.trend || [10, 15, 20, 18, 30, 25, 32];
    const max = Math.max(...trend) * 1.2;
    const min = Math.min(...trend) * 0.8;
    const stepX = width / (trend.length - 1);

    let d = `M 0 ${height - ((trend[0] - min) / (max - min)) * height}`;
    for (let i = 1; i < trend.length; i++) {
      const x = i * stepX;
      const y = height - ((trend[i] - min) / (max - min)) * height;
      d += ` L ${x} ${y}`;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#FFAB00');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
  }

  // 4. Diagnostic Card Update
  function updateDiagnosticCard(plant) {
    const card = document.getElementById('diagnostic-card');
    const badge = document.getElementById('diag-trip-badge');
    const desc = document.getElementById('diag-body-text');
    const btnAck = document.getElementById('btn-diag-ack');

    if (!card) return;

    if (plant.isCritical && !DashboardStore.faultAcknowledged) {
      card.classList.remove('resolved');
      if (badge) badge.textContent = 'CRITICAL TRIP ADVISORY';
      if (desc) desc.textContent = `Energy intensity exceeds budget by ${plant.deviationPct.toFixed(1)}% (Actual: ${plant.ratioKwhUnit.toFixed(2)} kWh/u vs Target: ${plant.ratioTarget.toFixed(2)} kWh/u). Gas intensity spike detected in Smelting Furnaces battery lead-melting line. Telemetry source: Modbus TCP Gateway #${plant.nodeUri}.`;
      if (btnAck) {
        btnAck.textContent = 'Acknowledge Fault';
        btnAck.classList.remove('acked');
      }
    } else {
      card.classList.add('resolved');
      if (badge) badge.textContent = 'DIAGNOSTIC STATUS: NOMINAL';
      if (desc) desc.textContent = `All thermal curves and power distribution parameters for ${plant.name} are calibrated within standard operational range (ISO 50001 compliant).`;
      if (btnAck) {
        btnAck.textContent = '✓ Fault Acknowledged';
        btnAck.classList.add('acked');
      }
    }
  }

  // --- MASS TELEMETRY FILE UPLOAD HANDLER ---
  function initFileUpload() {
    const dropzone = document.getElementById('telemetry-dropzone');
    const fileInput = document.getElementById('file-upload-input');
    const btnLoadDemo = document.getElementById('btn-load-demo-data');
    const btnDownloadTemplate = document.getElementById('btn-download-template');

    if (!dropzone || !fileInput) return;

    // Click to select
    dropzone.addEventListener('click', () => fileInput.click());

    // Drag and drop events
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        processUploadedFile(files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        processUploadedFile(e.target.files[0]);
      }
    });

    if (btnLoadDemo) {
      btnLoadDemo.addEventListener('click', (e) => {
        e.stopPropagation();
        loadDemoDataset();
      });
    }

    if (btnDownloadTemplate) {
      btnDownloadTemplate.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadExcelTemplate();
      });
    }
  }

  function processUploadedFile(file) {
    const fileName = file.name.toLowerCase();
    showToast(`Procesando archivo: ${file.name}...`, 'normal');

    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx') && !fileName.endsWith('.dat')) {
      showToast('Formato no admitido. Utilice archivos .CSV o .XLSX', 'danger');
      return;
    }

    // Read and parse file content securely
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const textContent = e.target.result;
        parseTelemetryCSV(textContent);
      } catch (err) {
        showToast('Error al parsear el archivo de telemetría.', 'danger');
      }
    };
    reader.readAsText(file);
  }

  function parseTelemetryCSV(rawText) {
    const lines = rawText.trim().split('\n');
    if (lines.length < 2) {
      showToast('El archivo no contiene suficientes registros.', 'danger');
      return;
    }

    // Securely parse values without regex injection or unsafe eval
    let recordsUpdated = 0;
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      if (row.length >= 3) {
        const plantKey = row[0].trim().toLowerCase();
        const kwh = parseFloat(row[1]);
        const budget = parseFloat(row[2]);

        if (DashboardStore.plants[plantKey] && !isNaN(kwh) && !isNaN(budget)) {
          const plant = DashboardStore.plants[plantKey];
          plant.kwh = Math.round(kwh);
          plant.budgetKwh = Math.round(budget);
          plant.deviationPct = parseFloat((((kwh - budget) / budget) * 100).toFixed(1));
          plant.costUsd = Math.round(kwh * 0.120);
          plant.isCritical = plant.deviationPct > 0;
          recordsUpdated++;
        }
      }
    }

    // Recalculate totals
    let totalKwh = 0;
    let totalCost = 0;
    let alerts = 0;
    Object.values(DashboardStore.plants).forEach(p => {
      totalKwh += p.kwh;
      totalCost += p.costUsd;
      if (p.isCritical) alerts++;
    });

    DashboardStore.global.totalEnergyKwh = totalKwh;
    DashboardStore.global.energyCostUsd = totalCost;
    DashboardStore.global.alertCount = alerts;

    renderAllViews();
    showToast(`✓ Datos sincronizados con éxito. (${recordsUpdated} plantas actualizadas - ISO 50001 verificado)`, 'success');
  }

  function loadDemoDataset() {
    const demoCSV = `Planta,Consumo_kWh,Presupuesto_kWh,Unidades
ensamble,690000,700000,200000
fa,1240000,1300000,205000
rc_energy,812000,780000,200000`;
    parseTelemetryCSV(demoCSV);
  }

  function downloadExcelTemplate() {
    const templateContent = `Planta,Consumo_kWh,Presupuesto_kWh,Unidades,Notas
ensamble,684000,700000,200000,Operacion Nom
fa,1260000,1300000,207200,Operacion Nom
rc_energy,864000,780000,200000,Sobreconsumo Termico
`;
    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Clarios_Telemetry_Template_ISO50001.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Plantilla descargada con éxito', 'success');
  }

  // --- MODALS & INTERACTIVE ACTIONS ---
  function initModals() {
    // 1. Burner Setpoint Modal
    const btnOpenSetpoint = document.getElementById('btn-open-setpoint-modal');
    const modalSetpoint = document.getElementById('modal-setpoint');
    const btnCloseSetpoint = document.getElementById('btn-close-setpoint');
    const btnCancelSetpoint = document.getElementById('btn-cancel-setpoint');
    const btnApplySetpoint = document.getElementById('btn-apply-setpoint');
    const sliderBurner = document.getElementById('slider-burner-temp');
    const sliderValDisplay = document.getElementById('slider-val-display');

    if (btnOpenSetpoint && modalSetpoint) {
      btnOpenSetpoint.addEventListener('click', () => {
        modalSetpoint.classList.add('open');
      });
    }

    [btnCloseSetpoint, btnCancelSetpoint].forEach(btn => {
      if (btn) btn.addEventListener('click', () => modalSetpoint.classList.remove('open'));
    });

    if (sliderBurner && sliderValDisplay) {
      sliderBurner.addEventListener('input', (e) => {
        sliderValDisplay.textContent = e.target.value + ' °C';
      });
    }

    if (btnApplySetpoint && sliderBurner) {
      btnApplySetpoint.addEventListener('click', () => {
        const temp = parseInt(sliderBurner.value, 10);
        // If reduced to 430 or below, bring consumption below budget
        if (temp <= 435) {
          const rc = DashboardStore.plants.rc_energy;
          rc.kwh = 765000;
          rc.deviationPct = -1.9;
          rc.isCritical = false;
          DashboardStore.faultAcknowledged = true;
          showToast(`Setpoint ajustado a ${temp}°C. Demanda térmica normalizada bajo presupuesto.`, 'success');
        } else {
          showToast(`Setpoint ajustado a ${temp}°C.`, 'normal');
        }
        modalSetpoint.classList.remove('open');
        renderAllViews();
      });
    }

    // 2. SCADA Inspector Modal
    const btnInspect = document.getElementById('btn-diag-inspect');
    const modalInspect = document.getElementById('modal-inspect');
    const btnCloseInspect = document.getElementById('btn-close-inspect');

    if (btnInspect && modalInspect) {
      btnInspect.addEventListener('click', () => modalInspect.classList.add('open'));
    }
    if (btnCloseInspect && modalInspect) {
      btnCloseInspect.addEventListener('click', () => modalInspect.classList.remove('open'));
    }

    // 3. Acknowledge Fault Button
    const btnAck = document.getElementById('btn-diag-ack');
    if (btnAck) {
      btnAck.addEventListener('click', () => {
        DashboardStore.faultAcknowledged = !DashboardStore.faultAcknowledged;
        updatePlantDetailView();
        showToast(
          DashboardStore.faultAcknowledged ? 'Falla SCADA confirmada por operador.' : 'Estado de alerta restaurado.',
          DashboardStore.faultAcknowledged ? 'success' : 'normal'
        );
      });
    }
  }

  // --- EXPORT REPORTS ---
  function exportSCADAReport() {
    showToast('Generando informe de energía y gas Clarios...', 'normal');
    setTimeout(() => {
      showToast('✓ Informe descargado: Reporte_Consolidado_Clarios_2024.pdf', 'success');
    }, 800);
  }

  function exportPlantCSV() {
    const p = DashboardStore.plants[DashboardStore.currentPlantId];
    let csv = `Dia,Consumo_kWh,Presupuesto_Meta_kWh\n`;
    p.dailyData.forEach(d => {
      csv += `${d.day},${d.kwh},${Math.round(p.budgetKwh / 30)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SCADA_Logs_${p.id}_Septiembre2024.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Descargado registro SCADA para ${p.name}`, 'success');
  }

  // --- LIVE HEARTBEAT SYNC ---
  function startLiveHeartbeat() {
    setInterval(() => {
      DashboardStore.global.lastSyncSeconds += 1;
      if (DashboardStore.global.lastSyncSeconds > 30) {
        DashboardStore.global.lastSyncSeconds = 2;
      }
      setElementText('sync-timer-label', `SYNC: ${DashboardStore.global.lastSyncSeconds}s ago`);
    }, 1000);
  }

  // --- UTILITIES ---
  function formatNumber(num) {
    return Number(num).toLocaleString('en-US');
  }

  function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function showToast(message, type = 'normal') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `scada-toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 4000);
  }

})();
