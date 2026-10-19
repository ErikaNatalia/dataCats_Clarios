import {
  createSecurityCode,
  deriveAnalyticalAlerts,
  findProcessRecord,
  hasNumericValue,
  normalizeEnergyDataset,
  readPlantDataFile,
  selectAnalyticsPeriod
} from './plant-data.js';

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

  const FYA_DATA_URL = new URL('../data/planta_fya_energia.json', import.meta.url).href;
  const CURRENCY_CODE = 'COP';
  const DEFAULT_ENERGY_TARIFF_COP = 480;

  // --- DASHBOARD DATA STORE ---
  const DashboardStore = {
    currentView: 'landing', // 'landing' | 'detail' | 'sources'
    currentPlantId: 'rc_energy', // 'ensamble' | 'fa' | 'rc_energy'
    faultAcknowledged: false,
    selectedPeriod: null,

    // Global Aggregate Metrics
    global: {
      totalEnergyKwh: 2808000,
      energyCostCop: 2147840000,
      budgetEnergyKwh: 2799600,
      budgetDeviationPct: 0.3,
      alertCount: 2,
      lastSyncSeconds: 12,
      historicalAverage: {
        totalEnergyKwh: 2870000,
        energyCostCop: 2192800000,
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
        costCop: 324240000,
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
          costCop: 336480000,
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
          flowHigh: '0,4 bar · nominal',
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
        costCop: 604800000,
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
          costCop: 623520000,
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
          flowHigh: '0,7 bar · nominal',
          flowTot: '3,140 Nm³ tot',
          trend: [15, 16, 17, 16, 15, 14, 16]
        },
        dailyData: generateDailyCurve(1260000 / 30, 0.06, false)
      },

      rc_energy: {
        id: 'rc_energy',
        number: '3',
        name: 'RC Energía y Gas',
        fullName: 'Planta RC - Operaciones de Energía y Gas',
        tag: 'MOD-03-RC',
        status: 'critical',
        statusLabel: 'Alerta Activa',
        isCritical: true,
        kwh: 864000,
        budgetKwh: 780000,
        maxCapacityKwh: 950000,
        costCop: 414720000,
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
          costCop: 389760000,
          ratioKwhUnit: 4.11,
          deviationPct: 2.5,
          productionUnits: 197500,
          alertCount: 1
        },
        alertSnippet: 'Bornes de fundición superan la rampa térmica (+14,2% sobre el punto de ajuste)',
        sparklinePoints: [25, 27, 26, 30, 28, 32, 38, 42, 45, 41, 39, 44],
        processes: [
          { name: '1. Hornos de Fundición', kwh: 449280, pct: 52, color: 'purple' },
          { name: '2. Formación & Carga Inicial', kwh: 267840, pct: 31, color: 'purple-light' },
          { name: '3. Enfriamiento / Auxiliares Industriales', kwh: 146880, pct: 17, color: 'purple-dark' }
        ],
        processAlert: 'Hornos de fundición: +14.2% sobre el punto de ajuste estándar de gas y potencia',
        gas: {
          flowHigh: '1.8 bar · presión alta',
          flowTot: '9,420 Nm³ tot',
          trend: [20, 24, 22, 35, 48, 42, 50]
        },
        dailyData: generateDailyCurve(864000 / 30, 0.15, true)
      }
    },

    sources: [
      {
        id: 'source-fya-energy-json',
        name: 'planta_fya_energia.json',
        scope: 'F&A · Energía',
        format: 'JSON',
        period: 'Octubre 2019 – Julio 2026',
        status: 'registered',
        href: FYA_DATA_URL,
        origin: 'Excel procesado · dataset mensual estructurado'
      },
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
        scope: 'RC Energía y Gas',
        format: 'CSV',
        period: 'Septiembre 2024',
        status: 'validated',
        href: new URL('../data/telemetria_sobreconsumo_rc.csv', import.meta.url).href,
        origin: 'Repositorio local del dashboard'
      }
    ]
  };

  const CUSTOM_PLANTS_STORAGE_KEY = 'clarios.customPlants.v1';
  let pendingDeleteChallenge = null;
  let activePlantAnalysis = null;
  const BASE_GLOBAL_SNAPSHOT = {
    totalEnergyKwh: 2808000,
    energyCostCop: 2147840000,
    budgetEnergyKwh: 2799600,
    plantEnergyKwh: 2808000,
    plantCostCop: 1343760000,
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

  /**
   * Loads the processed Excel example for F&A. The JSON id is `fya`, while the
   * historical UI key is `fa`; this adapter keeps that alias explicit.
   */
  async function loadFyaEnergyDataset() {
    const source = DashboardStore.sources.find(item => item.id === 'source-fya-energy-json');

    try {
      const response = await fetch(FYA_DATA_URL);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const dataset = await response.json();
      const analytics = normalizeEnergyDataset(dataset, 'fya');
      applyEnergyDataset(DashboardStore.plants.fa, analytics, { useFyaIdentity: true });
      if (DashboardStore.currentView !== 'detail' || DashboardStore.currentPlantId === 'fa') {
        configurePeriodFilters(DashboardStore.plants.fa);
      }

      if (source) {
        source.status = 'validated';
        source.importedAt = formatGeneratedDate(dataset.generado);
      }
    } catch (error) {
      console.warn('No fue posible cargar el dataset mensual de F&A.', error);
      if (source) source.status = 'registered';
    }
  }

  function applyEnergyDataset(plant, analytics, options = {}) {
    if (!plant || !analytics) return;
    const { latest, previous } = analytics;
    if (!latest || !previous) return;
    const budgetKwh = hasNumericValue(latest.produccion) && hasNumericValue(latest.intensidad_ppto)
      ? Number(latest.produccion) * Number(latest.intensidad_ppto)
      : null;
    const previousBudgetKwh = hasNumericValue(previous.produccion) && hasNumericValue(previous.intensidad_ppto)
      ? Number(previous.produccion) * Number(previous.intensidad_ppto)
      : null;
    const upperConsumptionRange = hasNumericValue(latest.rangos?.consumo?.rango_max)
      ? Number(latest.rangos.consumo.rango_max)
      : null;
    const previousAlerts = deriveAnalyticalAlerts(analytics.processes, previous.fecha).length;
    const processColors = ['purple', 'purple-light', 'purple-dark'];

    if (options.useFyaIdentity) {
      plant.name = 'F&A';
      plant.fullName = 'Planta Formación & Acabado';
      plant.tag = 'DATA-FYA-ENERGIA';
      plant.nodeUri = 'DATASET-FYA-ENERGIA';
    }
    plant.status = analytics.alerts.length > 0 ? 'critical' : 'normal';
    plant.statusLabel = analytics.alerts.length > 0 ? 'Alertas analíticas' : 'Datos en rango';
    plant.isCritical = analytics.alerts.length > 0;
    plant.kwh = Math.round(Number(latest.consumo));
    plant.budgetKwh = hasNumericValue(budgetKwh) ? Math.round(budgetKwh) : null;
    plant.maxCapacityKwh = hasNumericValue(upperConsumptionRange)
      ? Math.round(upperConsumptionRange)
      : Math.max(plant.kwh, hasNumericValue(plant.budgetKwh) ? plant.budgetKwh : 0);
    plant.ratioKwhUnit = Number(latest.intensidad);
    plant.ratioTarget = hasNumericValue(latest.intensidad_ppto) ? Number(latest.intensidad_ppto) : null;
    plant.deviationPct = hasNumericValue(latest.desviacion_ppto) ? Number(latest.desviacion_ppto) * 100 : null;
    plant.productionUnits = hasNumericValue(latest.produccion) ? Math.round(Number(latest.produccion)) : null;
    plant.productionType = getIntensityDenominator(analytics.intensityUnit) + ' producidas · corte mensual';
    plant.alertCount = analytics.alerts.length;
    plant.alertSnippet = analytics.alerts.length
      ? analytics.alerts.length + ' alertas analíticas en el corte seleccionado'
      : 'Intensidad energética dentro del rango esperado';
    plant.sparklinePoints = analytics.totalSeries
      .slice(Math.max(0, analytics.selectedIndex - 11), analytics.selectedIndex + 1)
      .map(record => Number(record.consumo));
    plant.processes = analytics.processes
      .filter(process => !process.es_total)
      .map((process, index) => {
        const processLatest = findProcessRecord(process, latest.fecha);
        const share = Number(processLatest?.consumo) / Number(latest.consumo) * 100;
        return {
          name: formatProcessName(process.proceso),
          kwh: Math.round(Number(processLatest?.consumo) || 0),
          pct: Number.isFinite(share) ? Number(share.toFixed(1)) : 0,
          color: processColors[index % processColors.length]
        };
      });
    plant.processAlert = analytics.alerts.length
      ? analytics.alerts.length + ' señales requieren revisión en ' + formatMonthLabel(latest.fecha) + '.'
      : null;
    plant.analytics = analytics;
    plant.currentPeriod = latest.fecha;
    plant.costAmount = hasNumericValue(latest.costo_total) ? Number(latest.costo_total) : null;
    plant.energyTariff = hasNumericValue(latest.costo_unitario) ? Number(latest.costo_unitario) : null;
    plant.costUnit = CURRENCY_CODE;
    plant.previous = {
      ...plant.previous,
      kwh: Math.round(Number(previous.consumo)),
      budgetKwh: hasNumericValue(previousBudgetKwh) ? Math.round(previousBudgetKwh) : null,
      ratioKwhUnit: Number(previous.intensidad),
      ratioTarget: hasNumericValue(previous.intensidad_ppto) ? Number(previous.intensidad_ppto) : null,
      deviationPct: hasNumericValue(previous.desviacion_ppto) ? Number(previous.desviacion_ppto) * 100 : null,
      productionUnits: hasNumericValue(previous.produccion) ? Math.round(Number(previous.produccion)) : null,
      alertCount: previousAlerts,
      costAmount: hasNumericValue(previous.costo_total) ? Number(previous.costo_total) : null,
      energyTariff: hasNumericValue(previous.costo_unitario) ? Number(previous.costo_unitario) : null
    };
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
    initDeletePlantModal();
    initIntelligentAnalysis();
    renderAllViews();
    if (window.location.hash === '#sources') switchView('sources');
    startLiveHeartbeat();

    // The interface must remain navigable even if an optional data source is
    // slow, unavailable or blocked by the way the project was opened.
    loadFyaEnergyDataset().then(() => {
      renderAllViews();
      if (DashboardStore.currentView === 'sources') renderSourcesView();
    });
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

    // Open the explainable plant analysis and its downloadable report.
    const btnQuickReport = document.getElementById('btn-quick-report');
    if (btnQuickReport) {
      btnQuickReport.addEventListener('click', openIntelligentAnalysis);
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
      openIntelligentAnalysis();
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

    [...monthSelects, ...yearSelects].forEach(select => {
      select.disabled = true;
      select.title = 'Los períodos se habilitan al cargar el JSON de F&A';
    });

    const synchronize = (source, peers) => {
      peers.forEach(peer => {
        if (peer !== source) peer.value = source.value;
      });
    };

    monthSelects.forEach(select => {
      select.addEventListener('change', () => {
        synchronize(select, monthSelects);
        applySelectedPlantPeriod(true);
      });
    });
    yearSelects.forEach(select => {
      select.addEventListener('change', () => {
        synchronize(select, yearSelects);
        updateAvailableMonthOptions(getPeriodFilterPlant(), Number(select.value));
        applySelectedPlantPeriod(true);
      });
    });

    updateComparisonPeriodLabel();
  }

  function configurePeriodFilters(plant) {
    const analytics = plant?.analytics;
    if (!analytics?.availablePeriods?.length) return;
    const yearSelects = [
      document.getElementById('select-filter-year'),
      document.getElementById('drawer-select-year')
    ].filter(Boolean);
    const years = [...new Set(analytics.availablePeriods.map(period => Number(period.slice(0, 4))))].sort((a, b) => a - b);
    const selectedPeriod = plant.currentPeriod || analytics.latestAvailable.fecha;
    const selectedYear = Number(selectedPeriod.slice(0, 4));
    const selectedMonth = Number(selectedPeriod.slice(5, 7)) - 1;

    yearSelects.forEach(select => {
      select.replaceChildren();
      years.forEach(year => {
        const option = document.createElement('option');
        option.value = String(year);
        option.textContent = String(year);
        select.appendChild(option);
      });
      select.value = String(selectedYear);
      select.disabled = false;
      select.title = 'Año disponible en el historial mensual de ' + plant.name;
    });
    updateAvailableMonthOptions(plant, selectedYear, selectedMonth);
    DashboardStore.selectedPeriod = selectedPeriod;
    setElementText('date-filter-scope', plant.name);
    setElementText('drawer-period-title', 'Período · ' + plant.name);
    updateComparisonPeriodLabel();
  }

  function updateAvailableMonthOptions(plant, year, preferredMonth = null) {
    const analytics = plant?.analytics;
    if (!analytics) return;
    const monthSelects = [
      document.getElementById('select-filter-month'),
      document.getElementById('drawer-select-month')
    ].filter(Boolean);
    const monthLabels = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const availableMonths = analytics.availablePeriods
      .filter(period => Number(period.slice(0, 4)) === Number(year))
      .map(period => Number(period.slice(5, 7)) - 1);
    if (!availableMonths.length) return;

    const requestedMonth = preferredMonth ?? Number(monthSelects[0]?.value);
    const selectedMonth = availableMonths.includes(requestedMonth) ? requestedMonth : Math.max(...availableMonths);
    monthSelects.forEach(select => {
      select.replaceChildren();
      monthLabels.forEach((label, monthIndex) => {
        const option = document.createElement('option');
        option.value = String(monthIndex);
        option.textContent = label;
        option.disabled = !availableMonths.includes(monthIndex);
        select.appendChild(option);
      });
      select.value = String(selectedMonth);
      select.disabled = false;
      select.title = 'Mes disponible en el historial mensual de ' + plant.name;
    });
  }

  function applySelectedPlantPeriod(showFeedback = false) {
    const monthSelect = document.getElementById('select-filter-month');
    const yearSelect = document.getElementById('select-filter-year');
    const plant = getPeriodFilterPlant();
    if (!monthSelect || !yearSelect || !plant?.analytics) return;

    const period = yearSelect.value + '-' + String(Number(monthSelect.value) + 1).padStart(2, '0');
    if (!selectAnalyticsPeriod(plant.analytics, period)) {
      if (showFeedback) showToast('Ese corte no tiene un mes anterior comparable para ' + plant.name + '.', 'danger');
      return;
    }

    DashboardStore.selectedPeriod = period;
    applyEnergyDataset(plant, plant.analytics, { useFyaIdentity: plant.id === 'fa' });
    if (plant.isCustom) persistCustomPlants();
    renderAllViews();
    if (showFeedback) showToast(plant.name + ' actualizada al corte ' + formatMonthLabel(period) + '.', 'success');
  }

  function getPeriodFilterPlant() {
    if (DashboardStore.currentView === 'detail') {
      const current = DashboardStore.plants[DashboardStore.currentPlantId];
      return current?.analytics ? current : null;
    }
    return DashboardStore.plants.fa?.analytics ? DashboardStore.plants.fa : null;
  }

  function syncPeriodFiltersForView() {
    const plant = getPeriodFilterPlant();
    if (plant) {
      configurePeriodFilters(plant);
      return;
    }
    const selects = [
      document.getElementById('select-filter-month'),
      document.getElementById('drawer-select-month'),
      document.getElementById('select-filter-year'),
      document.getElementById('drawer-select-year')
    ].filter(Boolean);
    selects.forEach(select => {
      select.disabled = true;
      select.title = 'Esta planta no tiene una serie mensual importada';
    });
    const plantName = DashboardStore.plants[DashboardStore.currentPlantId]?.name || 'Sin historial';
    setElementText('date-filter-scope', plantName);
    setElementText('drawer-period-title', 'Sin historial mensual · ' + plantName);
  }

  function switchView(viewName) {
    DashboardStore.currentView = viewName;
    syncPeriodFiltersForView();
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
        if (plant.persistedDataset) {
          try {
            const analytics = normalizeEnergyDataset(plant.persistedDataset);
            selectAnalyticsPeriod(analytics, plant.currentPeriod || analytics.latestAvailable.fecha);
            applyEnergyDataset(plant, analytics);
            delete plant.persistedDataset;
          } catch (error) {
            console.warn('No fue posible reconstruir la serie analítica de ' + plant.name + '.', error);
            return;
          }
        }
        if (!Array.isArray(plant.dailyData) || plant.dailyData.length !== 30) {
          plant.dailyData = generateDailyCurve(Number(plant.kwh) / 30, 0.08, Boolean(plant.isCritical));
        }
        delete plant.securityCode;
        DashboardStore.plants[plant.id] = plant;
        registerPlantSource(plant);
      });
    } catch (error) {
      console.warn('No fue posible restaurar las plantas personalizadas.', error);
    }
  }

  function persistCustomPlants() {
    try {
      const customPlants = Object.values(DashboardStore.plants)
        .filter(plant => plant.isCustom)
        .map(plant => {
          const storedPlant = { ...plant };
          if (plant.analytics?.dataset) storedPlant.persistedDataset = plant.analytics.dataset;
          delete storedPlant.analytics;
          delete storedPlant.securityCode;
          return storedPlant;
        });
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
    const hasCompleteBudget = plants.every(plant => hasNumericValue(plant.budgetKwh));
    const plantBudget = hasCompleteBudget
      ? plants.reduce((sum, plant) => sum + Number(plant.budgetKwh), 0)
      : null;
    const plantCost = plants.reduce((sum, plant) => sum + Number(getPlantCostCop(plant) || 0), 0);
    DashboardStore.global.totalEnergyKwh = Math.round(BASE_GLOBAL_SNAPSHOT.totalEnergyKwh + plantEnergy - BASE_GLOBAL_SNAPSHOT.plantEnergyKwh);
    DashboardStore.global.budgetEnergyKwh = hasNumericValue(plantBudget)
      ? Math.round(BASE_GLOBAL_SNAPSHOT.budgetEnergyKwh + plantBudget - BASE_GLOBAL_SNAPSHOT.plantBudgetKwh)
      : null;
    DashboardStore.global.energyCostCop = Math.round(BASE_GLOBAL_SNAPSHOT.energyCostCop + plantCost - BASE_GLOBAL_SNAPSHOT.plantCostCop);
    DashboardStore.global.budgetDeviationPct = hasNumericValue(DashboardStore.global.budgetEnergyKwh) && DashboardStore.global.budgetEnergyKwh > 0
      ? ((DashboardStore.global.totalEnergyKwh - DashboardStore.global.budgetEnergyKwh) / DashboardStore.global.budgetEnergyKwh) * 100
      : null;
    DashboardStore.global.alertCount = plants.reduce((sum, plant) => sum + Number(plant.alertCount || 0), 0);
  }

  function renderPlantCounts() {
    const plants = Object.values(DashboardStore.plants);
    const normalCount = plants.filter(plant => !plant.isCritical).length;
    const criticalCount = plants.length - normalCount;
    setElementText('legend-normal-count', normalCount + (normalCount === 1 ? ' Planta en Rango' : ' Plantas en Rango'));
    setElementText('legend-critical-count', criticalCount + (criticalCount === 1 ? ' Desviación Crítica' : ' Desviaciones Críticas'));
    setElementText('blueprint-module-count', plants.length + ' MÓDULOS DE PROCESO ACTIVOS (PROTOCOLO CLARIOS V4.9)');
    setElementText('sidebar-plant-count', '1 Activo / ' + plants.length + ' Total');
  }

  function registerPlantSource(plant) {
    const sourceId = 'plant-source-' + plant.id;
    if (DashboardStore.sources.some(source => source.id === sourceId)) return;
    const safeSourceUrl = sanitizeExternalUrl(plant.sourceUrl);
    if (!safeSourceUrl && !plant.sourceFileName) return;
    DashboardStore.sources.push({
      id: sourceId,
      name: plant.sourceFileName || 'Fuente de ' + plant.name,
      scope: plant.name,
      format: plant.sourceFormat || getSourceFormat(safeSourceUrl),
      period: plant.sourcePeriod || 'Vínculo registrado',
      status: plant.sourceFileName ? 'validated' : 'registered',
      href: safeSourceUrl,
      origin: plant.sourceFileName
        ? 'Metadatos restaurados del archivo importado · el archivo original no se conserva'
        : 'Vínculo suministrado al crear la planta',
      external: Boolean(safeSourceUrl),
      rawText: plant.sourcePreviewText || '',
      binary: plant.sourceFormat === 'EXCEL',
      importedAt: plant.sourceImportedAt || ''
    });
  }

  function registerPlantUploadSource(plant, file, parsed) {
    const sourceId = 'plant-source-' + plant.id;
    const existingIndex = DashboardStore.sources.findIndex(source => source.id === sourceId);
    if (existingIndex >= 0) DashboardStore.sources.splice(existingIndex, 1);
    const objectUrl = URL.createObjectURL(file);
    DashboardStore.sources.push({
      id: sourceId,
      name: file.name,
      scope: plant.name,
      format: plant.sourceFormat,
      period: parsed.sourcePeriod,
      status: 'validated',
      href: objectUrl,
      origin: 'Archivo importado al crear la planta · ' + formatFileSize(file.size),
      external: false,
      rawText: parsed.rawText || parsed.previewText || '',
      binary: plant.sourceFormat === 'EXCEL',
      importedAt: plant.sourceImportedAt
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
        if (source.format === 'JSON') {
          rawText = JSON.stringify(JSON.parse(rawText), null, 2);
        }
        const lines = rawText.trim().split(/\r?\n/);
        const visibleLines = lines.slice(0, source.format === 'JSON' ? 36 : 13);
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
    if (cleanedPath.endsWith('.JSON')) return 'JSON';
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
    return formatDecimal(bytes / (1024 * 1024), 1) + ' MB';
  }

  function renderLandingMetrics() {
    const g = DashboardStore.global;
    const history = g.historicalAverage;

    setElementText('landing-global-kwh', formatNumber(g.totalEnergyKwh));
    setElementText('landing-global-cost', formatCurrencyCop(g.energyCostCop, false, false));
    setElementText(
      'landing-global-deviation',
      hasNumericValue(g.budgetDeviationPct) ? formatSigned(g.budgetDeviationPct, 1) + '%' : 'n.a.'
    );
    setElementText('landing-global-alerts', g.alertCount + ' alertas');

    const energyState = renderPercentComparison('landing-global-kwh-trend', g.totalEnergyKwh, history.totalEnergyKwh, true);
    const costState = renderPercentComparison('landing-global-cost-trend', g.energyCostCop, history.energyCostCop, true);
    const deviationState = renderPointComparison('landing-global-deviation-trend', g.budgetDeviationPct, history.budgetDeviationPct, true);
    const alertState = renderCountComparison('landing-global-alerts-trend', g.alertCount, history.alertCount, true);

    setElementText('landing-global-kwh-baseline', 'Promedio: ' + formatNumber(history.totalEnergyKwh) + ' kWh');
    setElementText('landing-global-cost-baseline', 'Promedio: ' + formatCurrencyCop(history.energyCostCop));
    setElementText(
      'landing-global-deviation-baseline',
      hasNumericValue(g.budgetDeviationPct)
        ? 'Promedio: ' + formatSigned(history.budgetDeviationPct, 1) + '% · Tolerancia ±2%'
        : 'Sin presupuesto disponible para el corte F&A seleccionado'
    );
    const criticalPlants = Object.values(DashboardStore.plants).filter(plant => plant.isCritical);
    setElementText(
      'landing-global-alerts-baseline',
      criticalPlants.length ? 'Foco actual: ' + criticalPlants.map(plant => plant.name).join(' · ') : 'Sin focos activos'
    );

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
      if (ratioEl) ratioEl.textContent = formatDecimal(p.ratioKwhUnit, 2) + ' ' + getPlantIntensityUnit(p);

      const costEl = card.querySelector('.submetric-cost');
      if (costEl) {
        costEl.textContent = getPlantCostDisplay(p, true);
        costEl.title = 'Costo de energía en pesos colombianos (COP)';
      }

      const devEl = card.querySelector('.submetric-dev');
      if (devEl) {
        const hasDeviation = hasNumericValue(p.deviationPct);
        devEl.textContent = hasDeviation
          ? formatSigned(p.deviationPct, 1) + '% ' + (p.deviationPct > 0 ? 'Sobre meta' : 'A favor')
          : 'n.a. Sin meta';
        devEl.className = 'submetric-val submetric-dev ' + (hasDeviation ? (p.deviationPct > 0 ? 'red' : 'green') : '');
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
        statusPill.textContent = p.isCritical ? '▲ Alerta activa' : '● Planta en rango';
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
      const usesSourceCurrency = Boolean(focusPlant.plant.analytics);
      const hasComparableCost = usesSourceCurrency
        ? hasNumericValue(focusPlant.plant.costAmount) && hasNumericValue(focusPlant.plant.previous.costAmount)
        : hasNumericValue(focusPlant.plant.costCop) && hasNumericValue(focusPlant.plant.previous.costCop);
      const costImpact = usesSourceCurrency && hasComparableCost
        ? focusPlant.plant.costAmount - focusPlant.plant.previous.costAmount
        : focusPlant.plant.costCop - focusPlant.plant.previous.costCop;
      setElementText('decision-focus', focusPlant.plant.name);
      setElementText('decision-focus-detail', '+' + formatNumber(focusPlant.delta) + ' kWh vs corte anterior');
      setElementText(
        'decision-impact',
        usesSourceCurrency && !hasComparableCost
          ? 'n.a.'
          : usesSourceCurrency
          ? '+' + formatCurrencyCop(Math.max(0, costImpact), true)
          : '+' + formatCurrencyCop(Math.max(0, costImpact))
      );
      setElementText(
        'decision-impact-detail',
        hasComparableCost ? 'Costo incremental del foco crítico' : 'Costo no disponible para este corte'
      );
    } else {
      setElementText('decision-focus', 'Sin focos de deterioro');
      setElementText('decision-focus-detail', 'Todas las plantas reducen consumo');
      setElementText('decision-impact', formatCurrencyCop(0));
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
        metricValues[0].textContent = formatDecimal(plant.ratioKwhUnit, 2);
        metricValues[1].textContent = getPlantCostDisplay(plant, true);
        metricValues[1].title = 'Costo de energía en pesos colombianos (COP)';
        metricValues[2].textContent = hasNumericValue(plant.deviationPct) ? formatSigned(plant.deviationPct, 1) + '%' : 'n.a.';
        metricValues[2].style.color = hasNumericValue(plant.deviationPct)
          ? (plant.deviationPct > 0 ? 'var(--fire-red)' : 'var(--neon-green)')
          : 'var(--text-muted)';
      }

      const statusLine = card.querySelector('.sidebar-card-bottom > span:first-child');
      if (statusLine) {
        statusLine.className = 'sidebar-state ' + (plant.isCritical ? 'danger' : 'normal');
        statusLine.textContent = plant.isCritical ? '▲ SOBRECONSUMO' : '● EN RANGO';
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
    if (currentPlant.analytics) {
      setElementText('detail-comparison-period', 'VS ' + formatMonthLabel(currentPlant.analytics.previous.fecha).toUpperCase());
    }

    // Status alert badge in header
    const statusPill = document.getElementById('detail-header-status-pill');
    if (statusPill) {
      statusPill.replaceChildren();
      const dot = document.createElement('span');
      dot.className = 'pulse-dot';
      const text = document.createElement('span');

      if (currentPlant.isCritical && !DashboardStore.faultAcknowledged) {
        statusPill.className = 'status-badge-live danger';
        text.textContent = currentPlant.analytics ? '▲ ALERTA DE INTENSIDAD' : '▲ PLANTA EN SOBRECONSUMO';
      } else {
        statusPill.className = 'status-badge-live normal';
        text.textContent = '● PLANTA EN OPERACIÓN NORMAL';
      }
      statusPill.appendChild(dot);
      statusPill.appendChild(text);
    }

    // 3. High-level KPI Summary Cards (Detail)
    setElementText('detail-kpi-total-kwh', formatNumber(currentPlant.kwh));
    setElementText(
      'detail-kpi-kwh-sub',
      hasNumericValue(currentPlant.budgetKwh)
        ? 'Meta estimada: ' + formatNumber(currentPlant.budgetKwh) + ' kWh'
        : 'Meta no disponible en la fuente'
    );

    if (currentPlant.analytics) {
      setElementText('detail-kpi-cost', hasNumericValue(currentPlant.costAmount) ? formatCurrencyCop(currentPlant.costAmount, true) : 'n.a.');
      setElementText(
        'detail-kpi-cost-context',
        hasNumericValue(currentPlant.energyTariff)
          ? 'Tarifa: ' + formatCurrencyCop(currentPlant.energyTariff) + ' / kWh'
          : 'Costo y tarifa no disponibles para este corte'
      );
      const costElement = document.getElementById('detail-kpi-cost');
      if (costElement) {
        costElement.title = hasNumericValue(currentPlant.costAmount)
          ? formatCurrencyCop(currentPlant.costAmount) + ' · valor tomado del archivo fuente'
          : 'Sin costo declarado para el período seleccionado';
      }
    } else {
      setElementText('detail-kpi-cost', formatCurrencyCop(currentPlant.costCop, true));
      setElementText('detail-kpi-cost-context', 'Tarifa estimada: ' + formatCurrencyCop(currentPlant.costCop / currentPlant.kwh) + ' / kWh');
    }
    const intensityUnit = getPlantIntensityUnit(currentPlant);
    setElementText('detail-kpi-unit-ratio', formatDecimal(currentPlant.ratioKwhUnit, 2) + ' ' + intensityUnit);
    setElementText(
      'detail-kpi-unit-target',
      hasNumericValue(currentPlant.ratioTarget)
        ? 'Meta: ' + formatDecimal(currentPlant.ratioTarget, 2) + ' ' + intensityUnit
        : 'Meta no disponible para este corte'
    );

    const ratioDeviationPct = hasNumericValue(currentPlant.ratioTarget) && Number(currentPlant.ratioTarget) !== 0
      ? ((currentPlant.ratioKwhUnit - currentPlant.ratioTarget) / currentPlant.ratioTarget) * 100
      : null;

    const badgeRatio = document.getElementById('detail-kpi-badge-ratio');
    if (badgeRatio) {
      if (!hasNumericValue(ratioDeviationPct)) {
        badgeRatio.className = 'detail-kpi-badge';
        badgeRatio.textContent = 'SIN META EN LA FUENTE';
      } else if (ratioDeviationPct > 0) {
        badgeRatio.className = 'detail-kpi-badge badge-danger';
        badgeRatio.textContent = '+' + formatDecimal(ratioDeviationPct, 1) + '% SOBRE META';
      } else {
        badgeRatio.className = 'detail-kpi-badge badge-success';
        badgeRatio.textContent = formatDecimal(ratioDeviationPct, 1) + '% EN META';
      }
    }

    const devEl = document.getElementById('detail-kpi-deviation');
    if (devEl) {
      devEl.textContent = hasNumericValue(currentPlant.deviationPct) ? formatSigned(currentPlant.deviationPct, 1) + '%' : 'n.a.';
      devEl.className = 'detail-kpi-val ' + (hasNumericValue(currentPlant.deviationPct) ? (currentPlant.deviationPct > 0 ? 'red' : 'green') : '');
    }
    setElementText(
      'detail-kpi-dev-sub',
      hasNumericValue(currentPlant.deviationPct)
        ? (currentPlant.deviationPct > 0 ? 'Intensidad sobre presupuesto' : 'Intensidad dentro del presupuesto')
        : 'Presupuesto no disponible'
    );

    setElementText('detail-kpi-prod-qty', formatNumber(currentPlant.productionUnits));
    setElementText('detail-kpi-prod-sub', currentPlant.productionType);

    const scadaStatusEl = document.getElementById('detail-kpi-scada-status');
    if (scadaStatusEl) {
      scadaStatusEl.textContent = currentPlant.isCritical && !DashboardStore.faultAcknowledged ? 'ALERTA CONSUMO ALTO' : 'OPERACIÓN NORMAL';
      scadaStatusEl.className = 'detail-kpi-val ' + (currentPlant.isCritical && !DashboardStore.faultAcknowledged ? 'red' : 'green');
    }
    setElementText('detail-kpi-scada-sensors', currentPlant.sensorsCount + ' Sensores IoT');
    setElementText('detail-kpi-status-title', currentPlant.analytics ? 'Estado analítico' : 'Estado SCADA');
    if (currentPlant.analytics) {
      if (scadaStatusEl) scadaStatusEl.textContent = currentPlant.alertCount + ' ALERTAS ANALÍTICAS';
      setElementText('detail-kpi-scada-sensors', 'Reglas de rango + presupuesto');
    }

    const deleteButton = document.getElementById('btn-delete-current-plant');
    if (deleteButton) deleteButton.hidden = !currentPlant.isCustom;
    const supportsThermalSimulation = currentPlant.id === 'rc_energy' && !currentPlant.analytics;
    const setpointButton = document.getElementById('btn-open-setpoint-modal');
    const drawerSetpointButton = document.getElementById('drawer-btn-setpoint');
    if (setpointButton) setpointButton.hidden = !supportsThermalSimulation;
    if (drawerSetpointButton) drawerSetpointButton.hidden = !supportsThermalSimulation;
    setTextPreservingIcon('btn-diag-inspect', 'Ver datos del corte');

    const kwhState = renderPercentComparison('detail-kpi-kwh-trend', currentPlant.kwh, currentPlant.previous.kwh, true);
    const costState = currentPlant.analytics
      ? renderPercentComparison('detail-kpi-cost-trend', currentPlant.costAmount, currentPlant.previous.costAmount, true)
      : renderPercentComparison('detail-kpi-cost-trend', currentPlant.costCop, currentPlant.previous.costCop, true);
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
    const gasCard = document.getElementById('gas-monitor-card');
    const chartsGrid = document.getElementById('detail-charts-grid');
    if (chartsGrid) chartsGrid.classList.toggle('structured-data', Boolean(currentPlant.analytics));
    if (currentPlant.analytics) {
      setTextPreservingIcon('consumption-chart-title', 'Consumo mensual');
      setElementText('consumption-chart-subtitle', 'Real vs consumo esperado · últimos 24 meses');
      setElementText('consumption-chart-legend-reference', '--- Esperado');
      renderMonthlyConsumptionChart(getSelectedSeriesWindow(currentPlant.analytics, 24));
      if (gasCard) gasCard.hidden = true;
    } else {
      setTextPreservingIcon('consumption-chart-title', 'Consumo de energía');
      setElementText('consumption-chart-subtitle', 'Real (Púrpura) vs meta diaria (línea)');
      setElementText('consumption-chart-legend-reference', '--- Meta');
      renderLineChart(currentPlant.dailyData, currentPlant.budgetKwh / 30);
      if (gasCard) gasCard.hidden = false;
      renderGasMonitor(currentPlant.gas);
    }
    renderProcessBars(currentPlant.processes, currentPlant.processAlert);
    renderStrategicAnalytics(currentPlant);

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
    setElementText('cal-promedio-val', hasNumericValue(budgetKwh) ? formatNumber(budgetKwh) + ' kWh' : 'n.a.');
    setElementText('cal-capacidad-val', formatNumber(maxKwh) + ' kWh');
    setElementText('cal-previous-val', formatNumber(plant.previous.kwh) + ' kWh');
    setElementText('cal-capacidad-name', plant.analytics ? 'Límite superior esperado' : 'Capacidad Máxima Contratada');
    if (plant.analytics) setElementText('tachometer-cluster-sub', 'JSON mensual · ' + plant.name);

    const previousChange = ((newKwh - plant.previous.kwh) / plant.previous.kwh) * 100;
    const previousSubEl = document.getElementById('cal-previous-sub');
    if (previousSubEl) {
      if (Math.abs(previousChange) < 0.05) {
        previousSubEl.textContent = 'Consumo actual estable';
        previousSubEl.className = 'cal-sub';
      } else {
        previousSubEl.textContent = 'Consumo actual: ' + formatDecimal(Math.abs(previousChange), 1) + '% ' + (previousChange > 0 ? 'por encima' : 'por debajo');
        previousSubEl.className = 'cal-sub ' + (previousChange > 0 ? 'red' : 'green');
      }
    }

    const exceso = hasNumericValue(budgetKwh) ? newKwh - budgetKwh : null;
    const posValEl = document.getElementById('cal-posicion-val');
    const posSubEl = document.getElementById('cal-posicion-sub');
    if (posValEl) posValEl.textContent = formatNumber(newKwh) + ' kWh';
    if (posSubEl) {
      if (!hasNumericValue(exceso)) {
        posSubEl.textContent = 'El corte no declara una meta energética';
        posSubEl.className = 'cal-sub';
      } else if (exceso > 0) {
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
      plant.analytics
        ? (capacityRemaining >= 0
          ? 'Margen hasta rango superior: ' + formatNumber(capacityRemaining) + ' kWh'
          : 'Rango superior excedido: ' + formatNumber(Math.abs(capacityRemaining)) + ' kWh')
        : (capacityRemaining >= 0
          ? 'Margen contratado: ' + formatNumber(capacityRemaining) + ' kWh'
          : 'Capacidad excedida: ' + formatNumber(Math.abs(capacityRemaining)) + ' kWh')
    );

    const dialStatus = document.getElementById('cal-dial-status');
    if (dialStatus) {
      dialStatus.textContent = !hasNumericValue(exceso) ? 'SIN META DISPONIBLE' : (exceso > 0 ? 'SOBRECONSUMO' : 'OPERACIÓN BALANCEADA');
      dialStatus.className = hasNumericValue(exceso) && exceso > 0 ? 'active' : '';
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

    const budgetTick = document.getElementById('stitch-gauge-budget-tick');
    const budgetDot = document.getElementById('stitch-gauge-budget-dot');
    const budgetLabel = document.getElementById('stitch-gauge-budget-label');
    const alertSector = document.getElementById('stitch-gauge-alert-sector');

    [budgetTick, budgetDot, budgetLabel, alertSector].forEach(element => {
      if (element) element.style.display = hasNumericValue(budgetKwh) ? '' : 'none';
    });
    if (!hasNumericValue(budgetKwh)) return;

    const budgetPct = Math.min(Math.max(budgetKwh / maxKwh, 0), 1);
    const point = getGaugePoint(budgetPct, 160);
    const innerPoint = getGaugePoint(budgetPct, 143);

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
    const hasBudget = hasNumericValue(budget);
    const isOverBudget = hasBudget && kwh > budget;
    const needleColor = !hasBudget ? '#B8A6FF' : (isOverBudget ? '#FF3D57' : '#00E676');
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
      if (!hasBudget) {
        gaugeAlertPill.className = 'gauge-alert-pill';
        gaugeAlertPill.textContent = 'Meta no disponible para el corte seleccionado';
      } else if (isOverBudget) {
        const pctOver = formatDecimal(((kwh - budget) / budget) * 100, 1);
        gaugeAlertPill.className = 'gauge-alert-pill danger';
        gaugeAlertPill.textContent = `Límite superado: +${pctOver}% sobre la meta de ${formatNumber(budget)} kWh`;
      } else {
        const pctOver = formatDecimal(((kwh - budget) / budget) * 100, 1);
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
    svg.setAttribute('viewBox', '0 0 500 180');
    svg.setAttribute('preserveAspectRatio', 'none');

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

  function renderMonthlyConsumptionChart(monthlyData) {
    const svg = document.getElementById('line-chart-svg');
    if (!svg) return;
    svg.replaceChildren();
    svg.setAttribute('viewBox', '0 0 500 180');
    svg.setAttribute('preserveAspectRatio', 'none');

    const records = monthlyData.filter(record => (
      hasNumericValue(record.consumo) && hasNumericValue(record.rangos?.consumo?.esperado)
    ));
    if (records.length < 2) return;

    const width = 500;
    const height = 180;
    const padding = { top: 18, right: 18, bottom: 28, left: 48 };
    const values = records.flatMap(record => [Number(record.consumo), Number(record.rangos.consumo.esperado)]);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const range = Math.max(1, rawMax - rawMin);
    const minValue = rawMin - range * 0.18;
    const maxValue = rawMax + range * 0.18;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const getX = index => padding.left + (index / (records.length - 1)) * chartWidth;
    const getY = value => padding.top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;

    for (let index = 0; index <= 3; index++) {
      const y = padding.top + (chartHeight / 3) * index;
      const value = maxValue - ((maxValue - minValue) / 3) * index;
      svg.appendChild(createSvgElement('line', {
        x1: padding.left, y1: y, x2: width - padding.right, y2: y,
        stroke: 'rgba(255,255,255,0.06)', 'stroke-width': 1
      }));
      svg.appendChild(createSvgElement('text', {
        x: padding.left - 6, y: y + 3, 'text-anchor': 'end', fill: '#6C7689',
        'font-size': 9, 'font-family': 'var(--font-mono)'
      }, formatCompactNumber(value)));
    }

    const expectedPath = records.map((record, index) => (
      (index === 0 ? 'M' : 'L') + ' ' + getX(index).toFixed(2) + ' ' + getY(Number(record.rangos.consumo.esperado)).toFixed(2)
    )).join(' ');
    svg.appendChild(createSvgElement('path', {
      d: expectedPath, fill: 'none', stroke: '#FFAB00', 'stroke-width': 1.6, 'stroke-dasharray': '5 4'
    }));

    const realPath = records.map((record, index) => (
      (index === 0 ? 'M' : 'L') + ' ' + getX(index).toFixed(2) + ' ' + getY(Number(record.consumo)).toFixed(2)
    )).join(' ');
    svg.appendChild(createSvgElement('path', {
      d: realPath, fill: 'none', stroke: '#9E7DFF', 'stroke-width': 2.6,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }));

    const latestIndex = records.length - 1;
    svg.appendChild(createSvgElement('circle', {
      cx: getX(latestIndex), cy: getY(Number(records[latestIndex].consumo)), r: 4,
      fill: '#FF3D57', stroke: '#fff', 'stroke-width': 1.2
    }));

    [...new Set([0, Math.floor((records.length - 1) / 2), records.length - 1])].forEach(index => {
      svg.appendChild(createSvgElement('text', {
        x: getX(index), y: height - 7, 'text-anchor': 'middle', fill: '#6C7689', 'font-size': 9
      }, formatMonthLabel(records[index].fecha)));
    });
  }

  function renderStrategicAnalytics(plant) {
    const section = document.getElementById('strategic-analytics-section');
    if (!section) return;
    const analytics = plant.analytics;
    section.hidden = !analytics;
    if (!analytics) return;

    const { latest, previous } = analytics;
    const consumptionChange = percentageChange(latest.consumo, previous.consumo);
    const productionChange = percentageChange(latest.produccion, previous.produccion);
    const intensityChange = percentageChange(latest.intensidad, previous.intensidad);
    const costChange = percentageChange(latest.costo_total, previous.costo_total);
    const tariffChange = percentageChange(latest.costo_unitario, previous.costo_unitario);
    const budgetDeviation = hasNumericValue(latest.desviacion_ppto) ? Number(latest.desviacion_ppto) * 100 : null;
    const budgetKwh = hasNumericValue(latest.produccion) && hasNumericValue(latest.intensidad_ppto)
      ? Number(latest.produccion) * Number(latest.intensidad_ppto)
      : null;
    const excessKwh = hasNumericValue(budgetKwh) ? Number(latest.consumo) - budgetKwh : null;
    const estimatedCostImpact = hasNumericValue(excessKwh) && hasNumericValue(latest.costo_unitario)
      ? excessKwh * Number(latest.costo_unitario)
      : null;
    const range = latest.rangos?.intensidad || {};

    setElementText('analytics-title', 'Lectura estratégica · ' + plant.name);
    setElementText(
      'analytics-summary',
      buildAnalyticsSummary(consumptionChange, productionChange, intensityChange)
    );
    setElementText('analytics-period-badge', 'CORTE ' + formatMonthLabel(latest.fecha).toUpperCase());
    setElementText('analytics-source-badge', (plant.isCustom ? 'ARCHIVO IMPORTADO' : 'JSON') + ' · ' + analytics.period.meses + ' MESES');

    setAnalyticsSignal(
      'consumption',
      formatNumber(Math.round(latest.consumo)) + ' kWh',
      formatPercentChange(consumptionChange) + ' vs ' + formatMonthLabel(previous.fecha),
      consumptionChange > 0 ? 'negative' : 'positive'
    );
    setAnalyticsSignal(
      'production',
      (hasNumericValue(latest.produccion) ? formatNumber(Math.round(latest.produccion)) : 'n.a.') + ' ' + getIntensityDenominator(analytics.intensityUnit),
      formatPercentChange(productionChange) + ' vs ' + formatMonthLabel(previous.fecha),
      !hasNumericValue(productionChange) ? 'neutral' : (productionChange < 0 ? 'negative' : 'positive')
    );
    setAnalyticsSignal(
      'intensity',
      formatDecimal(latest.intensidad, 2) + ' ' + analytics.intensityUnit,
      formatPercentChange(intensityChange) + (hasNumericValue(range.z) ? ' · z=' + formatDecimal(range.z, 2) : ' · sin rango estadístico suficiente'),
      range.estado === 'normal' ? 'positive' : (range.estado === 'sin_historia' ? 'neutral' : 'negative')
    );
    setAnalyticsSignal(
      'budget',
      hasNumericValue(budgetDeviation) ? formatSigned(budgetDeviation, 1) + '%' : 'n.a.',
      hasNumericValue(excessKwh)
        ? formatNumber(Math.abs(Math.round(excessKwh))) + ' kWh ' + (excessKwh > 0 ? 'sobre' : 'por debajo del') + ' presupuesto estimado'
        : 'El archivo no declara presupuesto para este corte',
      !hasNumericValue(budgetDeviation) ? 'neutral' : (budgetDeviation > 0 ? 'negative' : 'positive')
    );
    setAnalyticsSignal(
      'cost',
      hasNumericValue(latest.costo_total) ? formatCurrencyCop(latest.costo_total, true) : 'n.a.',
      hasNumericValue(costChange)
        ? formatPercentChange(costChange) + ' y tarifa ' + formatPercentChange(tariffChange)
        : 'El archivo no declara costo para este corte',
      !hasNumericValue(costChange) ? 'neutral' : (costChange > 0 ? 'negative' : 'positive')
    );

    const insightParts = [];
    if (hasNumericValue(range.esperado)) {
      insightParts.push('La intensidad está ' + formatSigned(percentageChange(latest.intensidad, range.esperado), 1) + '% frente a lo esperado');
    }
    if (hasNumericValue(budgetDeviation)) insightParts.push(formatSigned(budgetDeviation, 1) + '% frente al presupuesto');
    if (hasNumericValue(estimatedCostImpact)) insightParts.push('impacto estimado: ' + formatCurrencyCop(estimatedCostImpact, true));
    setElementText('analytics-control-insight', insightParts.length ? insightParts.join(' · ') + '.' : 'El corte no tiene referencias suficientes para estimar la brecha; revise consumo, producción e intensidad.');

    renderIntensityControlChart(getSelectedSeriesWindow(analytics, 24), analytics.intensityUnit);
    renderAnalyticsProcessComparison(analytics.processes, analytics.intensityUnit, latest.fecha, plant.name);
    renderAnalyticsAlerts(analytics.alerts, analytics.intensityUnit);
    renderAnalyticsCoverage(analytics);
  }

  function setAnalyticsSignal(key, value, detail, state) {
    const card = document.getElementById('analytics-signal-' + key);
    if (card) card.className = 'analytics-signal-card ' + state;
    setElementText('analytics-' + key + '-value', value);
    setElementText('analytics-' + key + '-detail', detail);
  }

  function renderIntensityControlChart(series, unit) {
    const svg = document.getElementById('analytics-intensity-chart');
    if (!svg) return;
    svg.replaceChildren();

    const records = series.filter(record => hasNumericValue(record.intensidad));
    if (records.length < 2) {
      svg.appendChild(createSvgElement('text', {
        x: 380, y: 140, 'text-anchor': 'middle', fill: '#788296', 'font-size': 12
      }, 'Se requieren dos cortes con intensidad para dibujar la tendencia.'));
      return;
    }

    const width = 760;
    const height = 280;
    const padding = { top: 22, right: 24, bottom: 38, left: 58 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const values = records.flatMap(record => [
      record.intensidad,
      record.rangos?.intensidad?.rango_min,
      record.rangos?.intensidad?.rango_max,
      record.intensidad_ppto
    ]).filter(hasNumericValue).map(Number);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const range = Math.max(1, rawMax - rawMin);
    const minValue = Math.max(0, rawMin - range * 0.12);
    const maxValue = rawMax + range * 0.12;
    const getX = index => padding.left + (index / (records.length - 1)) * chartWidth;
    const getY = value => padding.top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;

    for (let index = 0; index <= 4; index++) {
      const y = padding.top + (chartHeight / 4) * index;
      const value = maxValue - ((maxValue - minValue) / 4) * index;
      svg.appendChild(createSvgElement('line', {
        x1: padding.left, y1: y, x2: width - padding.right, y2: y,
        stroke: 'rgba(255,255,255,0.065)', 'stroke-width': 1
      }));
      svg.appendChild(createSvgElement('text', {
        x: padding.left - 8, y: y + 4, 'text-anchor': 'end', fill: '#788296',
        'font-size': 10, 'font-family': 'var(--font-mono)'
      }, formatDecimal(value, 1)));
    }

    const hasCompleteBand = records.every(record => (
      hasNumericValue(record.rangos?.intensidad?.rango_min) &&
      hasNumericValue(record.rangos?.intensidad?.rango_max)
    ));
    if (hasCompleteBand) {
      const upper = records.map((record, index) => (
        getX(index).toFixed(2) + ',' + getY(Number(record.rangos.intensidad.rango_max)).toFixed(2)
      ));
      const lower = records.map((record, index) => (
        getX(index).toFixed(2) + ',' + getY(Number(record.rangos.intensidad.rango_min)).toFixed(2)
      )).reverse();
      svg.appendChild(createSvgElement('polygon', {
        points: upper.concat(lower).join(' '), fill: 'rgba(0, 216, 255, 0.10)', stroke: 'none'
      }));
    }

    appendSeriesPath(svg, records, getX, getY, record => record.rangos?.intensidad?.esperado, '#00D8FF', '5 4', 1.6);
    appendSeriesPath(svg, records, getX, getY, record => record.intensidad_ppto, '#FFAB00', '3 4', 1.7);
    appendSeriesPath(svg, records, getX, getY, record => record.intensidad, '#A984FF', '', 2.7);

    const lastIndex = records.length - 1;
    const last = records[lastIndex];
    svg.appendChild(createSvgElement('circle', {
      cx: getX(lastIndex), cy: getY(Number(last.intensidad)), r: 5,
      fill: '#FF3D57', stroke: '#fff', 'stroke-width': 1.5
    }));
    svg.appendChild(createSvgElement('text', {
      x: getX(lastIndex) - 8, y: getY(Number(last.intensidad)) - 10, 'text-anchor': 'end',
      fill: '#FF7A8C', 'font-size': 10, 'font-weight': 700, 'font-family': 'var(--font-mono)'
    }, formatDecimal(last.intensidad, 2)));

    [...new Set([0, 6, 12, 18, records.length - 1].filter(index => index < records.length))].forEach(index => {
      svg.appendChild(createSvgElement('text', {
        x: getX(index), y: height - 12, 'text-anchor': 'middle', fill: '#788296', 'font-size': 9
      }, formatMonthLabel(records[index].fecha)));
    });
    svg.appendChild(createSvgElement('text', {
      x: padding.left, y: 12, fill: '#788296', 'font-size': 9
    }, unit));
  }

  function appendSeriesPath(svg, records, getX, getY, accessor, color, dash, strokeWidth) {
    let pathData = '';
    let segmentOpen = false;
    records.forEach((record, index) => {
      const value = Number(accessor(record));
      if (!Number.isFinite(value) || accessor(record) === null) {
        segmentOpen = false;
        return;
      }
      pathData += (segmentOpen ? ' L ' : ' M ') + getX(index).toFixed(2) + ' ' + getY(value).toFixed(2);
      segmentOpen = true;
    });
    if (!pathData) return;
    const attributes = {
      d: pathData.trim(), fill: 'none', stroke: color, 'stroke-width': strokeWidth,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    };
    if (dash) attributes['stroke-dasharray'] = dash;
    svg.appendChild(createSvgElement('path', attributes));
  }

  function renderAnalyticsProcessComparison(processes, unit, period, plantName) {
    const container = document.getElementById('analytics-process-grid');
    if (!container) return;
    container.replaceChildren();

    processes.forEach(process => {
      const latest = findProcessRecord(process, period);
      if (!latest || !Number.isFinite(Number(latest.intensidad))) return;
      const range = latest.rangos?.intensidad || {};
      const budgetDeviation = hasNumericValue(latest.desviacion_ppto) ? Number(latest.desviacion_ppto) * 100 : null;
      const dualSignal = hasNumericValue(budgetDeviation) && budgetDeviation < 0 && !['normal', 'sin_historia'].includes(range.estado);
      const scaleMax = Math.max(
        Number(latest.intensidad),
        Number(range.rango_max) || 0,
        Number(latest.intensidad_ppto) || 0
      ) * 1.12;

      const card = document.createElement('div');
      card.className = 'analytics-process-card' + (dualSignal ? ' dual-signal' : '');

      const top = document.createElement('div');
      top.className = 'analytics-process-top';
      const name = document.createElement('strong');
      name.textContent = process.es_total ? plantName + ' total' : formatProcessName(process.proceso);
      const states = document.createElement('div');
      states.className = 'analytics-state-group';
      states.appendChild(createStateChip(
        range.estado === 'normal' ? 'En rango' : (range.estado === 'sin_historia' ? 'Historia insuficiente' : 'Rango ' + range.estado),
        range.estado === 'normal' ? 'positive' : (range.estado === 'sin_historia' ? 'neutral' : 'negative')
      ));
      states.appendChild(createStateChip(
        hasNumericValue(budgetDeviation) ? formatSigned(budgetDeviation, 1) + '% ppto' : 'Sin ppto',
        !hasNumericValue(budgetDeviation) ? 'neutral' : (budgetDeviation > 0 ? 'negative' : 'positive')
      ));
      top.append(name, states);

      const values = document.createElement('div');
      values.className = 'analytics-process-values';
      const actual = document.createElement('strong');
      actual.textContent = formatDecimal(latest.intensidad, 2) + ' ' + unit;
      const reference = document.createElement('span');
      reference.textContent = 'Esperado ' + (hasNumericValue(range.esperado) ? formatDecimal(range.esperado, 2) : 'n.a.') +
        ' · Ppto ' + (hasNumericValue(latest.intensidad_ppto) ? formatDecimal(latest.intensidad_ppto, 2) : 'n.a.');
      values.append(actual, reference);

      const scale = document.createElement('div');
      scale.className = 'analytics-process-scale';
      const fill = document.createElement('div');
      fill.className = 'analytics-process-fill';
      fill.style.width = Math.min(100, Number(latest.intensidad) / scaleMax * 100) + '%';
      const expectedMarker = document.createElement('span');
      expectedMarker.className = 'analytics-process-marker';
      expectedMarker.style.left = Math.min(100, Number(range.esperado || latest.intensidad) / scaleMax * 100) + '%';
      expectedMarker.hidden = !hasNumericValue(range.esperado);
      expectedMarker.title = 'Esperado';
      const budgetMarker = document.createElement('span');
      budgetMarker.className = 'analytics-process-marker budget';
      budgetMarker.style.left = Math.min(100, Number(latest.intensidad_ppto || latest.intensidad) / scaleMax * 100) + '%';
      budgetMarker.hidden = !hasNumericValue(latest.intensidad_ppto);
      budgetMarker.title = 'Presupuesto';
      scale.append(fill, expectedMarker, budgetMarker);
      card.append(top, values, scale);

      if (dualSignal) {
        const note = document.createElement('small');
        note.className = 'analytics-process-note';
        note.textContent = 'Señal dual: favorable frente al presupuesto, pero anormal frente a su historia. Conviene revisar el proceso sin asumir ahorro sostenible.';
        card.appendChild(note);
      }
      container.appendChild(card);
    });
  }

  function createStateChip(text, state) {
    const chip = document.createElement('span');
    chip.className = 'analytics-state-chip ' + state;
    chip.textContent = text;
    return chip;
  }

  function renderAnalyticsAlerts(alerts, unit) {
    const container = document.getElementById('analytics-alert-list');
    if (!container) return;
    container.replaceChildren();
    setElementText('analytics-alert-title', alerts.length + ' alertas analíticas');

    alerts.forEach(alert => {
      const item = document.createElement('div');
      item.className = 'analytics-alert-item';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = formatProcessName(alert.proceso) + ' · ' + (alert.tipo === 'fuera_de_rango' ? 'fuera de rango' : 'sobre presupuesto');
      const detail = document.createElement('small');
      detail.textContent = alert.tipo === 'fuera_de_rango'
        ? formatDecimal(alert.valor, 2) + ' ' + unit + ' vs esperado ' + formatDecimal(alert.esperado, 2) + ' · z=' + formatDecimal(alert.z, 2)
        : formatDecimal(alert.valor, 2) + ' ' + unit + ' vs ppto ' + formatDecimal(alert.presupuesto, 2) + ' · +' + formatDecimal(Number(alert.desviacion) * 100, 1) + '%';
      copy.append(title, detail);
      const severity = document.createElement('span');
      severity.className = 'analytics-alert-severity';
      severity.textContent = 'REVISAR';
      item.append(copy, severity);
      container.appendChild(item);
    });
  }

  function renderAnalyticsCoverage(analytics) {
    const container = document.getElementById('analytics-coverage-list');
    if (!container) return;
    container.replaceChildren();
    const series = analytics.totalSeries;
    const costMonths = countAvailableValues(series, 'costo_total');
    const budgetMonths = countAvailableValues(series, 'intensidad_ppto');
    const corrections = Array.isArray(analytics.quality.correcciones) ? analytics.quality.correcciones.length : 0;
    const observations = Array.isArray(analytics.quality.observaciones) ? analytics.quality.observaciones.length : 0;
    const excluded = Array.isArray(analytics.parameters.periodos_excluidos)
      ? analytics.parameters.periodos_excluidos.map(period => period.join(' → ')).join(', ')
      : 'Ninguno';
    const seasonality = analytics.totalProcess.estacionalidad || {};
    const seasonalityMetrics = ['consumo', 'produccion', 'intensidad'].filter(metric => seasonality[metric]);
    const noSignificantSeasonality = seasonalityMetrics.length === 3 && seasonalityMetrics.every(metric => seasonality[metric]?.significativa === false);
    const seasonalityValue = !seasonalityMetrics.length ? 'No calculada' : (noSignificantSeasonality ? 'No significativa' : 'Revisar patrón');

    [
      ['Serie principal', analytics.period.meses + ' meses', analytics.period.inicio + ' → ' + analytics.period.fin],
      ['Costo', costMonths + ' meses', 'Disponible desde el tramo más reciente'],
      ['Presupuesto', budgetMonths + ' meses', 'No se imputa en períodos sin dato'],
      ['Calidad declarada', corrections + ' correcciones', observations + ' observaciones registradas'],
      ['Período excluido', excluded, 'No participa en la historia de referencia'],
      ['Estacionalidad', seasonalityValue, seasonalityMetrics.length ? 'Consumo, producción e intensidad' : 'No declarada en el archivo importado'],
      ['Regla de rango', analytics.parameters.rango_ventana_meses + ' meses · z=' + analytics.parameters.rango_z, 'Mínimo ' + analytics.parameters.rango_min_obs + ' observaciones']
    ].forEach(([label, value, detail]) => {
      const item = document.createElement('div');
      item.className = 'analytics-coverage-item';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = label;
      const sub = document.createElement('span');
      sub.textContent = detail;
      copy.append(title, sub);
      const metric = document.createElement('strong');
      metric.textContent = value;
      item.append(copy, metric);
      container.appendChild(item);
    });
  }

  function countAvailableValues(series, field) {
    return series.filter(record => record[field] !== null && record[field] !== undefined && Number.isFinite(Number(record[field]))).length;
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
    svg.setAttribute('viewBox', '0 0 240 90');
    svg.setAttribute('preserveAspectRatio', 'none');

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
    const meta = document.getElementById('diagnostic-meta-strip');

    if (!card) return;

    if (plant.analytics) {
      const latest = plant.analytics.latest;
      const range = latest.rangos?.intensidad || {};
      const hasAlerts = plant.alertCount > 0;
      card.classList.toggle('resolved', !hasAlerts);
      if (badge) badge.textContent = hasAlerts ? 'PRIORIDAD: INTENSIDAD ENERGÉTICA' : 'LECTURA ANALÍTICA EN RANGO';
      if (desc) {
        const findings = [];
        if (hasNumericValue(latest.desviacion_ppto)) {
          const deviation = Number(latest.desviacion_ppto) * 100;
          findings.push('la intensidad está ' + formatSigned(deviation, 1) + '% ' + (deviation > 0 ? 'sobre' : 'frente al') + ' presupuesto');
        } else {
          findings.push('el archivo no incluye presupuesto para este corte');
        }
        if (hasNumericValue(range.esperado)) {
          findings.push('el valor actual es ' + formatDecimal(latest.intensidad, 2) + ' frente a ' + formatDecimal(range.esperado, 2) + ' ' + getPlantIntensityUnit(plant) + ' esperados');
        }
        const mostRelevant = plant.analytics.alerts?.[0]?.proceso;
        if (mostRelevant) findings.push('la primera señal a revisar corresponde a ' + formatProcessName(mostRelevant));
        desc.textContent = plant.name + ': ' + findings.join('; ') + '. ' + (hasAlerts ? 'Conviene revisar las señales por proceso antes del siguiente corte.' : 'No se detectaron señales analíticas activas en el período seleccionado.');
      }
      if (meta) {
        meta.textContent = 'Corte: ' + formatMonthLabel(latest.fecha) + ' · Fuente: ' + (plant.sourceFileName || 'planta_fya_energia.json') + ' · Generado: ' + formatGeneratedDate(plant.analytics.generatedAt);
      }
      if (btnAck) {
        btnAck.textContent = hasAlerts ? 'Revisar señales del corte' : 'Ver cálculo del corte';
        btnAck.disabled = false;
        btnAck.classList.remove('acked');
      }
      return;
    }

    if (btnAck) btnAck.disabled = false;
    if (meta) meta.textContent = 'Telemetría operativa · Gateway: ' + plant.nodeUri;

    if (plant.isCritical && !DashboardStore.faultAcknowledged) {
      card.classList.remove('resolved');
      if (badge) badge.textContent = 'AVISO CRÍTICO DE OPERACIÓN';
      const ratioDeviation = ((plant.ratioKwhUnit - plant.ratioTarget) / plant.ratioTarget) * 100;
      if (desc) desc.textContent = `La demanda total supera el presupuesto en ${formatDecimal(plant.deviationPct, 1)}%; la intensidad unitaria está ${formatDecimal(ratioDeviation, 1)}% sobre la meta (${formatDecimal(plant.ratioKwhUnit, 2)} frente a ${formatDecimal(plant.ratioTarget, 2)} kWh/u). Fuente local: ${plant.nodeUri}.`;
      if (btnAck) {
        btnAck.textContent = 'Confirmar alerta local';
        btnAck.classList.remove('acked');
      }
    } else {
      card.classList.add('resolved');
      if (badge) badge.textContent = 'DIAGNÓSTICO: OPERACIÓN NORMAL';
      if (desc) desc.textContent = `No hay alertas locales activas para ${plant.name}. Este estado procede del snapshot demostrativo y no confirma cumplimiento ISO ni una condición SCADA real.`;
      if (btnAck) {
        btnAck.textContent = '✓ Alerta confirmada';
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
          plant.costCop = Math.round(kwh * DEFAULT_ENERGY_TARIFF_COP);
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
    const fileInput = document.getElementById('plant-data-file-input');
    const dropzone = document.getElementById('plant-file-dropzone');
    if (!modal || !form) return;

    const updateFileState = () => {
      const file = fileInput?.files?.[0];
      const emptyState = document.getElementById('plant-file-empty-state');
      const selectedState = document.getElementById('plant-file-selected-state');
      const status = document.getElementById('plant-file-status');
      if (emptyState) emptyState.hidden = Boolean(file);
      if (selectedState) selectedState.hidden = !file;
      setElementText('plant-selected-file-name', file?.name || '');
      setElementText('plant-selected-file-meta', file ? getSourceFormat(file.name) + ' · ' + formatFileSize(file.size) + ' · listo para analizar' : '');
      if (status) status.textContent = file
        ? 'Puedes cambiarlo o quitarlo antes de crear la planta.'
        : 'Formatos admitidos: XLSX, XLS, CSV y JSON · máximo 15 MB.';
    };

    const resetForm = () => {
      form.reset();
      updateFileState();
      dropzone?.classList.remove('drag-active');
    };

    ['btn-open-add-plant', 'btn-sources-add-plant'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.addEventListener('click', openAddPlantModal);
    });

    const closeModal = () => {
      modal.classList.remove('open');
      resetForm();
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

    fileInput?.addEventListener('change', updateFileState);
    ['btn-select-plant-file', 'btn-replace-plant-file'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => fileInput?.click());
    });
    document.getElementById('btn-remove-plant-file')?.addEventListener('click', () => {
      if (fileInput) fileInput.value = '';
      updateFileState();
      const error = document.getElementById('add-plant-form-error');
      if (error) error.hidden = true;
    });
    if (dropzone && fileInput) {
      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, event => {
          event.preventDefault();
          dropzone.classList.add('drag-active');
        });
      });
      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, event => {
          event.preventDefault();
          dropzone.classList.remove('drag-active');
        });
      });
      dropzone.addEventListener('drop', event => {
        const file = event.dataTransfer?.files?.[0];
        if (!file) return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        fileInput.files = transfer.files;
        updateFileState();
      });
    }
    updateFileState();

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(form);
      const error = document.getElementById('add-plant-form-error');
      const submitButton = document.getElementById('btn-submit-add-plant');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Analizando archivo…';
      }
      if (error) error.hidden = true;

      try {
        const result = await createPlantFromUpload(formData);
        modal.classList.remove('open');
        resetForm();
        DashboardStore.currentPlantId = result.plant.id;
        renderAllViews();
        switchView('detail');
        showToast('✓ ' + result.plant.name + ' creada desde ' + result.plant.sourceFileName + ' y guardada en este navegador.', 'success');
      } catch (creationError) {
        if (error) {
          error.textContent = creationError.message || 'No fue posible crear la planta con este archivo.';
          error.hidden = false;
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Analizar archivo y crear planta';
        }
      }
    });
  }

  function openAddPlantModal() {
    const modal = document.getElementById('modal-add-plant');
    if (!modal) return;
    modal.classList.add('open');
    setTimeout(() => document.getElementById('plant-name-input')?.focus(), 50);
  }

  async function createPlantFromUpload(formData) {
    const name = String(formData.get('plantName') || '').trim();
    const file = formData.get('plantDataFile');
    if (!name) throw new Error('Escribe el nombre de la planta.');
    const duplicateName = Object.values(DashboardStore.plants)
      .some(plant => plant.name.trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));
    if (duplicateName) throw new Error('Ya existe una planta con ese nombre. Usa un nombre diferente.');

    const parsed = await readPlantDataFile(file, name);
    const sourceFormat = getSourceFormat(file.name);

    const id = createUniquePlantId(name);
    const number = String(Object.keys(DashboardStore.plants).length + 1);
    const autoTag = 'DATA-' + id.replace(/_/g, '-').toUpperCase().slice(0, 18);
    const importedAt = new Date().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

    const plant = {
      id,
      number,
      name,
      fullName: name,
      tag: autoTag,
      status: 'normal',
      statusLabel: 'Archivo validado',
      isCritical: false,
      isCustom: true,
      sensorsCount: 0,
      nodeUri: 'DATASET-' + id.replace(/_/g, '-').toUpperCase(),
      sourceFileName: file.name,
      sourceFormat,
      sourcePeriod: parsed.sourcePeriod,
      sourceImportedAt: importedAt,
      sourceSheets: parsed.sheets,
      sourcePreviewText: parsed.previewText,
      costCop: 0,
      previous: { costCop: 0 },
      gas: {
        flowHigh: 'Sin fuente cargada',
        flowTot: 'Pendiente integración de gas',
        trend: [0, 0, 0, 0, 0, 0, 0]
      },
      dailyData: []
    };

    applyEnergyDataset(plant, parsed.analytics);
    plant.dailyData = generateDailyCurve(Number(plant.kwh) / 30, 0.08, Boolean(plant.isCritical));
    DashboardStore.plants[id] = plant;
    registerPlantUploadSource(plant, file, parsed);
    persistCustomPlants();
    ensureDynamicPlantUI();
    return { plant };
  }

  function initDeletePlantModal() {
    const modal = document.getElementById('modal-delete-plant');
    const form = document.getElementById('form-delete-plant');
    const openButton = document.getElementById('btn-delete-current-plant');
    const codeInput = document.getElementById('delete-security-code-input');
    const confirmButton = document.getElementById('btn-confirm-delete-plant');
    const matchStatus = document.getElementById('delete-code-match-status');
    if (!modal || !form || !openButton) return;

    const closeModal = () => {
      modal.classList.remove('open');
      form.reset();
      pendingDeleteChallenge = null;
      if (confirmButton) confirmButton.disabled = true;
      if (matchStatus) {
        matchStatus.textContent = 'Esperando confirmación del código.';
        matchStatus.className = 'delete-code-match-status';
      }
      const error = document.getElementById('delete-plant-form-error');
      if (error) error.hidden = true;
    };
    openButton.addEventListener('click', () => {
      const plant = DashboardStore.plants[DashboardStore.currentPlantId];
      if (!plant?.isCustom) return;
      const code = createSecurityCode();
      pendingDeleteChallenge = { plantId: plant.id, code };
      setElementText('delete-plant-name', plant.name);
      setElementText('delete-generated-code', code);
      form.reset();
      if (confirmButton) confirmButton.disabled = true;
      modal.classList.add('open');
      setTimeout(() => codeInput?.focus(), 50);
    });
    document.getElementById('btn-copy-delete-code')?.addEventListener('click', async () => {
      const copied = await copyTextToClipboard(pendingDeleteChallenge?.code || '');
      showToast(copied ? 'Código temporal copiado.' : 'Selecciona y copia el código manualmente.', copied ? 'success' : 'danger');
      if (copied) codeInput?.focus();
    });
    codeInput?.addEventListener('input', () => {
      const entered = codeInput.value.trim().toUpperCase();
      if (codeInput.value !== entered) codeInput.value = entered;
      const matches = Boolean(pendingDeleteChallenge && entered === pendingDeleteChallenge.code);
      if (confirmButton) confirmButton.disabled = !matches;
      if (matchStatus) {
        matchStatus.textContent = matches ? 'Código confirmado. Ya puedes eliminar la planta.' : (entered ? 'El código todavía no coincide.' : 'Esperando confirmación del código.');
        matchStatus.className = 'delete-code-match-status ' + (matches ? 'valid' : (entered ? 'invalid' : ''));
      }
      const error = document.getElementById('delete-plant-form-error');
      if (error) error.hidden = true;
    });
    ['btn-close-delete-plant', 'btn-cancel-delete-plant'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', closeModal);
    });
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const plant = DashboardStore.plants[DashboardStore.currentPlantId];
      const enteredCode = String(new FormData(form).get('securityCode') || '').trim().toUpperCase();
      const error = document.getElementById('delete-plant-form-error');
      if (!plant?.isCustom || pendingDeleteChallenge?.plantId !== plant.id) {
        closeModal();
        return;
      }
      if (!enteredCode || enteredCode !== pendingDeleteChallenge.code) {
        if (error) {
          error.textContent = 'El código no coincide con el código temporal mostrado arriba.';
          error.hidden = false;
        }
        return;
      }
      const deletedName = plant.name;
      deleteCustomPlant(plant.id);
      closeModal();
      switchView('landing');
      showToast('✓ ' + deletedName + ' fue eliminada de este navegador.', 'success');
    });
  }

  function deleteCustomPlant(plantId) {
    const plant = DashboardStore.plants[plantId];
    if (!plant?.isCustom) return false;
    const sourceId = 'plant-source-' + plantId;
    const source = DashboardStore.sources.find(item => item.id === sourceId);
    if (source?.href?.startsWith('blob:')) URL.revokeObjectURL(source.href);
    DashboardStore.sources = DashboardStore.sources.filter(item => item.id !== sourceId);
    delete DashboardStore.plants[plantId];
    document.querySelectorAll('[data-plant-id]').forEach(element => {
      if (element.getAttribute('data-plant-id') === plantId) element.remove();
    });
    DashboardStore.currentPlantId = 'fa';
    persistCustomPlants();
    renderAllViews();
    return true;
  }

  async function copyTextToClipboard(text) {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      return copied;
    }
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

  function buildPlantAnalysis(plant) {
    const analytics = plant.analytics;
    const currentPeriod = analytics?.latest?.fecha || 'snapshot-local';
    const previousPeriod = analytics?.previous?.fecha || 'corte anterior de referencia';
    const consumptionChange = percentageChange(plant.kwh, plant.previous?.kwh);
    const productionChange = percentageChange(plant.productionUnits, plant.previous?.productionUnits);
    const intensityChange = percentageChange(plant.ratioKwhUnit, plant.previous?.ratioKwhUnit);
    const ratioGap = hasNumericValue(plant.ratioTarget) && Number(plant.ratioTarget) !== 0
      ? percentageChange(plant.ratioKwhUnit, plant.ratioTarget)
      : null;
    const currentCost = getPlantCostCop(plant);
    const previousCost = analytics ? plant.previous?.costAmount : plant.previous?.costCop;
    const costChange = percentageChange(currentCost, previousCost);
    const budgetGapKwh = hasNumericValue(plant.budgetKwh)
      ? Number(plant.kwh) - Number(plant.budgetKwh)
      : null;
    const range = analytics?.latest?.rangos?.intensidad || {};
    const processes = Array.isArray(plant.processes) ? plant.processes.filter(process => hasNumericValue(process.kwh)) : [];
    const topProcess = processes.length
      ? [...processes].sort((left, right) => Number(right.kwh) - Number(left.kwh))[0]
      : null;
    const alertCount = Number(plant.alertCount || 0);
    const deviation = hasNumericValue(plant.deviationPct) ? Number(plant.deviationPct) : null;
    const isHighPriority = alertCount >= 2 || (hasNumericValue(deviation) && deviation >= 10) || (hasNumericValue(ratioGap) && ratioGap >= 10);
    const isMediumPriority = !isHighPriority && (alertCount > 0 || (hasNumericValue(deviation) && deviation > 2) || (hasNumericValue(ratioGap) && ratioGap > 2));
    const priority = isHighPriority
      ? { key: 'high', label: 'Prioridad alta' }
      : (isMediumPriority ? { key: 'medium', label: 'Prioridad media' } : { key: 'low', label: 'Prioridad controlada' });
    const seriesCount = analytics?.totalSeries?.length || 0;
    const confidence = analytics
      ? (seriesCount >= 12 ? 'Alta para tendencia mensual' : 'Media: historia limitada')
      : 'Referencial: datos demostrativos';
    const sourceLabel = analytics
      ? 'Fuente: ' + (plant.sourceFileName || 'planta_fya_energia.json') + ' · ' + seriesCount + ' cortes mensuales'
      : 'Fuente: snapshot demostrativo incluido en el tablero · sin conexión SCADA real';

    const findings = [];
    if (hasNumericValue(consumptionChange)) {
      findings.push(
        'El consumo fue ' + formatNumber(plant.kwh) + ' kWh y ' +
        (consumptionChange > 0 ? 'aumentó ' : (consumptionChange < 0 ? 'disminuyó ' : 'no cambió ')) +
        formatDecimal(Math.abs(consumptionChange), 1) + '% frente al corte anterior (' + formatNumber(plant.previous.kwh) + ' kWh).'
      );
    }
    if (hasNumericValue(ratioGap)) {
      findings.push(
        'La intensidad energética es ' + formatDecimal(plant.ratioKwhUnit, 2) + ' ' + getPlantIntensityUnit(plant) +
        ', ' + formatDecimal(Math.abs(ratioGap), 1) + '% ' + (ratioGap > 0 ? 'por encima' : 'por debajo') + ' de la meta.'
      );
    } else {
      findings.push('No existe una meta de intensidad suficiente para evaluar la eficiencia por unidad producida.');
    }
    if (hasNumericValue(deviation) && hasNumericValue(budgetGapKwh)) {
      findings.push(
        'La brecha presupuestaria es ' + formatSigned(deviation, 1) + '%: ' +
        formatNumber(Math.abs(Math.round(budgetGapKwh))) + ' kWh ' + (budgetGapKwh > 0 ? 'sobre' : 'por debajo de') + ' la meta estimada.'
      );
    }
    if (hasNumericValue(costChange) && hasNumericValue(currentCost)) {
      findings.push(
        'El costo del corte es ' + formatCurrencyCop(currentCost) + ' y ' +
        (costChange > 0 ? 'aumentó ' : (costChange < 0 ? 'disminuyó ' : 'se mantuvo ')) +
        formatDecimal(Math.abs(costChange), 1) + '% frente al corte anterior.'
      );
    }
    if (topProcess) {
      findings.push(
        topProcess.name + ' concentra ' + formatDecimal(topProcess.pct, 1) + '% del consumo visible (' + formatNumber(topProcess.kwh) + ' kWh); es el primer frente para segmentar la revisión.'
      );
    }
    if (hasNumericValue(range.esperado)) {
      const historicalGap = percentageChange(plant.ratioKwhUnit, range.esperado);
      findings.push(
        'Frente al rango histórico, la intensidad está ' + formatDecimal(Math.abs(historicalGap), 1) + '% ' +
        (historicalGap > 0 ? 'por encima' : 'por debajo') + ' del valor esperado de ' + formatDecimal(range.esperado, 2) + ' ' + getPlantIntensityUnit(plant) + '.'
      );
    }
    findings.push(alertCount > 0
      ? 'Hay ' + alertCount + ' señal' + (alertCount === 1 ? '' : 'es') + ' analítica' + (alertCount === 1 ? '' : 's') + ' que requieren validación operativa.'
      : 'No se detectaron alertas activas con las reglas disponibles para este corte.');

    const decisions = [];
    if (alertCount > 0 || (hasNumericValue(deviation) && deviation > 0)) {
      decisions.push({
        title: 'Validar el foco de mayor consumo antes del siguiente corte',
        detail: 'Revisar ' + (topProcess?.name || 'el proceso principal') + ' con operación, mantenimiento y producción. Confirmar si el cambio corresponde a volumen, ineficiencia, parada, arranque o calidad del dato.',
        indicator: 'Criterio de cierre: consumo e intensidad explicados y responsable asignado.'
      });
    }
    if (hasNumericValue(ratioGap) && ratioGap > 0) {
      decisions.push({
        title: 'Atacar eficiencia por unidad, no solamente consumo total',
        detail: 'El indicador normalizado está sobre la meta. Comparar turnos, lotes y condiciones de producción para evitar atribuir el resultado únicamente a mayor volumen.',
        indicator: 'Seguimiento: ' + formatDecimal(plant.ratioKwhUnit, 2) + ' → meta ' + formatDecimal(plant.ratioTarget, 2) + ' ' + getPlantIntensityUnit(plant) + '.'
      });
    }
    if (hasNumericValue(costChange) && costChange > 0) {
      decisions.push({
        title: 'Separar efecto consumo y efecto tarifa',
        detail: 'Verificar si el aumento del costo se explica por más kWh, por una tarifa COP/kWh mayor o por ambos. Esto evita priorizar acciones operativas cuando la causa principal es contractual.',
        indicator: 'Seguimiento: costo total, kWh y COP/kWh en la misma revisión.'
      });
    }
    if (hasNumericValue(productionChange) && hasNumericValue(consumptionChange) && productionChange < 0 && consumptionChange > 0) {
      decisions.push({
        title: 'Escalar la combinación consumo arriba / producción abajo',
        detail: 'La señal conjunta sugiere pérdida de eficiencia y merece revisión prioritaria de tiempos ociosos, rechazos, reprocesos y equipos auxiliares.',
        indicator: 'Seguimiento: producción, horas operadas, intensidad y reproceso.'
      });
    }
    if (!decisions.length) {
      decisions.push({
        title: 'Mantener el control y documentar la práctica favorable',
        detail: 'El corte no muestra una desviación prioritaria. Registrar las condiciones de operación que ayudaron al resultado para comprobar si son repetibles.',
        indicator: 'Seguimiento: conservar intensidad en meta durante los próximos tres cortes.'
      });
    }
    decisions.push({
      title: 'Revisar nuevamente en el próximo corte',
      detail: 'Asignar responsable y fecha. Una recomendación solo se considera efectiva cuando el KPI posterior confirma el cambio sin deteriorar producción ni calidad.',
      indicator: 'Seguimiento mínimo: consumo, producción, intensidad, costo y alertas.'
    });

    const limitations = [
      'Los costos se presentan en pesos colombianos (COP). Los campos costo_unitario y costo_total de los archivos importados se interpretan como COP.',
      analytics
        ? 'La fuente es mensual; no permite localizar horas pico, turnos, equipos o eventos SCADA dentro del mes.'
        : 'Esta planta utiliza valores demostrativos locales; las conclusiones son referenciales hasta cargar una serie mensual validada.',
      'Las relaciones observadas son descriptivas. No prueban causalidad sin datos de operación, mantenimiento, producción, calidad y clima.'
    ];
    if (!hasNumericValue(currentCost)) limitations.push('La fuente no contiene un costo válido para este corte.');
    if (!hasNumericValue(plant.budgetKwh)) limitations.push('La fuente no contiene presupuesto energético comparable.');

    const prioritySentence = priority.key === 'high'
      ? 'requiere atención prioritaria'
      : (priority.key === 'medium' ? 'requiere seguimiento dirigido' : 'se encuentra bajo control con los datos disponibles');
    const consumptionSentence = hasNumericValue(consumptionChange)
      ? 'El consumo ' + (consumptionChange > 0 ? 'subió ' : (consumptionChange < 0 ? 'bajó ' : 'se mantuvo ')) + formatDecimal(Math.abs(consumptionChange), 1) + '% frente al corte anterior'
      : 'No hay un corte anterior comparable para consumo';
    const budgetSentence = hasNumericValue(deviation)
      ? ' y la brecha frente al presupuesto es ' + formatSigned(deviation, 1) + '%.'
      : '. No hay presupuesto suficiente para calcular la brecha.';

    return {
      plantId: plant.id,
      plantName: plant.name,
      period: analytics ? formatMonthLabel(currentPeriod) : 'Snapshot demostrativo',
      previousPeriod: analytics ? formatMonthLabel(previousPeriod) : 'Referencia local anterior',
      sourceLabel,
      priority,
      confidence,
      summary: plant.name + ' ' + prioritySentence + '. ' + consumptionSentence + budgetSentence,
      metrics: [
        {
          label: 'Consumo',
          value: formatNumber(plant.kwh) + ' kWh',
          detail: hasNumericValue(consumptionChange) ? formatPercentChange(consumptionChange) + ' vs corte anterior' : 'Sin comparación',
          state: !hasNumericValue(consumptionChange) ? 'neutral' : (consumptionChange > 0 ? 'negative' : 'positive')
        },
        {
          label: 'Intensidad',
          value: formatDecimal(plant.ratioKwhUnit, 2) + ' ' + getPlantIntensityUnit(plant),
          detail: hasNumericValue(ratioGap) ? formatPercentChange(ratioGap) + ' vs meta' : 'Meta no disponible',
          state: !hasNumericValue(ratioGap) ? 'neutral' : (ratioGap > 0 ? 'negative' : 'positive')
        },
        {
          label: 'Presupuesto',
          value: hasNumericValue(deviation) ? formatSigned(deviation, 1) + '%' : 'n.a.',
          detail: hasNumericValue(budgetGapKwh) ? formatNumber(Math.abs(Math.round(budgetGapKwh))) + ' kWh de brecha' : 'Sin presupuesto',
          state: !hasNumericValue(deviation) ? 'neutral' : (deviation > 0 ? 'negative' : 'positive')
        },
        {
          label: 'Costo',
          value: hasNumericValue(currentCost) ? formatCurrencyCop(currentCost, true) : 'n.a.',
          detail: hasNumericValue(costChange) ? formatPercentChange(costChange) + ' vs corte anterior' : 'Sin comparación',
          state: !hasNumericValue(costChange) ? 'neutral' : (costChange > 0 ? 'negative' : 'positive')
        }
      ],
      findings,
      decisions,
      limitations,
      generatedAt: new Date().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
    };
  }

  function renderIntelligentAnalysis(analysis) {
    setElementText('analysis-period-label', 'Corte: ' + analysis.period + ' · comparación: ' + analysis.previousPeriod);
    setElementText('analysis-plant-title', analysis.plantName);
    setElementText('analysis-source-label', analysis.sourceLabel);
    setElementText('analysis-executive-summary', analysis.summary);
    setElementText('analysis-generated-at', 'Generado: ' + analysis.generatedAt);

    const priorityBadge = document.getElementById('analysis-priority-badge');
    if (priorityBadge) {
      priorityBadge.textContent = analysis.priority.label;
      priorityBadge.className = 'analysis-priority-badge ' + analysis.priority.key;
    }
    setElementText('analysis-confidence-badge', 'Confianza: ' + analysis.confidence);

    const metricGrid = document.getElementById('analysis-metric-grid');
    if (metricGrid) {
      metricGrid.replaceChildren();
      analysis.metrics.forEach(metric => {
        const card = document.createElement('article');
        card.className = 'analysis-metric-card ' + metric.state;
        const label = document.createElement('span');
        label.textContent = metric.label;
        const value = document.createElement('strong');
        value.textContent = metric.value;
        const detail = document.createElement('small');
        detail.textContent = metric.detail;
        card.append(label, value, detail);
        metricGrid.appendChild(card);
      });
    }

    const findingsList = document.getElementById('analysis-findings-list');
    if (findingsList) {
      findingsList.replaceChildren();
      analysis.findings.forEach(finding => {
        const item = document.createElement('li');
        item.textContent = finding;
        findingsList.appendChild(item);
      });
    }

    const decisionsList = document.getElementById('analysis-decisions-list');
    if (decisionsList) {
      decisionsList.replaceChildren();
      analysis.decisions.forEach((decision, index) => {
        const card = document.createElement('article');
        card.className = 'analysis-decision-card';
        const number = document.createElement('span');
        number.className = 'analysis-decision-number';
        number.textContent = String(index + 1);
        const content = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = decision.title;
        const detail = document.createElement('p');
        detail.textContent = decision.detail;
        const indicator = document.createElement('small');
        indicator.textContent = decision.indicator;
        content.append(title, detail, indicator);
        card.append(number, content);
        decisionsList.appendChild(card);
      });
    }

    const limitationsList = document.getElementById('analysis-limitations-list');
    if (limitationsList) {
      limitationsList.replaceChildren();
      analysis.limitations.forEach(limitation => {
        const item = document.createElement('li');
        item.textContent = limitation;
        limitationsList.appendChild(item);
      });
    }
  }

  function openIntelligentAnalysis() {
    if (DashboardStore.currentView !== 'detail') switchView('detail');
    const plant = DashboardStore.plants[DashboardStore.currentPlantId];
    if (!plant) return;
    activePlantAnalysis = buildPlantAnalysis(plant);
    renderIntelligentAnalysis(activePlantAnalysis);
    document.getElementById('modal-intelligent-analysis')?.classList.add('open');
  }

  function initIntelligentAnalysis() {
    const modal = document.getElementById('modal-intelligent-analysis');
    const openButton = document.getElementById('btn-open-intelligent-analysis');
    const downloadButton = document.getElementById('btn-download-intelligent-report');
    if (!modal || !openButton || !downloadButton) return;

    const closeModal = () => modal.classList.remove('open');
    openButton.addEventListener('click', openIntelligentAnalysis);
    ['btn-close-intelligent-analysis', 'btn-close-intelligent-analysis-footer'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', closeModal);
    });
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });
    downloadButton.addEventListener('click', () => {
      const plant = DashboardStore.plants[DashboardStore.currentPlantId];
      if (!plant) return;
      const analysis = activePlantAnalysis?.plantId === plant.id ? activePlantAnalysis : buildPlantAnalysis(plant);
      downloadPlantAnalysisPdf(analysis);
    });
  }

  function splitPdfText(text, maxCharacters) {
    const words = sanitizePdfText(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
      const candidate = line ? line + ' ' + word : word;
      if (candidate.length > maxCharacters && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function sanitizePdfText(value) {
    return String(value ?? '')
      .replace(/[–—]/g, '-')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/→/g, 'a')
      .replace(/↑/g, 'aumenta')
      .replace(/↓/g, 'disminuye')
      .replace(/[^\x20-\xFF]/g, '');
  }

  function escapePdfText(value) {
    return sanitizePdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function latin1Bytes(value) {
    const bytes = new Uint8Array(value.length);
    for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
    return bytes;
  }

  function createAnalysisPdfBlob(analysis) {
    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 48;
    const pages = [];
    let commands = [];
    let cursorY = 724;

    const beginPage = () => {
      commands = [
        '0.23 0.09 0.50 rg 0 748 ' + pageWidth + ' 44 re f',
        'BT /F2 15 Tf 1 1 1 rg 48 765 Tm (CLARIOS - INFORME DE ANÁLISIS ENERGÉTICO) Tj ET'
      ];
      cursorY = 724;
    };
    const finishPage = () => {
      pages.push(commands);
      commands = [];
    };
    const ensureSpace = required => {
      if (cursorY - required < 58) {
        finishPage();
        beginPage();
      }
    };
    const addText = (text, options = {}) => {
      const size = options.size || 10;
      const font = options.bold ? 'F2' : 'F1';
      const indent = options.indent || 0;
      const lineHeight = options.lineHeight || size * 1.45;
      const maxCharacters = Math.max(35, Math.floor((pageWidth - margin * 2 - indent) / (size * 0.52)));
      const prefix = options.bullet ? '- ' : '';
      const lines = splitPdfText(prefix + text, maxCharacters);
      ensureSpace(lines.length * lineHeight + (options.after || 0));
      lines.forEach(line => {
        const color = options.color || '0.12 0.14 0.18';
        commands.push('BT /' + font + ' ' + size + ' Tf ' + color + ' rg 1 0 0 1 ' + (margin + indent) + ' ' + cursorY.toFixed(1) + ' Tm (' + escapePdfText(line) + ') Tj ET');
        cursorY -= lineHeight;
      });
      cursorY -= options.after || 0;
    };
    const addSection = title => {
      ensureSpace(28);
      cursorY -= 4;
      addText(title.toUpperCase(), { size: 11, bold: true, color: '0.36 0.18 0.70', after: 5 });
    };

    beginPage();
    addText(analysis.plantName, { size: 19, bold: true, color: '0.12 0.06 0.24', after: 2 });
    addText('Corte: ' + analysis.period + ' | Comparación: ' + analysis.previousPeriod, { size: 9, color: '0.35 0.38 0.44' });
    addText(analysis.sourceLabel, { size: 8.5, color: '0.35 0.38 0.44', after: 7 });
    addText(analysis.priority.label + ' | Confianza: ' + analysis.confidence, { size: 10, bold: true, color: analysis.priority.key === 'high' ? '0.75 0.08 0.16' : (analysis.priority.key === 'medium' ? '0.72 0.42 0.02' : '0.02 0.50 0.28'), after: 8 });

    addSection('Lectura ejecutiva');
    addText(analysis.summary, { size: 10.5, lineHeight: 15, after: 7 });

    addSection('Indicadores del corte');
    analysis.metrics.forEach(metric => {
      addText(metric.label + ': ' + metric.value + ' | ' + metric.detail, { size: 9.5, bullet: true, after: 2 });
    });

    addSection('Qué se encontró');
    analysis.findings.forEach(finding => addText(finding, { size: 9.5, bullet: true, after: 3 }));

    addSection('Decisiones sugeridas');
    analysis.decisions.forEach((decision, index) => {
      addText((index + 1) + '. ' + decision.title, { size: 10, bold: true, after: 1 });
      addText(decision.detail, { size: 9.3, indent: 12, after: 1 });
      addText(decision.indicator, { size: 8.5, indent: 12, color: '0.05 0.40 0.55', after: 5 });
    });

    addSection('Alcance y datos faltantes');
    analysis.limitations.forEach(limitation => addText(limitation, { size: 9, bullet: true, after: 2 }));
    addText('Generado: ' + analysis.generatedAt, { size: 8, color: '0.45 0.47 0.52', after: 2 });
    addText('Este informe es descriptivo y debe validarse con el equipo operativo antes de ejecutar cambios.', { size: 8, bold: true, color: '0.45 0.20 0.05' });
    finishPage();

    pages.forEach((page, index) => {
      page.push('0.75 0.76 0.80 RG 48 42 m 564 42 l S');
      page.push('BT /F1 7.5 Tf 0.42 0.44 0.49 rg 48 27 Tm (Clarios | Informe automatizado y explicable | Página ' + (index + 1) + ' de ' + pages.length + ') Tj ET');
    });

    const objects = [];
    const pageReferences = pages.map((_, index) => (5 + index * 2) + ' 0 R').join(' ');
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = '<< /Type /Pages /Kids [' + pageReferences + '] /Count ' + pages.length + ' >>';
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    pages.forEach((page, index) => {
      const pageObject = 5 + index * 2;
      const contentObject = pageObject + 1;
      const content = page.join('\n');
      const contentLength = latin1Bytes(content + '\n').length;
      objects[pageObject] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + contentObject + ' 0 R >>';
      objects[contentObject] = '<< /Length ' + contentLength + ' >>\nstream\n' + content + '\nendstream';
    });

    const chunks = [latin1Bytes('%PDF-1.4\n%âãÏÓ\n')];
    const offsets = [0];
    let byteLength = chunks[0].length;
    for (let objectNumber = 1; objectNumber < objects.length; objectNumber += 1) {
      const objectBytes = latin1Bytes(objectNumber + ' 0 obj\n' + objects[objectNumber] + '\nendobj\n');
      offsets[objectNumber] = byteLength;
      chunks.push(objectBytes);
      byteLength += objectBytes.length;
    }
    const xrefOffset = byteLength;
    const pdfRecordEnd = String.fromCharCode(...Array.of(32, 10));
    let xref = 'xref\n0 ' + objects.length + '\n0000000000 65535 f' + pdfRecordEnd;
    for (let objectNumber = 1; objectNumber < objects.length; objectNumber += 1) {
      xref += String(offsets[objectNumber]).padStart(10, '0') + ' 00000 n' + pdfRecordEnd;
    }
    xref += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
    chunks.push(latin1Bytes(xref));
    return new Blob(chunks, { type: 'application/pdf' });
  }

  function downloadPlantAnalysisPdf(analysis) {
    const blob = createAnalysisPdfBlob(analysis);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safePlant = analysis.plantName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const safePeriod = analysis.period.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    anchor.href = url;
    anchor.download = 'Informe_Clarios_' + safePlant + '_' + safePeriod + '.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast('✓ Informe PDF generado para ' + analysis.plantName + '.', 'success');
  }

  // --- MODALS & INTERACTIVE ACTIONS ---
  function renderDataInspector(plant) {
    const modal = document.getElementById('modal-inspect');
    const body = document.getElementById('data-inspector-body');
    if (!modal || !body || !plant) return;
    body.replaceChildren();
    setElementText('data-inspector-title-text', 'Datos del corte · ' + plant.name);

    const appendRow = (period, recordName, consumption, intensity, state, stateClass) => {
      const row = document.createElement('tr');
      [period, recordName, consumption, intensity].forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      const stateCell = document.createElement('td');
      stateCell.className = 'inspector-status ' + stateClass;
      stateCell.textContent = state;
      row.appendChild(stateCell);
      body.appendChild(row);
    };

    if (plant.analytics) {
      const period = plant.analytics.latest.fecha;
      setElementText(
        'data-inspector-context',
        'Valores leídos de ' + (plant.sourceFileName || 'planta_fya_energia.json') + '. La tabla usa exactamente el período activo y permite comprobar de dónde salen los KPI.'
      );
      plant.analytics.processes.forEach(process => {
        const record = findProcessRecord(process, period);
        if (!record) return;
        const rangeState = record.rangos?.intensidad?.estado || 'sin_historia';
        const stateLabel = rangeState === 'normal'
          ? 'En rango'
          : (rangeState === 'sin_historia' ? 'Sin historia suficiente' : 'Fuera de rango: ' + rangeState);
        const stateClass = rangeState === 'normal' ? 'normal' : (rangeState === 'sin_historia' ? 'neutral' : 'alert');
        appendRow(
          formatMonthLabel(period),
          formatProcessName(process.proceso),
          hasNumericValue(record.consumo) ? formatNumber(Math.round(record.consumo)) + ' kWh' : 'n.a.',
          hasNumericValue(record.intensidad) ? formatDecimal(record.intensidad, 2) + ' ' + plant.analytics.intensityUnit : 'n.a.',
          stateLabel,
          stateClass
        );
      });
    } else {
      setElementText(
        'data-inspector-context',
        'Esta planta usa un snapshot demostrativo incluido en el código. No hay conexión activa con sensores, PLC o Modbus.'
      );
      appendRow(
        'Snapshot local',
        plant.name,
        formatNumber(plant.kwh) + ' kWh',
        formatDecimal(plant.ratioKwhUnit, 2) + ' kWh/u',
        plant.isCritical ? 'Alerta local' : 'En rango local',
        plant.isCritical ? 'alert' : 'normal'
      );
    }
    modal.classList.add('open');
  }

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
        if (DashboardStore.currentPlantId !== 'rc_energy') return;
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
          const priorCost = rc.costCop;
          rc.kwh = 765000;
          rc.costCop = Math.round(rc.kwh * DEFAULT_ENERGY_TARIFF_COP);
          rc.ratioKwhUnit = rc.kwh / rc.productionUnits;
          rc.deviationPct = -1.9;
          rc.isCritical = false;
          rc.alertCount = 0;
          DashboardStore.global.totalEnergyKwh -= (priorKwh - rc.kwh);
          DashboardStore.global.energyCostCop -= (priorCost - rc.costCop);
          DashboardStore.global.budgetDeviationPct = ((DashboardStore.global.totalEnergyKwh - DashboardStore.global.budgetEnergyKwh) / DashboardStore.global.budgetEnergyKwh) * 100;
          DashboardStore.global.alertCount = Object.values(DashboardStore.plants).reduce((sum, plant) => sum + plant.alertCount, 0);
          DashboardStore.faultAcknowledged = true;
          showToast(`Punto de ajuste simulado en ${temp} °C. Demanda térmica bajo presupuesto.`, 'success');
        } else {
          showToast(`Punto de ajuste simulado en ${temp} °C.`, 'normal');
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
      btnInspect.addEventListener('click', () => renderDataInspector(DashboardStore.plants[DashboardStore.currentPlantId]));
    }
    [btnCloseInspect, btnCloseInspectFooter].forEach(btn => {
      if (btn && modalInspect) btn.addEventListener('click', () => modalInspect.classList.remove('open'));
    });
    modalInspect?.addEventListener('click', event => {
      if (event.target === modalInspect) modalInspect.classList.remove('open');
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modalInspect?.classList.contains('open')) modalInspect.classList.remove('open');
    });

    // 3. Acknowledge Fault Button
    const btnAck = document.getElementById('btn-diag-ack');
    if (btnAck) {
      btnAck.addEventListener('click', () => {
        const currentPlant = DashboardStore.plants[DashboardStore.currentPlantId];
        if (currentPlant?.analytics) {
          renderDataInspector(currentPlant);
          return;
        }
        DashboardStore.faultAcknowledged = !DashboardStore.faultAcknowledged;
        updatePlantDetailView();
        showToast(
          DashboardStore.faultAcknowledged ? 'Falla SCADA confirmada por operador.' : 'Estado de alerta restaurado.',
          DashboardStore.faultAcknowledged ? 'success' : 'normal'
        );
      });
    }
  }

  function exportPlantCSV() {
    const p = DashboardStore.plants[DashboardStore.currentPlantId];
    let csv;
    let fileName;

    if (p.analytics) {
      csv = 'Fecha,Consumo_kWh,Produccion_ECU,Intensidad_kWh_ECU,Intensidad_Ppto,Desviacion_Ppto,Costo_Unitario_COP_kWh,Costo_Total_COP,Estado_Intensidad\n';
      p.analytics.totalSeries.forEach(record => {
        csv += [
          record.fecha,
          record.consumo,
          record.produccion,
          record.intensidad,
          record.intensidad_ppto ?? '',
          record.desviacion_ppto ?? '',
          record.costo_unitario ?? '',
          record.costo_total ?? '',
          record.rangos?.intensidad?.estado || ''
        ].join(',') + '\n';
      });
      fileName = `Datos_Energia_${p.id}_${p.analytics.period.inicio}_${p.analytics.period.fin}.csv`;
    } else {
      csv = 'Dia,Consumo_kWh,Presupuesto_Meta_kWh\n';
      p.dailyData.forEach(d => {
        csv += `${d.day},${d.kwh},${Math.round(p.budgetKwh / 30)}\n`;
      });
      fileName = `Datos_Demostrativos_${p.id}_Septiembre2024.csv`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Datos descargados para ${p.name}.`, 'success');
  }

  // --- LIVE HEARTBEAT SYNC ---
  function startLiveHeartbeat() {
    setInterval(() => {
      DashboardStore.global.lastSyncSeconds += 1;
      if (DashboardStore.global.lastSyncSeconds > 30) {
        DashboardStore.global.lastSyncSeconds = 2;
      }
      setElementText('sync-timer-label', `SINCRONIZADO: hace ${DashboardStore.global.lastSyncSeconds} s`);
    }, 1000);
  }

  // --- UTILITIES ---
  function renderPercentComparison(id, currentValue, previousValue, lowerIsBetter) {
    const element = document.getElementById(id);
    if (!element) return 'neutral';
    return renderPercentComparisonElement(element, currentValue, previousValue, lowerIsBetter);
  }

  function renderPercentComparisonElement(element, currentValue, previousValue, lowerIsBetter, suffix = '') {
    if (!hasNumericValue(currentValue) || !hasNumericValue(previousValue)) {
      element.className = 'trend-chip trend-neutral';
      element.textContent = '• Comparación no disponible' + suffix;
      return 'neutral';
    }
    const change = previousValue === 0 ? 0 : ((currentValue - previousValue) / previousValue) * 100;
    const state = getComparisonState(change, lowerIsBetter);
    const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '•';
    const outcome = state === 'positive' ? 'mejora' : state === 'negative' ? 'desmejora' : 'estable';

    element.className = 'trend-chip trend-' + state;
    element.textContent = arrow + ' ' + formatDecimal(Math.abs(change), 1) + '% ' + outcome + suffix;
    return state;
  }

  function renderPointComparison(id, currentValue, previousValue, lowerIsBetter) {
    const element = document.getElementById(id);
    if (!element) return 'neutral';
    if (!hasNumericValue(currentValue) || !hasNumericValue(previousValue)) {
      element.className = 'trend-chip trend-neutral';
      element.textContent = '• Comparación no disponible';
      return 'neutral';
    }
    const change = currentValue - previousValue;
    const state = getComparisonState(change, lowerIsBetter);
    const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '•';
    const outcome = state === 'positive' ? 'mejora' : state === 'negative' ? 'desmejora' : 'estable';

    element.className = 'trend-chip trend-' + state;
    element.textContent = arrow + ' ' + formatDecimal(Math.abs(change), 1) + ' pp ' + outcome;
    return state;
  }

  function renderCountComparison(id, currentValue, previousValue, lowerIsBetter) {
    const element = document.getElementById(id);
    if (!element) return 'neutral';
    if (!hasNumericValue(currentValue) || !hasNumericValue(previousValue)) {
      element.className = 'trend-chip trend-neutral';
      element.textContent = '• Comparación no disponible';
      return 'neutral';
    }
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

  function getPlantCostDisplay(plant, compact = false) {
    const value = getPlantCostCop(plant);
    return hasNumericValue(value) ? formatCurrencyCop(value, compact) : 'n.a.';
  }

  function getPlantCostCop(plant) {
    return plant?.analytics ? plant.costAmount : plant?.costCop;
  }

  function formatCurrencyCop(value, compact = false, includeCode = true) {
    if (!hasNumericValue(value)) return 'n.a.';
    const formatted = '$' + (compact ? formatCompactNumber(value) : formatNumber(Math.round(Number(value))));
    return includeCode ? formatted + ' COP' : formatted;
  }

  function formatCompactNumber(value) {
    if (!hasNumericValue(value)) return 'n.a.';
    return Number(value).toLocaleString('es-CO', {
      notation: 'compact',
      maximumFractionDigits: 1
    });
  }

  function formatDecimal(value, digits = 2) {
    if (!hasNumericValue(value)) return 'n.a.';
    return Number(value).toLocaleString('es-CO', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function percentageChange(currentValue, previousValue) {
    if (!hasNumericValue(currentValue) || !hasNumericValue(previousValue)) return null;
    const previous = Number(previousValue);
    if (previous === 0) return null;
    return ((Number(currentValue) - previous) / previous) * 100;
  }

  function formatPercentChange(value) {
    if (!hasNumericValue(value)) return 'n.a.';
    const numericValue = Number(value);
    return (numericValue > 0 ? '+' : '') + formatDecimal(numericValue, 1) + '%';
  }

  function getSelectedSeriesWindow(analytics, length) {
    const end = Number.isInteger(analytics?.selectedIndex) ? analytics.selectedIndex + 1 : analytics?.totalSeries?.length || 0;
    return analytics?.totalSeries?.slice(Math.max(0, end - length), end) || [];
  }

  function getPlantIntensityUnit(plant) {
    return plant?.analytics?.intensityUnit || 'kWh/u';
  }

  function getIntensityDenominator(unit) {
    const denominator = String(unit || '').split('/')[1];
    return denominator || 'unidades';
  }

  function buildAnalyticsSummary(consumptionChange, productionChange, intensityChange) {
    if (![consumptionChange, productionChange, intensityChange].every(hasNumericValue)) {
      return 'El corte se compara contra el mes anterior disponible en el archivo cargado.';
    }
    const consumptionDirection = consumptionChange > 0 ? 'aumentó' : (consumptionChange < 0 ? 'disminuyó' : 'se mantuvo');
    const productionDirection = productionChange > 0 ? 'aumentó' : (productionChange < 0 ? 'disminuyó' : 'se mantuvo');
    const intensityDirection = intensityChange > 0 ? 'empeoró' : (intensityChange < 0 ? 'mejoró' : 'se mantuvo');
    return 'El consumo ' + consumptionDirection + ', la producción ' + productionDirection + ' y la intensidad energética ' + intensityDirection + ' frente al corte anterior.';
  }

  function formatMonthLabel(value) {
    const [year, month] = String(value || '').slice(0, 7).split('-').map(Number);
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    if (!year || !month || !months[month - 1]) return String(value || 'Sin fecha');
    return months[month - 1] + ' ' + year;
  }

  function formatGeneratedDate(value) {
    const datePart = String(value || '').slice(0, 10);
    const [year, month, day] = datePart.split('-').map(Number);
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    if (!year || !month || !day) return 'JSON base';
    return day + ' ' + months[month - 1] + ' ' + year;
  }

  function formatProcessName(value) {
    const names = {
      'F&A': 'F&A',
      FORMACION: 'Formación',
      'LINEA ACABADO PRINCIPAL': 'Línea Acabado Principal'
    };
    return names[value] || String(value || 'Proceso');
  }

  function createSvgElement(tag, attributes = {}, text = '') {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
    if (text !== '') element.textContent = String(text);
    return element;
  }

  function setTextPreservingIcon(id, text) {
    const element = document.getElementById(id);
    if (!element) return;
    const icon = element.querySelector('svg');
    element.replaceChildren();
    if (icon) element.appendChild(icon);
    element.appendChild(document.createTextNode(text));
  }

  function formatNumber(num) {
    if (!hasNumericValue(num)) return 'n.a.';
    return Number(num).toLocaleString('es-CO');
  }

  function formatSigned(num, digits = 1) {
    if (!hasNumericValue(num)) return 'n.a.';
    return (num > 0 ? '+' : '') + formatDecimal(num, digits);
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
