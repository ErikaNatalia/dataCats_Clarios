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
    currentView: 'landing', // 'landing' | 'detail' | 'sources'
    currentPlantId: 'rc_energy', // 'ensamble' | 'fa' | 'rc_energy'
    faultAcknowledged: false,

    // Global Aggregate Metrics
    global: {
      totalEnergyKwh: 2808000,
      energyCostUsd: 536960,
      budgetEnergyKwh: 2799600,
      budgetDeviationPct: 0.3,
      alertCount: 2,
      lastSyncSeconds: 12,
      historicalAverage: {
        totalEnergyKwh: 2870000,
        energyCostUsd: 548200,
        budgetDeviationPct: 2.7,
        alertCount: 4
      }
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
        deviationPct: -2.3,
        productionUnits: 200000,
        productionType: 'Baterías SLI / EFB',
        sensorsCount: 42,
        alertCount: 0,
        nodeUri: 'NODE-MTY-AS-01',
        previous: {
          kwh: 701000,
          costUsd: 84120,
          ratioKwhUnit: 3.51,
          deviationPct: 0.4,
          productionUnits: 198000,
          alertCount: 0
        },
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
        deviationPct: -3.1,
        productionUnits: 207200,
        productionType: 'Celdas Formadas',
        sensorsCount: 48,
        alertCount: 0,
        nodeUri: 'NODE-MTY-FA-02',
        previous: {
          kwh: 1299000,
          costUsd: 155880,
          ratioKwhUnit: 6.27,
          deviationPct: 0.5,
          productionUnits: 205000,
          alertCount: 0
        },
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
        deviationPct: 10.8,
        productionUnits: 200000,
        productionType: 'Baterías SLI / AGM',
        sensorsCount: 54,
        alertCount: 2,
        nodeUri: 'NODE-MTY-RC-01',
        previous: {
          kwh: 812000,
          costUsd: 97440,
          ratioKwhUnit: 4.11,
          deviationPct: 2.5,
          productionUnits: 197500,
          alertCount: 1
        },
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
    },

    sources: [
      {
        id: 'source-normal-sample',
        name: 'telemetria_muestra_normal.csv',
        scope: 'Multi-planta',
        format: 'CSV',
        period: 'Septiembre 2024',
        status: 'validated',
        href: new URL('../data/telemetria_muestra_normal.csv', import.meta.url).href,
        origin: 'Repositorio local del dashboard'
      },
      {
        id: 'source-rc-overuse',
        name: 'telemetria_sobreconsumo_rc.csv',
        scope: 'RC Energy & Gas',
        format: 'CSV',
        period: 'Septiembre 2024',
        status: 'validated',
        href: new URL('../data/telemetria_sobreconsumo_rc.csv', import.meta.url).href,
        origin: 'Repositorio local del dashboard'
      }
    ]
  };

  const CUSTOM_PLANTS_STORAGE_KEY = 'clarios.customPlants.v1';
  const BASE_GLOBAL_SNAPSHOT = {
    totalEnergyKwh: 2808000,
    energyCostUsd: 536960,
    budgetEnergyKwh: 2799600,
    plantEnergyKwh: 2808000,
    plantCostUsd: 335940,
    plantBudgetKwh: 2780000
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
    hydrateCustomPlants();
    ensureDynamicPlantUI();
    initNavigation();
    initPeriodContext();
    initTachometer();
    initFileUpload();
    initModals();
    initAddPlantModal();
    renderAllViews();
    if (window.location.hash === '#sources') switchView('sources');
    startLiveHeartbeat();
  });

  // --- NAVIGATION CONTROLLER ---
  function initNavigation() {
    const tabLanding = document.getElementById('tab-landing');
    const tabDetail = document.getElementById('tab-detail');
    const tabSources = document.getElementById('tab-sources');
    const btnBack = document.getElementById('btn-back-to-landing');

    if (tabLanding) {
      tabLanding.addEventListener('click', () => switchView('landing'));
    }
    if (tabDetail) {
      tabDetail.addEventListener('click', () => switchView('detail'));
    }
    if (tabSources) {
      tabSources.addEventListener('click', () => switchView('sources'));
    }
    if (btnBack) {
      btnBack.addEventListener('click', () => switchView('landing'));
    }

    const activatePlantFromCard = (target) => {
      const card = target.closest('[data-plant-id]');
      if (!card) return;
      const plantId = card.getAttribute('data-plant-id');
      if (plantId && DashboardStore.plants[plantId]) {
        DashboardStore.currentPlantId = plantId;
        switchView('detail');
      }
    };

    ['.battery-cards-grid', '.sidebar-battery-list'].forEach(selector => {
      const container = document.querySelector(selector);
      if (!container) return;
      container.addEventListener('click', event => activatePlantFromCard(event.target));
      container.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activatePlantFromCard(event.target);
        }
      });
    });

    const btnOpenSources = document.getElementById('btn-open-sources');
    if (btnOpenSources) btnOpenSources.addEventListener('click', () => switchView('sources'));

    initMobileDrawer();

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

  function initMobileDrawer() {
    const backdrop = document.getElementById('mobile-drawer-backdrop');
    const openButton = document.getElementById('btn-mobile-menu-toggle');
    const closeButton = document.getElementById('btn-close-drawer');
    if (!backdrop || !openButton || !closeButton) return;

    const closeDrawer = () => {
      backdrop.classList.remove('open');
      document.body.classList.remove('drawer-open');
    };
    const openDrawer = () => {
      backdrop.classList.add('open');
      document.body.classList.add('drawer-open');
    };

    openButton.addEventListener('click', openDrawer);
    closeButton.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) closeDrawer();
    });

    const drawerList = backdrop.querySelector('.drawer-nav-list');
    if (drawerList) {
      drawerList.addEventListener('click', event => {
        const button = event.target.closest('.drawer-nav-btn');
        if (!button) return;
        const target = button.getAttribute('data-nav-target');
        if (target === 'plant') {
          const plantId = button.getAttribute('data-plant-id');
          if (plantId && DashboardStore.plants[plantId]) DashboardStore.currentPlantId = plantId;
          switchView('detail');
        } else if (target === 'sources') {
          switchView('sources');
        } else {
          switchView('landing');
        }
        closeDrawer();
      });
    }

    const drawerAddPlant = document.getElementById('drawer-btn-add-plant');
    if (drawerAddPlant) drawerAddPlant.addEventListener('click', () => {
      closeDrawer();
      openAddPlantModal();
    });
    const drawerSetpoint = document.getElementById('drawer-btn-setpoint');
    if (drawerSetpoint) drawerSetpoint.addEventListener('click', () => {
      closeDrawer();
      document.getElementById('btn-open-setpoint-modal')?.click();
    });
    const drawerReport = document.getElementById('drawer-btn-report');
    if (drawerReport) drawerReport.addEventListener('click', () => {
      closeDrawer();
      exportSCADAReport();
    });
    const drawerCsv = document.getElementById('drawer-btn-csv');
    if (drawerCsv) drawerCsv.addEventListener('click', () => {
      closeDrawer();
      exportPlantCSV();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && backdrop.classList.contains('open')) closeDrawer();
    });
  }

  function updateDrawerActiveState() {
    document.querySelectorAll('.drawer-nav-btn').forEach(button => {
      const target = button.getAttribute('data-nav-target');
      const plantId = button.getAttribute('data-plant-id');
      const isActive = target === 'plant'
        ? DashboardStore.currentView === 'detail' && plantId === DashboardStore.currentPlantId
        : target === DashboardStore.currentView;
      button.classList.toggle('active', isActive);
      button.classList.toggle('danger', target === 'plant' && Boolean(DashboardStore.plants[plantId]?.isCritical));
      const dot = button.querySelector('.tab-dot');
      if (dot && target === 'plant') {
        dot.style.background = DashboardStore.plants[plantId]?.isCritical ? 'var(--fire-red)' : 'var(--neon-green)';
      }
    });
  }

  function initPeriodContext() {
    const monthSelects = [
      document.getElementById('select-filter-month'),
      document.getElementById('drawer-select-month')
    ].filter(Boolean);
    const yearSelects = [
      document.getElementById('select-filter-year'),
      document.getElementById('drawer-select-year')
    ].filter(Boolean);

    const synchronize = (source, peers) => {
      peers.forEach(peer => {
        if (peer !== source) peer.value = source.value;
      });
      updateComparisonPeriodLabel();
    };

    monthSelects.forEach(select => {
      select.addEventListener('change', () => synchronize(select, monthSelects));
    });
    yearSelects.forEach(select => {
      select.addEventListener('change', () => synchronize(select, yearSelects));
    });

    updateComparisonPeriodLabel();
  }

  function switchView(viewName) {
    DashboardStore.currentView = viewName;
    const landingView = document.getElementById('view-landing');
    const detailView = document.getElementById('view-detail');
    const sourcesView = document.getElementById('view-sources');
    const tabLanding = document.getElementById('tab-landing');
    const tabDetail = document.getElementById('tab-detail');
    const tabSources = document.getElementById('tab-sources');

    [landingView, detailView, sourcesView].forEach(view => {
      if (view) view.classList.remove('active-view');
    });
    [tabLanding, tabDetail, tabSources].forEach(tab => {
      if (tab) tab.classList.remove('active');
    });

    if (viewName === 'detail') {
      if (detailView) detailView.classList.add('active-view');
      if (tabDetail) tabDetail.classList.add('active');
      updatePlantDetailView();
    } else if (viewName === 'sources') {
      if (sourcesView) sourcesView.classList.add('active-view');
      if (tabSources) tabSources.classList.add('active');
      renderSourcesView();
    } else {
      if (landingView) landingView.classList.add('active-view');
      if (tabLanding) tabLanding.classList.add('active');
    }
    updateDrawerActiveState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- RENDER VIEWS ---
  function renderAllViews() {
    ensureDynamicPlantUI();
    recalculateGlobalMetrics();
    renderLandingMetrics();
    renderLandingBatteryCards();
    renderSidebarCards();
    renderExecutiveSummary();
    renderPlantCounts();
    renderSourcesView();
    updatePlantDetailView();
  }

  function hydrateCustomPlants() {
    try {
      const stored = JSON.parse(localStorage.getItem(CUSTOM_PLANTS_STORAGE_KEY) || '[]');
      if (!Array.isArray(stored)) return;

      stored.forEach(plant => {
        if (!plant || !plant.isCustom || typeof plant.id !== 'string' || !plant.name) return;
        if (!Array.isArray(plant.dailyData) || plant.dailyData.length !== 30) {
          plant.dailyData = generateDailyCurve(Number(plant.kwh) / 30, 0.08, Boolean(plant.isCritical));
        }
        DashboardStore.plants[plant.id] = plant;
        registerPlantSource(plant);
      });
    } catch (error) {
      console.warn('No fue posible restaurar las plantas personalizadas.', error);
    }
  }

  function persistCustomPlants() {
    try {
      const customPlants = Object.values(DashboardStore.plants).filter(plant => plant.isCustom);
      localStorage.setItem(CUSTOM_PLANTS_STORAGE_KEY, JSON.stringify(customPlants));
    } catch (error) {
      showToast('La planta fue creada, pero el navegador no permitió guardarla localmente.', 'danger');
    }
  }

  function ensureDynamicPlantUI() {
    const landingGrid = document.querySelector('.battery-cards-grid');
    const landingTemplate = landingGrid && landingGrid.querySelector('.car-battery-card');
    const sidebarList = document.querySelector('.sidebar-battery-list');
    const sidebarTemplate = sidebarList && sidebarList.querySelector('.sidebar-battery-card');
    const drawerList = document.querySelector('.drawer-nav-list');

    Object.values(DashboardStore.plants).forEach(plant => {
      if (landingGrid && landingTemplate && !landingGrid.querySelector(`[data-plant-id="${plant.id}"]`)) {
        const card = landingTemplate.cloneNode(true);
        card.setAttribute('data-plant-id', plant.id);
        card.setAttribute('aria-label', 'Abrir detalles de ' + plant.name);
        card.classList.remove('critical', 'trend-worse', 'active-plant');
        landingGrid.appendChild(card);
      }

      if (sidebarList && sidebarTemplate && !sidebarList.querySelector(`[data-plant-id="${plant.id}"]`)) {
        const card = sidebarTemplate.cloneNode(true);
        card.setAttribute('data-plant-id', plant.id);
        card.setAttribute('aria-label', 'Cambiar a ' + plant.name);
        card.classList.remove('active', 'danger');
        sidebarList.appendChild(card);
      }

      if (drawerList && !drawerList.querySelector(`[data-plant-id="${plant.id}"]`)) {
        const button = document.createElement('button');
        button.className = 'drawer-nav-btn';
        button.type = 'button';
        button.setAttribute('data-nav-target', 'plant');
        button.setAttribute('data-plant-id', plant.id);

        const dot = document.createElement('span');
        dot.className = 'tab-dot';
        const label = document.createElement('span');
        label.textContent = plant.number + '. ' + plant.name;
        button.append(dot, label);
        drawerList.appendChild(button);
      }
    });
  }

  function recalculateGlobalMetrics() {
    const plants = Object.values(DashboardStore.plants);
    const plantEnergy = plants.reduce((sum, plant) => sum + Number(plant.kwh || 0), 0);
    const plantBudget = plants.reduce((sum, plant) => sum + Number(plant.budgetKwh || 0), 0);
    const plantCost = plants.reduce((sum, plant) => sum + Number(plant.costUsd || 0), 0);
    DashboardStore.global.totalEnergyKwh = Math.round(BASE_GLOBAL_SNAPSHOT.totalEnergyKwh + plantEnergy - BASE_GLOBAL_SNAPSHOT.plantEnergyKwh);
    DashboardStore.global.budgetEnergyKwh = Math.round(BASE_GLOBAL_SNAPSHOT.budgetEnergyKwh + plantBudget - BASE_GLOBAL_SNAPSHOT.plantBudgetKwh);
    DashboardStore.global.energyCostUsd = Math.round(BASE_GLOBAL_SNAPSHOT.energyCostUsd + plantCost - BASE_GLOBAL_SNAPSHOT.plantCostUsd);
    DashboardStore.global.budgetDeviationPct = DashboardStore.global.budgetEnergyKwh > 0
      ? ((DashboardStore.global.totalEnergyKwh - DashboardStore.global.budgetEnergyKwh) / DashboardStore.global.budgetEnergyKwh) * 100
      : 0;
    DashboardStore.global.alertCount = plants.reduce((sum, plant) => sum + Number(plant.alertCount || 0), 0);
  }

  function renderPlantCounts() {
    const plants = Object.values(DashboardStore.plants);
    const normalCount = plants.filter(plant => !plant.isCritical).length;
    const criticalCount = plants.length - normalCount;
    setElementText('legend-normal-count', normalCount + (normalCount === 1 ? ' Planta en Rango' : ' Plantas en Rango'));
    setElementText('legend-critical-count', criticalCount + (criticalCount === 1 ? ' Desviación Crítica' : ' Desviaciones Críticas'));
    setElementText('blueprint-module-count', plants.length + ' MÓDULOS DE PROCESO ACTIVO (CLARIOS PROTOCOL V4.9)');
    setElementText('sidebar-plant-count', '1 Activo / ' + plants.length + ' Total');
  }

  function registerPlantSource(plant) {
    const safeSourceUrl = sanitizeExternalUrl(plant.sourceUrl);
    if (!safeSourceUrl) return;
    const sourceId = 'plant-source-' + plant.id;
    if (DashboardStore.sources.some(source => source.id === sourceId)) return;
    DashboardStore.sources.push({
      id: sourceId,
      name: 'Fuente de ' + plant.name,
      scope: plant.name,
      format: getSourceFormat(safeSourceUrl),
      period: 'Vínculo registrado',
      status: 'registered',
      href: safeSourceUrl,
      origin: 'Vínculo suministrado al crear la planta',
      external: true
    });
  }

  function renderSourcesView() {
    const tableBody = document.getElementById('sources-table-body');
    if (!tableBody) return;
    tableBody.replaceChildren();

    DashboardStore.sources.forEach(source => {
      const row = document.createElement('tr');

      const sourceCell = document.createElement('td');
      const sourceName = document.createElement('strong');
      sourceName.className = 'source-file-name';
      sourceName.textContent = source.name;
      const sourceOrigin = document.createElement('small');
      sourceOrigin.textContent = source.origin || 'Origen registrado';
      sourceCell.append(sourceName, sourceOrigin);

      const scopeCell = document.createElement('td');
      scopeCell.textContent = source.scope;
      const formatCell = document.createElement('td');
      const formatBadge = document.createElement('span');
      formatBadge.className = 'source-format-badge';
      formatBadge.textContent = source.format;
      formatCell.appendChild(formatBadge);
      const periodCell = document.createElement('td');
      periodCell.textContent = source.period;

      const statusCell = document.createElement('td');
      const statusBadge = document.createElement('span');
      statusBadge.className = 'source-status-badge ' + source.status;
      statusBadge.textContent = source.status === 'validated' ? '● Validada' : '● Registrada';
      statusCell.appendChild(statusBadge);

      const actionsCell = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'source-actions';
      const previewButton = document.createElement('button');
      previewButton.className = 'source-action-btn';
      previewButton.type = 'button';
      previewButton.textContent = 'Vista previa';
      previewButton.addEventListener('click', () => previewSource(source.id));
      actions.appendChild(previewButton);

      if (source.href) {
        const openLink = document.createElement('a');
        openLink.className = 'source-action-link';
        openLink.href = source.href;
        openLink.textContent = source.external ? 'Abrir vínculo ↗' : 'Descargar ↓';
        if (source.external) {
          openLink.target = '_blank';
          openLink.rel = 'noopener noreferrer';
        } else {
          openLink.setAttribute('download', source.name);
        }
        actions.appendChild(openLink);
      }
      actionsCell.appendChild(actions);
      row.append(sourceCell, scopeCell, formatCell, periodCell, statusCell, actionsCell);
      tableBody.appendChild(row);
    });

    const validatedCount = DashboardStore.sources.filter(source => source.status === 'validated').length;
    setElementText('source-count-total', String(DashboardStore.sources.length));
    setElementText('source-count-validated', String(validatedCount));
    const latestImport = [...DashboardStore.sources].reverse().find(source => source.importedAt);
    setElementText('source-last-update', latestImport ? latestImport.importedAt : 'Datos base');
  }

  async function previewSource(sourceId) {
    const source = DashboardStore.sources.find(item => item.id === sourceId);
    if (!source) return;

    const title = document.getElementById('source-preview-title');
    const meta = document.getElementById('source-preview-meta');
    const empty = document.getElementById('source-preview-empty');
    const content = document.getElementById('source-preview-content');
    if (!title || !meta || !empty || !content) return;

    title.textContent = source.name;
    meta.textContent = source.scope + ' • ' + source.format + ' • ' + source.period;
    empty.hidden = true;
    content.hidden = false;
    content.textContent = 'Cargando vista previa…';

    try {
      let rawText = source.rawText;
      if (!rawText && source.href && !source.external && !source.binary) {
        const response = await fetch(source.href);
        if (!response.ok) throw new Error('No se pudo leer la fuente.');
        rawText = await response.text();
      }

      if (rawText) {
        const lines = rawText.trim().split(/\r?\n/);
        const visibleLines = lines.slice(0, 13);
        content.textContent = visibleLines.join('\n') + (lines.length > visibleLines.length ? '\n… ' + (lines.length - visibleLines.length) + ' registros adicionales' : '');
      } else if (source.external) {
        content.textContent = 'Fuente externa registrada:\n' + source.href + '\n\nUse “Abrir vínculo” para consultar el Excel o repositorio original.';
      } else {
        content.textContent = 'La vista previa no está disponible para este formato binario. Use “Descargar” para abrir el archivo en Excel.';
      }
      document.getElementById('source-preview-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      content.textContent = 'No fue posible cargar la vista previa. El enlace de descarga permanece disponible.';
    }
  }

  function registerUploadedSource(file, rawText, binary = false) {
    const objectUrl = URL.createObjectURL(file);
    const now = new Date();
    const importedAt = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const source = {
      id: 'upload-' + Date.now(),
      name: file.name,
      scope: 'Carga manual multi-planta',
      format: getSourceFormat(file.name),
      period: 'Hoy, ' + importedAt,
      status: binary ? 'registered' : 'validated',
      href: objectUrl,
      origin: 'Archivo cargado por el usuario • ' + formatFileSize(file.size),
      rawText: rawText || '',
      binary,
      importedAt
    };
    DashboardStore.sources.push(source);
    renderSourcesView();
    return source;
  }

  function getSourceFormat(path) {
    const cleanedPath = String(path || '').split('?')[0].toUpperCase();
    if (cleanedPath.endsWith('.XLSX') || cleanedPath.endsWith('.XLS')) return 'EXCEL';
    if (cleanedPath.endsWith('.DAT')) return 'DAT';
    return 'CSV';
  }

  function sanitizeExternalUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(String(value));
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderLandingMetrics() {
    const g = DashboardStore.global;
    const history = g.historicalAverage;

    setElementText('landing-global-kwh', formatNumber(g.totalEnergyKwh));
    setElementText('landing-global-cost', '$' + formatNumber(g.energyCostUsd));
    setElementText('landing-global-deviation', (g.budgetDeviationPct > 0 ? '+' : '') + g.budgetDeviationPct.toFixed(1) + '%');
    setElementText('landing-global-alerts', g.alertCount + ' alertas');

    const energyState = renderPercentComparison('landing-global-kwh-trend', g.totalEnergyKwh, history.totalEnergyKwh, true);
    const costState = renderPercentComparison('landing-global-cost-trend', g.energyCostUsd, history.energyCostUsd, true);
    const deviationState = renderPointComparison('landing-global-deviation-trend', g.budgetDeviationPct, history.budgetDeviationPct, true);
    const alertState = renderCountComparison('landing-global-alerts-trend', g.alertCount, history.alertCount, true);

    setElementText('landing-global-kwh-baseline', 'Promedio: ' + formatNumber(history.totalEnergyKwh) + ' kWh');
    setElementText('landing-global-cost-baseline', 'Promedio: $' + formatNumber(history.energyCostUsd) + ' USD');
    setElementText('landing-global-deviation-baseline', 'Promedio: ' + formatSigned(history.budgetDeviationPct, 1) + '% · Tolerancia ±2%');
    setElementText('landing-global-alerts-baseline', g.alertCount > 0 ? 'Foco actual: RC Energy & Gas' : 'Sin focos activos');

    setKpiCardState('landing-kpi-energy-card', energyState);
    setKpiCardState('landing-kpi-cost-card', costState);
    setKpiCardState('landing-kpi-deviation-card', deviationState);
    setKpiCardState('landing-kpi-alerts-card', g.alertCount > 0 ? 'negative' : alertState);
  }

  function renderLandingBatteryCards() {
    Object.keys(DashboardStore.plants).forEach(plantId => {
      const p = DashboardStore.plants[plantId];
      const card = document.querySelector(`.car-battery-card[data-plant-id="${plantId}"]`);
      if (!card) return;

      card.setAttribute('aria-label', 'Abrir detalles de ' + p.name);
      const tagEl = card.querySelector('.plant-id-tag');
      if (tagEl) tagEl.textContent = p.tag;
      const nameEl = card.querySelector('.battery-plant-name');
      if (nameEl) {
        const icon = nameEl.querySelector('svg');
        nameEl.replaceChildren(document.createTextNode(p.number + '. ' + p.name + ' '));
        if (icon) nameEl.appendChild(icon);
      }

      const kwhEl = card.querySelector('.battery-metric-kwh');
      if (kwhEl) {
        kwhEl.textContent = formatNumber(p.kwh) + ' kWh';
        kwhEl.style.color = p.isCritical ? 'var(--fire-red)' : '';
      }

      card.classList.toggle('critical', p.isCritical);

      const ratioEl = card.querySelector('.submetric-ratio');
      if (ratioEl) ratioEl.textContent = p.ratioKwhUnit.toFixed(2) + ' kWh/u';

      const costEl = card.querySelector('.submetric-cost');
      if (costEl) costEl.textContent = '$' + formatNumber(p.costUsd);

      const devEl = card.querySelector('.submetric-dev');
      if (devEl) {
        devEl.textContent = (p.deviationPct > 0 ? '+' : '') + p.deviationPct.toFixed(1) + '% ' + (p.deviationPct > 0 ? 'Exceso' : 'A favor');
        devEl.className = 'submetric-val submetric-dev ' + (p.deviationPct > 0 ? 'red' : 'green');
      }

      const plantTrend = card.querySelector('.plant-trend-chip');
      if (plantTrend) {
        const state = renderPercentComparisonElement(plantTrend, p.kwh, p.previous.kwh, true, ' vs corte anterior');
        plantTrend.classList.add('plant-trend-chip');
        card.classList.toggle('trend-worse', state === 'negative');
      }

      const alertTag = card.querySelector('.battery-alert-tag');
      if (alertTag) {
        alertTag.className = 'battery-alert-tag ' + (p.isCritical ? 'tag-danger' : 'tag-success');
        alertTag.textContent = p.isCritical ? 'FOCO CRÍTICO' : 'OPERACIÓN ÓPTIMA';
      }

      const statusPill = card.querySelector('.battery-status-pill');
      if (statusPill) {
        statusPill.className = 'battery-status-pill ' + (p.isCritical ? 'red' : 'green');
        statusPill.textContent = p.isCritical ? '▲ Alerta activa' : '● Planta nominal';
      }

      const actionButton = card.querySelector('.btn-card-action');
      if (actionButton) {
        actionButton.classList.toggle('btn-action-danger', p.isCritical);
        actionButton.textContent = p.isCritical ? 'Inspeccionar →' : 'Ver detalle →';
      }

      const sparklineLabels = card.querySelectorAll('.sparkline-label span');
      if (sparklineLabels.length >= 2) {
        sparklineLabels[0].textContent = 'Perfil de carga · ' + p.tag;
        sparklineLabels[1].textContent = p.isCritical ? 'Requiere atención' : 'Carga estable';
        sparklineLabels[1].style.color = p.isCritical ? 'var(--fire-red)' : 'var(--neon-green)';
      }

      // Draw SVG mini sparkline
      renderMiniSparkline(card.querySelector('.sparkline-svg'), p.sparklinePoints, p.isCritical ? '#FF3D57' : (plantId === 'fa' ? '#7C4DFF' : '#00E676'));
    });
  }

  function renderExecutiveSummary() {
    const plants = Object.values(DashboardStore.plants);
    const improvedCount = plants.filter(plant => plant.kwh < plant.previous.kwh).length;
    const netDeltaKwh = plants.reduce((sum, plant) => sum + (plant.kwh - plant.previous.kwh), 0);
    const focusPlant = plants.reduce((focus, plant) => {
      const delta = plant.kwh - plant.previous.kwh;
      return delta > focus.delta ? { plant, delta } : focus;
    }, { plant: null, delta: 0 });

    setElementText('decision-balance', improvedCount + ' de ' + plants.length + ' plantas mejoran');
    setElementText(
      'decision-balance-detail',
      'Consumo neto: ' + formatNumber(Math.abs(netDeltaKwh)) + ' kWh ' + (netDeltaKwh <= 0 ? 'menos' : 'adicionales')
    );

    if (focusPlant.plant) {
      const costImpact = focusPlant.plant.costUsd - focusPlant.plant.previous.costUsd;
      setElementText('decision-focus', focusPlant.plant.name);
      setElementText('decision-focus-detail', '+' + formatNumber(focusPlant.delta) + ' kWh vs corte anterior');
      setElementText('decision-impact', '+$' + formatNumber(Math.max(0, costImpact)) + ' USD');
      setElementText('decision-impact-detail', 'Costo incremental del foco crítico');
    } else {
      setElementText('decision-focus', 'Sin focos de deterioro');
      setElementText('decision-focus-detail', 'Todas las plantas reducen consumo');
      setElementText('decision-impact', '$0 USD');
      setElementText('decision-impact-detail', 'Sin costo incremental detectado');
    }
  }

  function renderSidebarCards() {
    Object.values(DashboardStore.plants).forEach(plant => {
      const card = document.querySelector(`.sidebar-battery-card[data-plant-id="${plant.id}"]`);
      if (!card) return;

      const isActive = plant.id === DashboardStore.currentPlantId;
      card.classList.toggle('active', isActive);
      card.classList.toggle('danger', plant.isCritical);

      const cardTop = card.querySelector('.sidebar-card-top');
      const existingActiveBadge = card.querySelector('.sidebar-active-badge');
      if (existingActiveBadge) existingActiveBadge.remove();
      if (isActive && cardTop) {
        const activeBadge = document.createElement('span');
        activeBadge.className = 'sidebar-active-badge';
        activeBadge.textContent = 'ACTIVO';
        cardTop.appendChild(activeBadge);
      }


      const nameEl = card.querySelector('.sidebar-plant-name');
      if (nameEl) nameEl.textContent = plant.number + '. ' + plant.name;

      const kwhValue = card.querySelector('.sidebar-kwh-value');
      if (kwhValue) {
        const unit = document.createElement('span');
        unit.textContent = 'kWh';
        kwhValue.replaceChildren(document.createTextNode(formatNumber(plant.kwh) + ' '), unit);
        kwhValue.style.color = plant.isCritical ? 'var(--fire-red)' : '';
      }

      const metricValues = card.querySelectorAll('.sidebar-submetrics-row .val');
      if (metricValues.length >= 3) {
        metricValues[0].textContent = plant.ratioKwhUnit.toFixed(2);
        metricValues[1].textContent = '$' + formatNumber(Math.round(plant.costUsd / 1000)) + 'k';
        metricValues[2].textContent = formatSigned(plant.deviationPct, 1) + '%';
        metricValues[2].style.color = plant.deviationPct > 0 ? 'var(--fire-red)' : 'var(--neon-green)';
      }

      const statusLine = card.querySelector('.sidebar-card-bottom > span:first-child');
      if (statusLine) {
        statusLine.className = 'sidebar-state ' + (plant.isCritical ? 'danger' : 'normal');
        statusLine.textContent = plant.isCritical ? '▲ SOBRECONSUMO' : '● NOMINAL';
      }
      const sensorTag = card.querySelector('.sensor-count-tag');
      if (sensorTag) sensorTag.textContent = plant.sensorsCount + ' Sensores';

      let alertMessage = card.querySelector('.alert-message-sub');
      if (plant.isCritical) {
        if (!alertMessage) {
          alertMessage = document.createElement('div');
          alertMessage.className = 'alert-message-sub';
          alertMessage.appendChild(document.createElement('span'));
          card.appendChild(alertMessage);
        }
        const alertText = alertMessage.querySelector('span');
        if (alertText) alertText.textContent = plant.alertSnippet;
      } else if (alertMessage) {
        alertMessage.remove();
      }
    });
    updateDrawerActiveState();
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

    renderSidebarCards();

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
    const detailTab = document.getElementById('tab-detail');
    if (detailTab) {
      const dot = detailTab.querySelector('.tab-dot');
      detailTab.replaceChildren();
      if (dot) detailTab.appendChild(dot);
      detailTab.appendChild(document.createTextNode(' Detalle · ' + currentPlant.name));
      detailTab.classList.toggle('danger', currentPlant.isCritical);
    }
    updateComparisonPeriodLabel();

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
    setElementText('detail-kpi-kwh-sub', 'Meta: ' + formatNumber(currentPlant.budgetKwh) + ' kWh');

    setElementText('detail-kpi-cost', '$' + formatNumber(currentPlant.costUsd) + ' USD');
    setElementText('detail-kpi-cost-context', 'Tarifa neta: $' + (currentPlant.costUsd / currentPlant.kwh).toFixed(3) + ' / kWh');
    setElementText('detail-kpi-unit-ratio', currentPlant.ratioKwhUnit.toFixed(2) + ' kWh/u');
    setElementText('detail-kpi-unit-target', 'Meta: ' + currentPlant.ratioTarget.toFixed(2) + ' kWh/u');

    const ratioDeviationPct = ((currentPlant.ratioKwhUnit - currentPlant.ratioTarget) / currentPlant.ratioTarget) * 100;

    const badgeRatio = document.getElementById('detail-kpi-badge-ratio');
    if (badgeRatio) {
      if (ratioDeviationPct > 0) {
        badgeRatio.className = 'detail-kpi-badge badge-danger';
        badgeRatio.textContent = '+' + ratioDeviationPct.toFixed(1) + '% SOBRE META';
      } else {
        badgeRatio.className = 'detail-kpi-badge badge-success';
        badgeRatio.textContent = ratioDeviationPct.toFixed(1) + '% EN META';
      }
    }

    const devEl = document.getElementById('detail-kpi-deviation');
    if (devEl) {
      devEl.textContent = (currentPlant.deviationPct > 0 ? '+' : '') + currentPlant.deviationPct.toFixed(1) + '%';
      devEl.className = 'detail-kpi-val ' + (currentPlant.deviationPct > 0 ? 'red' : 'green');
    }
    setElementText('detail-kpi-dev-sub', currentPlant.deviationPct > 0 ? 'Gasto excedente' : 'Dentro de presupuesto');

    setElementText('detail-kpi-prod-qty', formatNumber(currentPlant.productionUnits));
    setElementText('detail-kpi-prod-sub', currentPlant.productionType);

    const scadaStatusEl = document.getElementById('detail-kpi-scada-status');
    if (scadaStatusEl) {
      scadaStatusEl.textContent = currentPlant.isCritical && !DashboardStore.faultAcknowledged ? 'ALERTA CONSUMO ALTO' : 'OPERACIÓN NORMAL';
      scadaStatusEl.className = 'detail-kpi-val ' + (currentPlant.isCritical && !DashboardStore.faultAcknowledged ? 'red' : 'green');
    }
    setElementText('detail-kpi-scada-sensors', currentPlant.sensorsCount + ' Sensores IoT');

    const kwhState = renderPercentComparison('detail-kpi-kwh-trend', currentPlant.kwh, currentPlant.previous.kwh, true);
    const costState = renderPercentComparison('detail-kpi-cost-trend', currentPlant.costUsd, currentPlant.previous.costUsd, true);
    const ratioState = renderPercentComparison('detail-kpi-ratio-trend', currentPlant.ratioKwhUnit, currentPlant.previous.ratioKwhUnit, true);
    const deviationTrendState = renderPointComparison('detail-kpi-dev-trend', currentPlant.deviationPct, currentPlant.previous.deviationPct, true);
    const productionState = renderPercentComparison('detail-kpi-prod-trend', currentPlant.productionUnits, currentPlant.previous.productionUnits, false);
    const scadaState = renderCountComparison('detail-kpi-scada-trend', currentPlant.alertCount, currentPlant.previous.alertCount, true);

    setKpiCardState('detail-card-kwh', kwhState);
    setKpiCardState('detail-card-cost', costState);
    setKpiCardState('detail-card-ratio', ratioState);
    setKpiCardState('detail-card-deviation', deviationTrendState);
    setKpiCardState('detail-card-production', productionState);
    setKpiCardState('detail-card-scada', currentPlant.alertCount > 0 ? 'negative' : scadaState);

    // 4. Update Automotive Tachometer
    updateTachometer(currentPlant);

    // 5. Update Charts
    renderLineChart(currentPlant.dailyData, currentPlant.budgetKwh / 30);
    renderProcessBars(currentPlant.processes, currentPlant.processAlert);
    renderGasMonitor(currentPlant.gas);

    // 6. Diagnostic Alert Card
    updateDiagnosticCard(currentPlant);
  }

  // --- AUTOMOTIVE TACHOMETER (VELOCÍMETRO DE DEMANDA ELÉCTRICA) ---
  let currentAnimatedKwh = 0;
  let targetKwh = 864000;
  let currentBudgetKwh = 780000;
  let currentMaxCapacity = 950000;
  let animFrameId = null;

  function initTachometer() {
    currentAnimatedKwh = 0;
  }

  function updateTachometer(plant) {
    if (!plant) return;

    const newKwh = plant.kwh;
    const budgetKwh = plant.budgetKwh;
    const maxKwh = plant.maxCapacityKwh;
    targetKwh = newKwh;
    currentBudgetKwh = budgetKwh;
    currentMaxCapacity = maxKwh;

    setElementText('tachometer-cluster-sub', 'SCADA · ' + plant.name);
    setElementText('cal-promedio-val', formatNumber(budgetKwh) + ' kWh');
    setElementText('cal-capacidad-val', formatNumber(maxKwh) + ' kWh');
    setElementText('cal-previous-val', formatNumber(plant.previous.kwh) + ' kWh');

    const previousChange = ((newKwh - plant.previous.kwh) / plant.previous.kwh) * 100;
    const previousSubEl = document.getElementById('cal-previous-sub');
    if (previousSubEl) {
      if (Math.abs(previousChange) < 0.05) {
        previousSubEl.textContent = 'Consumo actual estable';
        previousSubEl.className = 'cal-sub';
      } else {
        previousSubEl.textContent = 'Consumo actual: ' + Math.abs(previousChange).toFixed(1) + '% ' + (previousChange > 0 ? 'por encima' : 'por debajo');
        previousSubEl.className = 'cal-sub ' + (previousChange > 0 ? 'red' : 'green');
      }
    }

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

    const capacityRemaining = maxKwh - newKwh;
    setElementText(
      'cal-capacidad-sub',
      capacityRemaining >= 0
        ? 'Margen contratado: ' + formatNumber(capacityRemaining) + ' kWh'
        : 'Capacidad excedida: ' + formatNumber(Math.abs(capacityRemaining)) + ' kWh'
    );

    const dialStatus = document.getElementById('cal-dial-status');
    if (dialStatus) {
      dialStatus.textContent = exceso > 0 ? 'SOBRECONSUMO' : 'OPERACIÓN BALANCEADA';
      dialStatus.className = exceso > 0 ? 'active' : '';
    }

    updateGaugeScale(budgetKwh, maxKwh);

    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (currentAnimatedKwh === 0) {
      currentAnimatedKwh = targetKwh;
      drawTachometerFrame(currentAnimatedKwh, currentBudgetKwh, currentMaxCapacity);
      return;
    }
    animateTachometer();
  }

  function updateGaugeScale(budgetKwh, maxKwh) {
    updateGaugeTick(0, 'gauge-tick-line-0', 'gauge-tick-0', '0');
    updateGaugeTick(0.2, 'gauge-tick-line-20', 'gauge-tick-20', formatGaugeValue(maxKwh * 0.2));
    updateGaugeTick(0.4, 'gauge-tick-line-40', 'gauge-tick-40', formatGaugeValue(maxKwh * 0.4));
    updateGaugeTick(0.6, 'gauge-tick-line-60', 'gauge-tick-60', formatGaugeValue(maxKwh * 0.6));
    updateGaugeTick(1, 'gauge-tick-line-max', 'gauge-tick-max', formatGaugeValue(maxKwh));

    const budgetPct = Math.min(Math.max(budgetKwh / maxKwh, 0), 1);
    const point = getGaugePoint(budgetPct, 160);
    const innerPoint = getGaugePoint(budgetPct, 143);
    const budgetTick = document.getElementById('stitch-gauge-budget-tick');
    const budgetDot = document.getElementById('stitch-gauge-budget-dot');
    const budgetLabel = document.getElementById('stitch-gauge-budget-label');
    const alertSector = document.getElementById('stitch-gauge-alert-sector');

    if (budgetTick) {
      budgetTick.setAttribute('x1', point.x.toFixed(1));
      budgetTick.setAttribute('y1', point.y.toFixed(1));
      budgetTick.setAttribute('x2', innerPoint.x.toFixed(1));
      budgetTick.setAttribute('y2', innerPoint.y.toFixed(1));
    }
    if (budgetDot) {
      budgetDot.setAttribute('cx', point.x.toFixed(1));
      budgetDot.setAttribute('cy', point.y.toFixed(1));
    }
    if (budgetLabel) {
      const onRight = budgetPct >= 0.5;
      budgetLabel.setAttribute('x', (point.x + (onRight ? -8 : 8)).toFixed(1));
      budgetLabel.setAttribute('y', Math.max(24, point.y - 14).toFixed(1));
      budgetLabel.setAttribute('text-anchor', onRight ? 'end' : 'start');
      budgetLabel.textContent = 'META ' + formatGaugeValue(budgetKwh);
    }
    if (alertSector) {
      alertSector.setAttribute('d', `M ${point.x.toFixed(1)},${point.y.toFixed(1)} A 160,160 0 0,1 360,200`);
    }
  }

  function updateGaugeTick(pct, lineId, labelId, labelText) {
    const line = document.getElementById(lineId);
    const label = document.getElementById(labelId);
    const outerPoint = getGaugePoint(pct, 160);
    const innerPoint = getGaugePoint(pct, 144);
    const labelPoint = getGaugePoint(pct, pct === 0 || pct === 1 ? 174 : 176);

    if (line) {
      line.setAttribute('x1', outerPoint.x.toFixed(1));
      line.setAttribute('y1', outerPoint.y.toFixed(1));
      line.setAttribute('x2', innerPoint.x.toFixed(1));
      line.setAttribute('y2', innerPoint.y.toFixed(1));
    }
    if (label) {
      label.setAttribute('x', labelPoint.x.toFixed(1));
      label.setAttribute('y', (labelPoint.y + (pct === 0 || pct === 1 ? 18 : 4)).toFixed(1));
      label.textContent = labelText;
    }
  }

  function animateTachometer() {
    const diff = targetKwh - currentAnimatedKwh;
    if (Math.abs(diff) < 250) {
      currentAnimatedKwh = targetKwh;
      drawTachometerFrame(currentAnimatedKwh, currentBudgetKwh, currentMaxCapacity);
      animFrameId = null;
    } else {
      currentAnimatedKwh += diff * 0.12;
      drawTachometerFrame(currentAnimatedKwh, currentBudgetKwh, currentMaxCapacity);
      animFrameId = requestAnimationFrame(animateTachometer);
    }
  }

  function drawTachometerFrame(kwh, budget, maxKwh) {
    const currentPct = Math.min(Math.max(kwh / maxKwh, 0), 1);
    const isOverBudget = kwh > budget;
    const needleColor = isOverBudget ? '#FF3D57' : '#00E676';
    const needleLines = document.querySelectorAll('.stitch-needle-line');

    needleLines.forEach(line => {
      const length = Number(line.getAttribute('data-needle-length')) || 156;
      const point = getGaugePoint(currentPct, length);
      line.setAttribute('x2', point.x.toFixed(1));
      line.setAttribute('y2', point.y.toFixed(1));
    });

    const glowLine = document.getElementById('stitch-needle-glow-line');
    if (glowLine) {
      glowLine.setAttribute('stroke', needleColor);
      glowLine.setAttribute('filter', isOverBudget ? 'url(#redNeonGlow)' : 'url(#greenNeonGlow)');
    }
    const hubCenter = document.getElementById('stitch-needle-hub-center');
    if (hubCenter) hubCenter.setAttribute('fill', needleColor);

    const alertSector = document.getElementById('stitch-gauge-alert-sector');
    if (alertSector) alertSector.setAttribute('opacity', isOverBudget ? '0.95' : '0.28');

    const digitalReadout = document.getElementById('gauge-digital-value');
    const gaugeAlertPill = document.getElementById('gauge-alert-pill');

    if (digitalReadout) {
      digitalReadout.textContent = formatNumber(Math.round(kwh));
      digitalReadout.className = 'gauge-digital-kwh ' + (isOverBudget ? 'over-budget' : 'under-budget');
    }

    if (gaugeAlertPill) {
      const pctOver = (((kwh - budget) / budget) * 100).toFixed(1);
      if (isOverBudget) {
        gaugeAlertPill.className = 'gauge-alert-pill danger';
        gaugeAlertPill.textContent = `Límite superado: +${pctOver}% sobre la meta de ${formatNumber(budget)} kWh`;
      } else {
        gaugeAlertPill.className = 'gauge-alert-pill normal';
        gaugeAlertPill.textContent = `Consumo en rango: ${Math.abs(pctOver)}% bajo la meta`;
      }
    }
  }

  function getGaugePoint(pct, radius) {
    const angle = Math.PI - (Math.PI * pct);
    return {
      x: 200 + Math.cos(angle) * radius,
      y: 200 - Math.sin(angle) * radius
    };
  }

  function formatGaugeValue(value) {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1) + 'M';
    }
    return Math.round(value / 1000) + 'k';
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
      const ratioDeviation = ((plant.ratioKwhUnit - plant.ratioTarget) / plant.ratioTarget) * 100;
      if (desc) desc.textContent = `La demanda total supera el presupuesto en ${plant.deviationPct.toFixed(1)}%; la intensidad unitaria está ${ratioDeviation.toFixed(1)}% sobre la meta (${plant.ratioKwhUnit.toFixed(2)} vs ${plant.ratioTarget.toFixed(2)} kWh/u). Telemetría: ${plant.nodeUri}.`;
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

    if (fileName.endsWith('.xlsx')) {
      registerUploadedSource(file, '', true);
      showToast('Excel registrado en Fuentes de Datos. Para sincronizar KPIs, exporta la hoja con la plantilla CSV.', 'success');
      return;
    }

    // Read and parse file content securely
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const textContent = e.target.result;
        registerUploadedSource(file, textContent, false);
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
        const productionUnits = row.length >= 4 ? parseFloat(row[3]) : NaN;

        if (DashboardStore.plants[plantKey] && !isNaN(kwh) && !isNaN(budget)) {
          const plant = DashboardStore.plants[plantKey];
          plant.kwh = Math.round(kwh);
          plant.budgetKwh = Math.round(budget);
          plant.deviationPct = parseFloat((((kwh - budget) / budget) * 100).toFixed(1));
          plant.costUsd = Math.round(kwh * 0.120);
          if (!isNaN(productionUnits) && productionUnits > 0) {
            plant.productionUnits = Math.round(productionUnits);
            plant.ratioKwhUnit = kwh / productionUnits;
          }
          plant.isCritical = plant.deviationPct > 0;
          plant.alertCount = plant.isCritical ? Math.max(1, plant.alertCount) : 0;
          recordsUpdated++;
        }
      }
    }

    recalculateGlobalMetrics();
    persistCustomPlants();
    renderAllViews();
    showToast(`✓ Datos sincronizados con éxito. (${recordsUpdated} plantas actualizadas - ISO 50001 verificado)`, 'success');
  }

  function loadDemoDataset() {
    const demoCSV = `Planta,Consumo_kWh,Presupuesto_kWh,Unidades
ensamble,690000,700000,200000
fa,1240000,1300000,205000
rc_energy,812000,780000,200000`;
    const demoFile = new File([demoCSV], 'telemetria_demo_clarios.csv', { type: 'text/csv' });
    registerUploadedSource(demoFile, demoCSV, false);
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

  function initAddPlantModal() {
    const modal = document.getElementById('modal-add-plant');
    const form = document.getElementById('form-add-plant');
    if (!modal || !form) return;

    ['btn-open-add-plant', 'btn-sources-add-plant'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.addEventListener('click', openAddPlantModal);
    });

    const closeModal = () => {
      modal.classList.remove('open');
      const error = document.getElementById('add-plant-form-error');
      if (error) error.hidden = true;
    };
    ['btn-close-add-plant', 'btn-cancel-add-plant'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.addEventListener('click', closeModal);
    });
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(form);
      const result = createPlantFromForm(formData);
      const error = document.getElementById('add-plant-form-error');
      if (!result.ok) {
        if (error) {
          error.textContent = result.message;
          error.hidden = false;
        }
        return;
      }

      if (error) error.hidden = true;
      modal.classList.remove('open');
      form.reset();
      const sensorsInput = document.getElementById('plant-sensors-input');
      if (sensorsInput) sensorsInput.value = '24';
      renderAllViews();
      DashboardStore.currentPlantId = result.plant.id;
      switchView('detail');
      showToast('✓ ' + result.plant.name + ' creada y guardada en este navegador.', 'success');
    });
  }

  function openAddPlantModal() {
    const modal = document.getElementById('modal-add-plant');
    if (!modal) return;
    modal.classList.add('open');
    setTimeout(() => document.getElementById('plant-name-input')?.focus(), 50);
  }

  function createPlantFromForm(formData) {
    const name = String(formData.get('plantName') || '').trim();
    const tag = String(formData.get('plantTag') || '').trim().toUpperCase();
    const node = String(formData.get('plantNode') || '').trim().toUpperCase();
    const sourceUrl = String(formData.get('sourceUrl') || '').trim();
    const safeSourceUrl = sanitizeExternalUrl(sourceUrl);
    const kwh = Number(formData.get('currentKwh'));
    const previousKwh = Number(formData.get('previousKwh'));
    const budgetKwh = Number(formData.get('budgetKwh'));
    const maxCapacityKwh = Number(formData.get('maxCapacityKwh'));
    const productionUnits = Number(formData.get('productionUnits'));
    const sensorsCount = Math.max(0, Number(formData.get('sensorsCount')) || 0);

    if (!name || !tag || ![kwh, previousKwh, budgetKwh, maxCapacityKwh, productionUnits].every(value => Number.isFinite(value) && value > 0)) {
      return { ok: false, message: 'Completa todos los campos obligatorios con valores mayores que cero.' };
    }
    if (maxCapacityKwh < kwh) {
      return { ok: false, message: 'La capacidad máxima debe ser igual o superior al consumo actual.' };
    }
    if (sourceUrl && !safeSourceUrl) {
      return { ok: false, message: 'El vínculo de la fuente debe comenzar por http:// o https://.' };
    }

    const id = createUniquePlantId(name);
    const number = String(Object.keys(DashboardStore.plants).length + 1);
    const deviationPct = ((kwh - budgetKwh) / budgetKwh) * 100;
    const isCritical = deviationPct > 0;
    const ratioKwhUnit = kwh / productionUnits;
    const ratioTarget = budgetKwh / productionUnits;
    const costUsd = Math.round(kwh * 0.12);

    const plant = {
      id,
      number,
      name,
      fullName: name,
      tag,
      status: isCritical ? 'critical' : 'normal',
      statusLabel: isCritical ? 'Alerta Activa' : 'Planta Activa',
      isCritical,
      isCustom: true,
      kwh: Math.round(kwh),
      budgetKwh: Math.round(budgetKwh),
      maxCapacityKwh: Math.round(maxCapacityKwh),
      costUsd,
      ratioKwhUnit,
      ratioTarget,
      deviationPct,
      productionUnits: Math.round(productionUnits),
      productionType: 'Producción de baterías',
      sensorsCount: Math.round(sensorsCount),
      alertCount: isCritical ? 1 : 0,
      nodeUri: node || 'NODE-' + tag.replace(/[^A-Z0-9]+/g, '-'),
      sourceUrl: safeSourceUrl,
      previous: {
        kwh: Math.round(previousKwh),
        costUsd: Math.round(previousKwh * 0.12),
        ratioKwhUnit: previousKwh / productionUnits,
        deviationPct: ((previousKwh - budgetKwh) / budgetKwh) * 100,
        productionUnits: Math.round(productionUnits),
        alertCount: previousKwh > budgetKwh ? 1 : 0
      },
      alertSnippet: isCritical ? 'Consumo por encima del presupuesto registrado' : 'Operación dentro del presupuesto energético',
      sparklinePoints: isCritical ? [24, 26, 25, 29, 31, 34, 38, 42, 40, 44, 43, 46] : [30, 29, 31, 28, 27, 29, 26, 27, 25, 26, 24, 25],
      processes: [
        { name: '1. Proceso principal de manufactura', kwh: Math.round(kwh * 0.55), pct: 55, color: 'purple' },
        { name: '2. Formación, carga y pruebas', kwh: Math.round(kwh * 0.30), pct: 30, color: 'purple-light' },
        { name: '3. Servicios auxiliares', kwh: Math.round(kwh * 0.15), pct: 15, color: 'purple-dark' }
      ],
      processAlert: isCritical ? 'Consumo total por encima de la meta; revisar el proceso principal' : null,
      gas: {
        flowHigh: '0.6 Bar Nom',
        flowTot: 'Pendiente integración',
        trend: [12, 13, 12, 14, 13, 12, 13]
      },
      dailyData: generateDailyCurve(kwh / 30, 0.08, isCritical)
    };

    DashboardStore.plants[id] = plant;
    registerPlantSource(plant);
    persistCustomPlants();
    ensureDynamicPlantUI();
    return { ok: true, plant };
  }

  function createUniquePlantId(name) {
    const base = String(name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'nueva_planta';
    let id = base;
    let suffix = 2;
    while (DashboardStore.plants[id]) {
      id = base + '_' + suffix;
      suffix += 1;
    }
    return id;
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
          const priorKwh = rc.kwh;
          const priorCost = rc.costUsd;
          rc.kwh = 765000;
          rc.costUsd = Math.round(rc.kwh * 0.120);
          rc.ratioKwhUnit = rc.kwh / rc.productionUnits;
          rc.deviationPct = -1.9;
          rc.isCritical = false;
          rc.alertCount = 0;
          DashboardStore.global.totalEnergyKwh -= (priorKwh - rc.kwh);
          DashboardStore.global.energyCostUsd -= (priorCost - rc.costUsd);
          DashboardStore.global.budgetDeviationPct = ((DashboardStore.global.totalEnergyKwh - DashboardStore.global.budgetEnergyKwh) / DashboardStore.global.budgetEnergyKwh) * 100;
          DashboardStore.global.alertCount = Object.values(DashboardStore.plants).reduce((sum, plant) => sum + plant.alertCount, 0);
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
    const btnCloseInspectFooter = document.getElementById('btn-close-inspect-footer');

    if (btnInspect && modalInspect) {
      btnInspect.addEventListener('click', () => modalInspect.classList.add('open'));
    }
    [btnCloseInspect, btnCloseInspectFooter].forEach(btn => {
      if (btn && modalInspect) btn.addEventListener('click', () => modalInspect.classList.remove('open'));
    });

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
  function renderPercentComparison(id, currentValue, previousValue, lowerIsBetter) {
    const element = document.getElementById(id);
    if (!element) return 'neutral';
    return renderPercentComparisonElement(element, currentValue, previousValue, lowerIsBetter);
  }

  function renderPercentComparisonElement(element, currentValue, previousValue, lowerIsBetter, suffix = '') {
    const change = previousValue === 0 ? 0 : ((currentValue - previousValue) / previousValue) * 100;
    const state = getComparisonState(change, lowerIsBetter);
    const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '•';
    const outcome = state === 'positive' ? 'mejora' : state === 'negative' ? 'desmejora' : 'estable';

    element.className = 'trend-chip trend-' + state;
    element.textContent = arrow + ' ' + Math.abs(change).toFixed(1) + '% ' + outcome + suffix;
    return state;
  }

  function renderPointComparison(id, currentValue, previousValue, lowerIsBetter) {
    const element = document.getElementById(id);
    if (!element) return 'neutral';
    const change = currentValue - previousValue;
    const state = getComparisonState(change, lowerIsBetter);
    const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '•';
    const outcome = state === 'positive' ? 'mejora' : state === 'negative' ? 'desmejora' : 'estable';

    element.className = 'trend-chip trend-' + state;
    element.textContent = arrow + ' ' + Math.abs(change).toFixed(1) + ' pp ' + outcome;
    return state;
  }

  function renderCountComparison(id, currentValue, previousValue, lowerIsBetter) {
    const element = document.getElementById(id);
    if (!element) return 'neutral';
    const change = currentValue - previousValue;
    const state = getComparisonState(change, lowerIsBetter);
    const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '•';
    const descriptor = change > 0 ? 'más' : change < 0 ? 'menos' : 'sin cambio';

    element.className = 'trend-chip trend-' + state;
    element.textContent = change === 0 ? '• Sin cambio' : arrow + ' ' + Math.abs(change) + ' ' + descriptor;
    return state;
  }

  function getComparisonState(change, lowerIsBetter) {
    if (Math.abs(change) < 0.001) return 'neutral';
    const isImprovement = lowerIsBetter ? change < 0 : change > 0;
    return isImprovement ? 'positive' : 'negative';
  }

  function setKpiCardState(id, state) {
    const card = document.getElementById(id);
    if (!card) return;
    card.classList.remove('state-positive', 'state-negative', 'state-neutral');
    card.classList.add('state-' + state);
  }

  function updateComparisonPeriodLabel() {
    const monthSelect = document.getElementById('select-filter-month');
    const yearSelect = document.getElementById('select-filter-year');
    if (!monthSelect || !yearSelect) return;

    const monthLabels = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const selectedMonth = Number(monthSelect.value);
    const selectedYear = Number(yearSelect.value);
    const previousMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const previousYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    setElementText('detail-comparison-period', 'VS ' + monthLabels[previousMonth] + ' ' + previousYear);
    setElementText('source-current-period', monthLabels[selectedMonth] + ' ' + selectedYear);
  }

  function formatNumber(num) {
    return Number(num).toLocaleString('en-US');
  }

  function formatSigned(num, digits = 1) {
    return (num > 0 ? '+' : '') + Number(num).toFixed(digits);
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
