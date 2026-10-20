import { initTheme } from './theme.js';
import {
  deriveAnalyticalAlerts,
  findProcessRecord,
  hasNumericValue,
  normalizeEnergyDataset,
  selectAnalyticsPeriod
} from './plant-data.js';
import * as api from './api.js';

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

  const CURRENCY_CODE = 'COP';

  // --- DASHBOARD DATA STORE ---
  const DashboardStore = {
    currentView: 'landing', // 'landing' | 'detail' | 'sources'
    currentPlantId: null,
    pipeline: { online: false, excel: null, loads: [], runningJobId: null },
    // Umbral de alerta por planta (fracción) guardado en el backend; las plantas sin valor usan el defecto.
    thresholds: { defecto: 0.10, umbrales: {} },
    // Corte común de la vista general (modo pipeline): mes que tienen todas las plantas.
    globalPeriod: null,
    selectedPeriod: null,

    // Indicadores globales (los calcula recalculatePipelineGlobalMetrics)
    global: {},

    // Plantas del pipeline (una por serie de index.json)
    plants: {},

    sources: []
  };

  let activePlantAnalysis = null;
  function applyEnergyDataset(plant, analytics) {
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
    const previousAlerts = new Set(deriveAnalyticalAlerts(analytics.processes, previous.fecha).map(alert => alert.proceso)).size;
    const processColors = ['purple', 'purple-light', 'purple-dark'];

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
    // Alertas por proceso (ver deriveAnalyticalAlerts); un proceso puede tener dos (rango y presupuesto).
    const alertedProcesses = new Set(analytics.alerts.map(alert => alert.proceso)).size;
    plant.alertCount = alertedProcesses;
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
    // Estado de la planta: misma regla que la KPI "Estado de plantas" (ver plantsWithAlert).
    plant.performanceChange = performanceChange(plant, latest.fecha);
    plant.isCritical = hasNumericValue(plant.performanceChange) && plant.performanceChange > getAlertThreshold(plant);
    plant.status = plant.isCritical ? 'critical' : 'normal';
    plant.statusLabel = plant.isCritical ? 'Con alerta' : 'En rango';
    plant.alertSnippet = plant.isCritical
      ? 'Consumo por unidad ' + formatDecimal(plant.performanceChange * 100, 1) + '% peor que su promedio ' + (Number(latest.fecha.slice(0, 4)) - 1)
      : '';
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
    initTheme();
    initNavigation();
    initPeriodContext();
    initTachometer();
    initModals();
    initIntelligentAnalysis();
    initLoadSourceModal();
    initDataGate();
    initThresholdsPanel();
    initKpiDetails();
    initForecast();
    startDashboard();
  });

  /** Carga los datos y, si hay plantas, pinta el dashboard. */
  async function startDashboard() {
    await loadDashboardData();
    if (!hasPlants()) return;
    renderAllViews();
    if (window.location.hash === '#sources' && DashboardStore.currentView !== 'sources') switchView('sources');
    syncPeriodFiltersForView();
  }

  function hasPlants() {
    return Object.keys(DashboardStore.plants).length > 0;
  }

  // --- PANTALLA SIN DATOS ---
  // Cubre el dashboard mientras carga, si el backend no responde o si aún no hay JSON del pipeline.
  const DATA_GATE_STATES = {
    loading: { title: 'Cargando datos…', text: 'Consultando el backend del pipeline.' },
    offline: {
      title: 'Backend no disponible',
      text: 'El dashboard necesita la API del pipeline (http://127.0.0.1:8000). Iníciala junto con el front desde la raíz del repo:',
      command: true,
      retry: true
    },
    empty: {
      title: 'Sin datos del pipeline',
      text: 'El backend responde, pero no hay datos generados. Carga el Excel fuente para calcular indicadores y pronósticos.',
      load: true,
      retry: true
    }
  };

  function initDataGate() {
    document.getElementById('btn-data-gate-retry')?.addEventListener('click', startDashboard);
    // Abre el mismo modal de carga que el botón de Fuentes de datos.
    document.getElementById('btn-data-gate-load')?.addEventListener('click', () => {
      document.getElementById('btn-sources-load-data')?.click();
    });
  }

  function setDataGate(state) {
    const gate = document.getElementById('data-gate');
    if (!gate) return;
    const config = DATA_GATE_STATES[state];
    gate.hidden = !config;
    document.body.classList.toggle('data-gate-open', Boolean(config));
    if (!config) return;
    setElementText('data-gate-title', config.title);
    setElementText('data-gate-text', config.text);
    document.getElementById('data-gate-command').hidden = !config.command;
    document.getElementById('btn-data-gate-retry').hidden = !config.retry;
    document.getElementById('btn-data-gate-load').hidden = !config.load;
    document.getElementById('link-data-gate-template').hidden = !config.load;
  }

  // --- BACKEND / PIPELINE DATA ---
  /** Todas las plantas salen de los JSON del pipeline (/api/datos); sin backend no hay dashboard. */
  async function loadDashboardData() {
    setDataGate('loading');
    try {
      await api.salud();
    } catch (error) {
      DashboardStore.pipeline.online = false;
      setDataGate('offline');
      return;
    }
    DashboardStore.pipeline.online = true;
    try {
      await loadPipelineDatasets();
    } catch (error) {
      // Sin JSON generados todavía: se puede cargar el Excel desde la pantalla de espera.
      console.warn('No fue posible cargar los datos del pipeline.', error);
      setDataGate('empty');
    }
    await refreshSourceLoads();
    resumeRunningLoad();
    updateSourcesActions();
  }

  async function loadPipelineDatasets() {
    const thresholds = await api.umbrales().catch(() => null);
    if (thresholds) DashboardStore.thresholds = thresholds;
    const index = await api.indiceSeries();
    const series = Array.isArray(index?.series) ? index.series : [];
    const results = await Promise.allSettled(series.map(async item => {
      const dataset = await api.serie(item.archivo);
      return { item, analytics: normalizeEnergyDataset(dataset, item.id) };
    }));

    const plantsByName = series.reduce((count, item) => {
      count[item.planta] = (count[item.planta] || 0) + 1;
      return count;
    }, {});
    const pipelinePlants = {};
    results.forEach((result, position) => {
      if (result.status !== 'fulfilled') {
        console.warn('Serie omitida: ' + series[position]?.id, result.reason);
        return;
      }
      const { item, analytics } = result.value;
      const previous = DashboardStore.plants[item.id];
      const plant = buildPipelinePlant(item, Object.keys(pipelinePlants).length + 1, plantsByName[item.planta] > 1);
      // Conserva el corte que el usuario tenía seleccionado si sigue existiendo.
      if (previous?.currentPeriod) selectAnalyticsPeriod(analytics, previous.currentPeriod);
      applyEnergyDataset(plant, analytics);
      pipelinePlants[item.id] = plant;
    });
    if (!Object.keys(pipelinePlants).length) throw new Error('index.json no tiene series válidas');

    DashboardStore.plants = pipelinePlants;
    DashboardStore.pipeline.generatedAt = index.generado;
    DashboardStore.pipeline.commonEnd = index.fecha_fin_comun;
    if (!DashboardStore.plants[DashboardStore.currentPlantId]) {
      DashboardStore.currentPlantId = Object.keys(pipelinePlants)[0];
    }
    const common = getCommonPeriods();
    applyGlobalPeriod(common.includes(DashboardStore.globalPeriod) ? DashboardStore.globalPeriod : common.at(-1));
    DashboardStore.sources = series.filter(item => pipelinePlants[item.id]).map(item => ({
        id: 'pipeline-' + item.id,
        name: item.archivo,
        scope: pipelinePlants[item.id].name,
        format: 'JSON',
        period: formatMonthLabel(item.periodo?.inicio) + ' – ' + formatMonthLabel(item.periodo?.fin),
        status: 'validated',
        href: api.dataUrl(item.archivo),
        origin: 'Generado por el pipeline desde el Excel fuente',
        importedAt: formatGeneratedDate(index.generado)
      }));
    setDataGate(null);
  }

  function buildPipelinePlant(item, number, showService) {
    const serviceLabel = item.servicio === 'gas' ? 'Gas' : 'Energía';
    const name = showService ? item.planta + ' · ' + serviceLabel : item.planta;
    return {
      id: item.id,
      number: String(number),
      name,
      fullName: 'Planta ' + name,
      tag: item.id.toUpperCase(),
      status: 'normal',
      statusLabel: 'Datos en rango',
      isCritical: false,
      isPipeline: true,
      service: item.servicio,
      unit: item.unidad,
      sourceFileName: item.archivo,
      previous: {}
    };
  }

  async function refreshSourceLoads() {
    const [excel, loads] = await Promise.all([
      api.fuenteActual().catch(() => null),
      api.historialCargas().catch(() => [])
    ]);
    DashboardStore.pipeline.excel = excel;
    DashboardStore.pipeline.loads = Array.isArray(loads) ? loads : [];
    if (excel) {
      DashboardStore.sources = DashboardStore.sources.filter(source => source.id !== 'pipeline-excel');
      DashboardStore.sources.unshift({
        id: 'pipeline-excel',
        name: excel.archivo,
        scope: (excel.validacion?.hojas?.length || 0) + ' hojas · todas las plantas',
        format: 'EXCEL',
        period: 'Modificado ' + formatGeneratedDate(excel.modificado),
        status: excel.validacion?.ok ? 'validated' : 'registered',
        href: '',
        origin: 'Excel fuente vigente · entrada del pipeline',
        binary: true,
        importedAt: formatGeneratedDate(excel.modificado)
      });
    }
  }

  /** Si al abrir el dashboard ya hay una carga en curso, sigue su progreso. */
  async function resumeRunningLoad() {
    const current = await api.jobActual().catch(() => null);
    if (current?.estado === 'corriendo') followLoadJob(current.id);
  }

  /** Consulta el job hasta que termine (un solo seguimiento por job) y recarga los datos al final. */
  async function followLoadJob(jobId) {
    if (DashboardStore.pipeline.runningJobId === jobId) return;
    DashboardStore.pipeline.runningJobId = jobId;
    updateSourcesActions();
    try {
      const final = await api.esperarJob(jobId, renderLoadProgress);
      if (final.estado === 'ok') {
        await loadPipelineDatasets();
        showToast('✓ Datos fuente actualizados: indicadores y pronósticos recalculados.', 'success');
      } else {
        showToast('La carga falló y se restauró la versión anterior: ' + (final.error || 'error desconocido'), 'danger');
      }
      await refreshSourceLoads();
      renderAllViews();
      syncPeriodFiltersForView();
      return final;
    } finally {
      DashboardStore.pipeline.runningJobId = null;
      updateSourcesActions();
    }
  }

  function updateSourcesActions() {
    const online = DashboardStore.pipeline.online;
    const loadButton = document.getElementById('btn-sources-load-data');
    const templateLink = document.getElementById('link-sources-template');
    if (loadButton) {
      loadButton.hidden = !online;
      loadButton.textContent = DashboardStore.pipeline.runningJobId ? '⟳ Carga en curso…' : '⇪ Cargar datos fuente';
    }
    if (templateLink) templateLink.hidden = !online;
  }

  function renderSourceLoads() {
    const card = document.getElementById('sources-loads-card');
    const body = document.getElementById('loads-table-body');
    if (!card || !body) return;
    card.hidden = !DashboardStore.pipeline.online;
    const excel = DashboardStore.pipeline.excel;
    setElementText('sources-excel-summary', excel
      ? 'Vigente: ' + excel.archivo + ' · ' + (excel.validacion?.hojas || []).map(sheet => sheet.hoja).join(', ')
      : 'Sin Excel fuente');
    body.replaceChildren();
    const loads = DashboardStore.pipeline.loads;
    if (!loads.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = 'Aún no hay cargas desde el dashboard. El Excel vigente se cargó directamente en el servidor.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    loads.forEach(load => {
      const row = document.createElement('tr');
      const when = document.createElement('td');
      when.textContent = formatGeneratedDate(load.inicio);
      const file = document.createElement('td');
      file.textContent = load.archivo;
      const changes = document.createElement('td');
      changes.textContent = summarizeChanges(load.cambios);
      const status = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'source-status-badge ' + (load.estado === 'ok' ? 'validated' : 'registered');
      badge.textContent = load.estado === 'ok' ? '● Aplicada' : load.estado === 'error' ? '● Falló (restaurada)' : '● En curso';
      if (load.error) badge.title = load.error;
      status.appendChild(badge);
      row.append(when, file, changes, status);
      body.appendChild(row);
    });
  }

  function summarizeChanges(cambios) {
    if (!cambios) return '—';
    if (cambios.sin_cambios) return 'Sin cambios en los datos';
    const parts = [];
    if (cambios.plantas_nuevas?.length) parts.push('Nuevas: ' + cambios.plantas_nuevas.join(', '));
    if (cambios.plantas_faltantes?.length) parts.push('Retiradas: ' + cambios.plantas_faltantes.join(', '));
    const newMonths = (cambios.series || []).reduce((sum, serie) => sum + serie.meses_nuevos.length, 0);
    const modified = (cambios.series || []).reduce((sum, serie) => sum + serie.n_modificados, 0);
    if (newMonths) parts.push(pluralMonths(newMonths, 'nuevo'));
    if (modified) parts.push(pluralMonths(modified, 'modificado'));
    return parts.join(' · ') || 'Sin cambios en los totales';
  }

  function pluralMonths(count, adjective) {
    return count === 1 ? '1 mes ' + adjective : count + ' meses ' + adjective + 's';
  }

  // --- MODAL: CARGAR DATOS FUENTE ---
  const LOAD_PHASES = [
    ['limpieza', 'Limpieza'],
    ['backtest', 'Backtest'],
    ['modelos', 'Modelos'],
    ['monitoreo', 'Monitoreo'],
    ['listo', 'Listo']
  ];

  function initLoadSourceModal() {
    const modal = document.getElementById('modal-load-source');
    const fileInput = document.getElementById('load-file-input');
    const dropzone = document.getElementById('load-file-dropzone');
    if (!modal || !fileInput) return;
    const buttons = {
      validate: document.getElementById('btn-validate-load-source'),
      apply: document.getElementById('btn-apply-load-source'),
      back: document.getElementById('btn-back-load-source'),
      cancel: document.getElementById('btn-cancel-load-source')
    };
    let pending = null;

    const showError = message => {
      const error = document.getElementById('load-source-error');
      if (!error) return;
      error.textContent = message || '';
      error.hidden = !message;
    };

    const showStep = step => {
      ['select', 'review', 'progress'].forEach(name => {
        const section = document.getElementById('load-step-' + name);
        if (section) section.hidden = name !== step;
      });
      const canApply = step === 'review' && pending?.validacion?.ok;
      buttons.validate.hidden = step !== 'select';
      buttons.apply.hidden = !canApply;
      buttons.back.hidden = step !== 'review';
      buttons.cancel.textContent = step === 'progress' ? 'Cerrar' : 'Cancelar';
    };

    const updateFileState = () => {
      const file = fileInput.files?.[0];
      document.getElementById('load-file-empty-state').hidden = Boolean(file);
      document.getElementById('load-file-selected-state').hidden = !file;
      setElementText('load-selected-file-name', file?.name || '');
      setElementText('load-selected-file-meta', file ? formatFileSize(file.size) + ' · listo para validar' : '');
      buttons.validate.disabled = !file;
      showError('');
    };

    const reset = () => {
      pending = null;
      fileInput.value = '';
      updateFileState();
      showStep('select');
    };

    const open = () => {
      showError('');
      modal.classList.add('open');
      if (DashboardStore.pipeline.runningJobId) {
        showStep('progress');
        api.job(DashboardStore.pipeline.runningJobId).then(renderLoadProgress).catch(() => {});
      } else {
        reset();
      }
    };

    const close = () => {
      modal.classList.remove('open');
    };

    document.getElementById('btn-sources-load-data')?.addEventListener('click', open);
    document.getElementById('btn-close-load-source')?.addEventListener('click', close);
    buttons.cancel.addEventListener('click', close);
    modal.addEventListener('click', event => {
      if (event.target === modal) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('open')) close();
    });

    fileInput.addEventListener('change', updateFileState);
    ['btn-select-load-file', 'btn-replace-load-file'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => fileInput.click());
    });
    ['dragenter', 'dragover'].forEach(name => dropzone?.addEventListener(name, event => {
      event.preventDefault();
      dropzone.classList.add('drag-active');
    }));
    ['dragleave', 'drop'].forEach(name => dropzone?.addEventListener(name, event => {
      event.preventDefault();
      dropzone.classList.remove('drag-active');
    }));
    dropzone?.addEventListener('drop', event => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      fileInput.files = transfer.files;
      updateFileState();
    });

    buttons.back.addEventListener('click', reset);

    buttons.validate.addEventListener('click', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      buttons.validate.disabled = true;
      buttons.validate.textContent = 'Validando…';
      showError('');
      try {
        pending = await api.validarFuente(file);
        renderLoadReview(pending);
        showStep('review');
      } catch (error) {
        showError(error.message);
      } finally {
        buttons.validate.disabled = false;
        buttons.validate.textContent = 'Validar archivo';
      }
    });

    buttons.apply.addEventListener('click', async () => {
      if (!pending?.token) return;
      buttons.apply.disabled = true;
      showError('');
      try {
        const job = await api.aplicarFuente(pending.token);
        pending = null;
        showStep('progress');
        renderLoadProgress(job);
        followLoadJob(job.id);
      } catch (error) {
        showError(error.message);
      } finally {
        buttons.apply.disabled = false;
      }
    });
  }

  function renderLoadReview(result) {
    const validation = result.validacion || {};
    const fillList = (id, items) => {
      const list = document.getElementById(id);
      if (!list) return;
      list.replaceChildren(...items.map(item => {
        const li = document.createElement('li');
        li.textContent = (item.hoja ? item.hoja + (item.fila ? ' · fila ' + item.fila : '') + ': ' : '') + item.mensaje;
        return li;
      }));
    };
    const errors = validation.errores || [];
    const warnings = validation.avisos || [];
    document.getElementById('load-review-errors').hidden = !errors.length;
    document.getElementById('load-review-warnings').hidden = !warnings.length;
    document.getElementById('load-review-ok').hidden = !validation.ok;
    fillList('load-review-errors-list', errors);
    fillList('load-review-warnings-list', warnings);
    if (!validation.ok) return;

    const sheets = document.getElementById('load-review-sheets');
    sheets.replaceChildren(...(validation.hojas || []).map(sheet => {
      const row = document.createElement('tr');
      [sheet.hoja, sheet.planta, sheet.servicio === 'gas' ? 'Gas (m³)' : 'Energía (kWh)',
        formatMonthLabel(sheet.desde) + ' – ' + formatMonthLabel(sheet.hasta) + ' · ' + sheet.meses + ' meses',
        sheet.con_costo ? 'Sí' : 'No'].forEach(text => {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.appendChild(cell);
      });
      return row;
    }));

    const changes = result.cambios || {};
    const items = [];
    const addItem = (text, className = '') => {
      const li = document.createElement('li');
      li.textContent = text;
      if (className) li.className = className;
      items.push(li);
    };
    if (changes.sin_cambios) addItem('El archivo tiene los mismos datos que el Excel vigente.');
    (changes.plantas_nuevas || []).forEach(id => addItem('Planta nueva: ' + id, 'is-new'));
    (changes.plantas_faltantes || []).forEach(id => addItem('Ya no está en el archivo: ' + id + ' (dejará de mostrarse)', 'is-missing'));
    (changes.series || []).forEach(serie => {
      const parts = [];
      if (serie.meses_nuevos.length) parts.push(pluralMonths(serie.meses_nuevos.length, 'nuevo') + ' (' + serie.meses_nuevos.map(formatMonthLabel).join(', ') + ')');
      if (serie.meses_eliminados.length) parts.push(pluralMonths(serie.meses_eliminados.length, 'eliminado'));
      if (serie.n_modificados) {
        const detail = serie.modificados.slice(0, 3).map(item => formatMonthLabel(item.fecha) + ': '
          + formatNumber(Math.round(item.consumo_antes ?? 0)) + ' → ' + formatNumber(Math.round(item.consumo_despues ?? 0)));
        parts.push(pluralMonths(serie.n_modificados, 'modificado') + ' (' + detail.join('; ') + (serie.n_modificados > 3 ? '; …' : '') + ')');
      }
      if (parts.length) addItem(serie.id + ': ' + parts.join(' · '));
    });
    if (!items.length) addItem('Sin cambios en los totales mensuales.');
    document.getElementById('load-review-changes').replaceChildren(...items);
  }

  function renderLoadProgress(job) {
    const list = document.getElementById('load-phases');
    if (!list || !job) return;
    const currentIndex = LOAD_PHASES.findIndex(([key]) => key === job.fase);
    const failed = job.estado === 'error';
    list.replaceChildren(...LOAD_PHASES.map(([key, label], index) => {
      const li = document.createElement('li');
      li.textContent = label;
      if (job.estado === 'ok' || index < currentIndex) li.className = 'is-done';
      else if (index === currentIndex && !failed) li.className = 'is-active';
      else if (failed && index === Math.max(currentIndex, 0)) li.className = 'is-failed';
      return li;
    }));
    const log = document.getElementById('load-log');
    if (log) log.textContent = (job.log || []).join('\n');
    const result = document.getElementById('load-result');
    if (result) {
      result.hidden = job.estado === 'corriendo';
      result.className = 'load-block ' + (failed ? 'load-block-danger' : 'load-block-ok');
      result.replaceChildren();
      if (job.estado !== 'corriendo') {
        const title = document.createElement('strong');
        title.textContent = failed ? 'La carga falló' : 'Carga completada';
        const text = document.createElement('span');
        text.textContent = failed
          ? (job.error || 'Error desconocido') + '. Se restauraron el Excel y los datos anteriores.'
          : 'El dashboard ya muestra los datos recalculados de ' + job.archivo + '.';
        result.append(title, text);
      }
    }
  }

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

    // El logo y el nombre de Clarios vuelven a la vista general.
    const brandHome = document.getElementById('brand-home');
    if (brandHome) {
      brandHome.addEventListener('click', () => switchView('landing'));
      brandHome.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          switchView('landing');
        }
      });
    }

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
    const app = document.getElementById('app-container');
    let previousFocus;

    const closeDrawer = (restoreFocus = true) => {
      backdrop.classList.remove('open');
      document.body.classList.remove('drawer-open');
      backdrop.setAttribute('aria-hidden', 'true');
      openButton.setAttribute('aria-expanded', 'false');
      if (app) app.inert = false;
      if (restoreFocus && previousFocus?.isConnected) previousFocus.focus();
    };
    const openDrawer = () => {
      previousFocus = document.activeElement;
      backdrop.classList.add('open');
      document.body.classList.add('drawer-open');
      backdrop.setAttribute('aria-hidden', 'false');
      openButton.setAttribute('aria-expanded', 'true');
      if (app) app.inert = true;
      closeButton.focus();
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
        } else if (target === 'detail') {
          switchView('detail');
        } else {
          switchView('landing');
        }
        closeDrawer();
      });
    }

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
      if (!backdrop.classList.contains('open')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
      } else if (event.key === 'Tab') {
        const focusable = [...backdrop.querySelectorAll('button, a[href], select, input, [tabindex="0"]')]
          .filter(element => !element.disabled && element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable.at(-1);
        if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
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
      select.title = 'Los períodos se habilitan al cargar los datos del pipeline';
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
    if (plant.id === '__global__') {
      applyGlobalPeriod(period);
      renderAllViews();
      if (showFeedback) showToast('Todas las plantas actualizadas al corte ' + formatMonthLabel(period) + '.', 'success');
      return;
    }
    if (!selectAnalyticsPeriod(plant.analytics, period)) {
      if (showFeedback) showToast('Ese corte no tiene un mes anterior comparable para ' + plant.name + '.', 'danger');
      return;
    }

    DashboardStore.selectedPeriod = period;
    applyEnergyDataset(plant, plant.analytics);
    renderAllViews();
    if (showFeedback) showToast(plant.name + ' actualizada al corte ' + formatMonthLabel(period) + '.', 'success');
  }

  function getPeriodFilterPlant() {
    if (DashboardStore.currentView === 'detail') {
      const current = DashboardStore.plants[DashboardStore.currentPlantId];
      return current?.analytics ? current : null;
    }
    return getGlobalPeriodFilter();
  }

  function syncPeriodFiltersForView() {
    if (DashboardStore.currentView !== 'detail') {
      const outOfSync = getPipelinePlants().some(item => item.currentPeriod !== DashboardStore.globalPeriod);
      if (outOfSync) {
        applyGlobalPeriod(DashboardStore.globalPeriod);
        renderAllViews();
      }
    }
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
    renderSubheader();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- RENDER VIEWS ---
  function renderAllViews() {
    if (!hasPlants()) return;
    ensureDynamicPlantUI();
    recalculatePipelineGlobalMetrics();
    renderPipelineLandingMetrics();
    renderLandingBatteryCards();
    renderSidebarCards();
    renderExecutiveSummary();
    renderPlantCounts();
    renderSourcesView();
    updatePlantDetailView();
    renderSubheader();
    renderThresholdsPanel();
    renderKpiDetailPanel();
  }

  // --- UMBRALES DE ALERTA POR PLANTA ---
  // Borrador de la tabla (id de serie → texto del input en %); vacío si no hay cambios pendientes.
  let thresholdDraft = {};

  // --- DETALLE DE LAS KPIs (clic en una tarjeta) ---
  // Una sola KPI abierta a la vez. "alerts" abre el panel de umbrales; las demás, la tabla de solo lectura.
  const KPI_DETAILS = {
    energy: { card: 'landing-kpi-energy-card', panel: 'kpi-detail-panel' },
    cost: { card: 'landing-kpi-cost-card', panel: 'kpi-detail-panel' },
    performance: { card: 'landing-kpi-performance-card', panel: 'kpi-detail-panel' },
    deviation: { card: 'landing-kpi-deviation-card', panel: 'kpi-detail-panel' },
    alerts: { card: 'landing-kpi-alerts-card', panel: 'alert-thresholds-panel' }
  };
  let openKpiDetail = null;

  function initKpiDetails() {
    Object.entries(KPI_DETAILS).forEach(([key, { card }]) => {
      const element = document.getElementById(card);
      if (!element) return;
      element.addEventListener('click', () => toggleKpiDetail(openKpiDetail === key ? null : key));
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleKpiDetail(openKpiDetail === key ? null : key);
        }
      });
    });
    document.getElementById('btn-close-kpi-detail')?.addEventListener('click', () => toggleKpiDetail(null));
    document.getElementById('btn-close-thresholds')?.addEventListener('click', () => toggleKpiDetail(null));
  }

  function toggleKpiDetail(key) {
    if (openKpiDetail === 'alerts' && key !== 'alerts') thresholdDraft = {};
    openKpiDetail = key;
    Object.entries(KPI_DETAILS).forEach(([name, { card }]) => {
      const element = document.getElementById(card);
      if (!element) return;
      const open = name === key;
      element.setAttribute('aria-expanded', String(open));
      element.classList.toggle('is-open', open);
      const hint = element.querySelector('.kpi-toggle-hint');
      if (hint) hint.textContent = open ? 'Ocultar detalle ▴' : (hint.dataset.label || 'Detalle por planta') + ' ▾';
    });
    const panelId = key ? KPI_DETAILS[key].panel : null;
    ['kpi-detail-panel', 'alert-thresholds-panel'].forEach(id => {
      const panel = document.getElementById(id);
      if (panel) panel.hidden = id !== panelId;
    });
    renderKpiDetailPanel();
    renderThresholdsPanel();
    if (panelId) document.getElementById(panelId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** Promedio de un valor de la planta en los meses de referencia que usó la KPI global. */
  function plantReferenceAverage(plant, reference, read) {
    const values = (reference?.periods || []).map(period => totalRecord(plant, period)).filter(Boolean).map(read).filter(hasNumericValue);
    return values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;
  }

  function percentText(value) {
    return hasNumericValue(value) ? formatSigned(value, 1) + '%' : '—';
  }

  /**
   * Celda de cambio % con el semáforo de las KPIs (más es peor): verde ≤ 0, ámbar hasta `margin`, rojo más.
   * En consumo por unidad `margin` es el umbral de alerta de la planta, para que el rojo coincida con "con alerta".
   */
  function changeCell(value, margin = NORMAL_MARGIN) {
    let state = 'neutral';
    if (hasNumericValue(value)) state = value <= 0 ? 'positive' : (value / 100 <= margin ? 'warning' : 'negative');
    return { text: percentText(value), state };
  }

  /** Columnas y filas de la tabla de detalle de cada KPI; la fila total reproduce el valor de la tarjeta. */
  function buildKpiDetail(key, period) {
    const g = DashboardStore.global;
    const ref = g.reference || {};
    const year = ref.year;
    const monthLabel = formatMonthLabel(period);
    const plants = getPipelinePlants();
    const kwhText = value => hasNumericValue(value) ? formatNumber(Math.round(value)) + ' kWh' : '—';
    const copText = value => hasNumericValue(value) ? formatMillionsCop(value) + ' COP' : '—';
    const change = (current, base) => hasNumericValue(current) && base ? (current / base - 1) * 100 : null;

    if (key === 'energy') {
      const refLabel = referenceLabel(ref.energyKwh, year);
      const energy = plants.filter(plant => plant.unit === 'kWh');
      const rows = energy.map(plant => {
        const current = Number(totalRecord(plant, period)?.consumo);
        const base = plantReferenceAverage(plant, ref.energyKwh, record => record.consumo);
        return [plant.name, kwhText(current), kwhText(base), changeCell(change(current, base)),
          g.totalEnergyKwh ? formatDecimal(current / g.totalEnergyKwh * 100, 1) + '%' : '—'];
      });
      plants.filter(plant => plant.unit !== 'kWh').forEach(plant => {
        rows.push([plant.name, formatConsumption(plant, Math.round(Number(totalRecord(plant, period)?.consumo))), '—', '—', 'No suma (' + plant.unit.replace('m3', 'm³') + ')']);
      });
      return {
        title: 'Consumo de energía de ' + monthLabel,
        help: 'Consumo eléctrico de cada planta frente a su ' + refLabel + '. Las series de gas se miden en m³ y no se suman a los kWh.',
        columns: ['Planta', 'Consumo ' + monthLabel, refLabel.replace(/^p/, 'P'), 'Cambio', 'Participación'],
        rows,
        total: ['Total', kwhText(g.totalEnergyKwh), kwhText(ref.energyKwh?.value), changeCell(change(g.totalEnergyKwh, ref.energyKwh?.value)), '100%']
      };
    }

    if (key === 'cost') {
      const refLabel = referenceLabel(ref.cost, year);
      const rows = plants.map(plant => {
        const record = totalRecord(plant, period);
        const current = record?.costo_total;
        const base = plantReferenceAverage(plant, ref.cost, item => item.costo_total);
        return [plant.name, hasNumericValue(current) ? copText(current) : 'Sin costo', copText(base), changeCell(change(current, base)),
          hasNumericValue(record?.costo_unitario) ? formatCurrencyCop(record.costo_unitario) + ' / ' + getPlantConsumptionUnit(plant) : '—'];
      });
      return {
        title: 'Gasto en energía y gas de ' + monthLabel,
        help: 'Costo de cada serie según el Excel fuente. La referencia (' + refLabel + ') solo usa los meses en que las mismas plantas tienen costo.',
        columns: ['Planta', 'Gasto ' + monthLabel, refLabel.replace(/^p/, 'P'), 'Cambio', 'Tarifa'],
        rows,
        total: ['Total', copText(g.energyCostCop), copText(ref.cost?.value), changeCell(change(g.energyCostCop, ref.cost?.value)), '']
      };
    }

    if (key === 'performance') {
      const performance = g.performance;
      const rows = plants.map(plant => {
        const record = totalRecord(plant, period);
        const reference = performanceReference(plant, period);
        const production = Number(record?.produccion);
        const unitLabel = getPlantIntensityUnit(plant);
        if (plant.unit !== 'kWh') return [plant.name, formatDecimal(record?.intensidad, 2) + ' ' + unitLabel, '—', '—', '—', 'No suma (m³)'];
        if (!reference || !(production > 0)) return [plant.name, formatDecimal(record?.intensidad, 2) + ' ' + unitLabel, 'Sin referencia', '—', kwhText(record?.consumo), '—'];
        const expected = production * reference;
        return [plant.name, formatDecimal(record.intensidad, 2) + ' ' + unitLabel, formatDecimal(reference, 2) + ' ' + unitLabel,
          kwhText(expected), kwhText(record.consumo), changeCell(change(Number(record.consumo), expected), getAlertThreshold(plant))];
      });
      return {
        title: 'Consumo por unidad de ' + monthLabel,
        help: 'Consumo esperado = producción del mes × consumo por unidad promedio de ' + year + '. El índice global compara la suma del consumo real con la suma del esperado, solo en plantas eléctricas con referencia.',
        columns: ['Planta', 'Consumo por unidad', 'Promedio ' + year, 'Consumo esperado', 'Consumo real', 'Diferencia'],
        rows,
        total: ['Total', '', '', kwhText(performance?.expected), kwhText(performance?.actual), changeCell(performance ? (performance.index - 1) * 100 : null)]
      };
    }

    // Desviación de presupuesto.
    const budgetPlants = getBudgetPlants();
    const rows = plants.map(plant => {
      const record = totalRecord(plant, period);
      if (!budgetPlants.includes(plant)) return [plant.name, formatConsumption(plant, Math.round(Number(record?.consumo))), '—', '—', 'Sin presupuesto', '—'];
      const target = budgetTarget(plant, period, record);
      const budget = hasNumericValue(target) && hasNumericValue(record?.produccion) ? Number(record.produccion) * target : null;
      return [plant.name, kwhText(record?.consumo), hasNumericValue(record?.produccion) ? formatNumber(Math.round(record.produccion)) : '—',
        hasNumericValue(target) ? formatDecimal(target, 2) + ' ' + getPlantIntensityUnit(plant) : '—', kwhText(budget), changeCell(change(Number(record?.consumo), budget))];
    });
    const snapshot = g.snapshot;
    const budgetedKwh = budgetPlants.reduce((sum, plant) => sum + Number(totalRecord(plant, period)?.consumo || 0), 0);
    return {
      title: 'Desviación de presupuesto de ' + monthLabel,
      help: 'Presupuesto = producción del mes × meta de consumo por unidad. Solo entran las plantas con presupuesto; si falta la meta del mes se usa la meta promedio de la planta.',
      columns: ['Planta', 'Consumo', 'Producción', 'Meta', 'Presupuesto', 'Desviación'],
      rows,
      total: ['Total', kwhText(budgetedKwh), '', '', kwhText(snapshot?.budgetKwh), changeCell(snapshot?.deviationPct)]
    };
  }

  function renderKpiDetailPanel() {
    const panel = document.getElementById('kpi-detail-panel');
    const head = document.getElementById('kpi-detail-head');
    const body = document.getElementById('kpi-detail-body');
    if (!panel || !head || !body || panel.hidden || !openKpiDetail || openKpiDetail === 'alerts' || !DashboardStore.globalPeriod) return;
    const detail = buildKpiDetail(openKpiDetail, DashboardStore.globalPeriod);
    setElementText('kpi-detail-title', detail.title);
    setElementText('kpi-detail-help', detail.help);
    const headRow = document.createElement('tr');
    detail.columns.forEach(label => {
      const cell = document.createElement('th');
      cell.textContent = label;
      headRow.appendChild(cell);
    });
    head.replaceChildren(headRow);
    const toRow = (cells, className = '') => {
      const row = document.createElement('tr');
      if (className) row.className = className;
      cells.forEach(value => {
        const cell = document.createElement('td');
        if (value && typeof value === 'object') {
          const chip = document.createElement('span');
          chip.className = 'kpi-detail-change state-' + value.state;
          chip.textContent = value.text;
          cell.appendChild(chip);
        } else {
          cell.textContent = value;
        }
        row.appendChild(cell);
      });
      return row;
    };
    body.replaceChildren(...detail.rows.map(cells => toRow(cells)), toRow(detail.total, 'kpi-detail-total'));
  }

  function initThresholdsPanel() {
    const body = document.getElementById('thresholds-table-body');
    if (!body) return;
    body.addEventListener('input', event => {
      const input = event.target.closest('input[data-plant-id]');
      if (!input) return;
      const plant = DashboardStore.plants[input.dataset.plantId];
      if (parseThresholdDraft(input.value) === getAlertThreshold(plant)) {
        delete thresholdDraft[plant.id];
      } else {
        thresholdDraft[plant.id] = input.value;
      }
      renderThresholdsPanel(plant.id);
    });
    document.getElementById('btn-cancel-thresholds')?.addEventListener('click', () => {
      thresholdDraft = {};
      renderThresholdsPanel();
    });
    document.getElementById('btn-confirm-thresholds')?.addEventListener('click', saveThresholds);
  }

  /** Valor del borrador como fracción, o null si no es un porcentaje válido (0–100). */
  function parseThresholdDraft(text) {
    const value = Number(String(text).replace(',', '.'));
    return String(text).trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 100 ? value / 100 : null;
  }

  /** Pinta la tabla; `focusId` conserva el foco en el input que el usuario está editando. */
  function renderThresholdsPanel(focusId = null) {
    const panel = document.getElementById('alert-thresholds-panel');
    const body = document.getElementById('thresholds-table-body');
    if (!panel || !body || panel.hidden || !DashboardStore.globalPeriod) return;
    const period = DashboardStore.globalPeriod;
    const year = Number(period.slice(0, 4)) - 1;
    setElementText('thresholds-help', 'Una planta tiene alerta cuando su consumo por unidad de ' + formatMonthLabel(period)
      + ' supera su promedio mensual de ' + year + ' en más del umbral. Edita un umbral y confirma para guardarlo.');
    setElementText('thresholds-change-header', 'Consumo por unidad vs promedio ' + year);

    if (focusId) {
      // Solo se actualiza el estado de la fila editada para no perder el cursor del input.
      const row = body.querySelector(`tr[data-plant-id="${focusId}"]`);
      if (row) fillThresholdState(row, DashboardStore.plants[focusId], period);
    } else {
      body.replaceChildren(...getPipelinePlants().map(plant => buildThresholdRow(plant, period)));
    }
    renderThresholdsConfirmBar();
  }

  function buildThresholdRow(plant, period) {
    const row = document.createElement('tr');
    row.dataset.plantId = plant.id;
    const name = document.createElement('td');
    name.textContent = plant.name;
    const change = document.createElement('td');
    const value = performanceChange(plant, period);
    change.textContent = hasNumericValue(value) ? formatSigned(value * 100, 1) + '%' : 'Sin referencia';
    const thresholdCell = document.createElement('td');
    const wrap = document.createElement('label');
    wrap.className = 'threshold-input-wrap';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.inputMode = 'decimal';
    input.className = 'threshold-input';
    input.dataset.plantId = plant.id;
    input.setAttribute('aria-label', 'Umbral de alerta de ' + plant.name + ' en porcentaje');
    input.value = thresholdDraft[plant.id] ?? String(Math.round(getAlertThreshold(plant) * 1000) / 10);
    const unit = document.createElement('span');
    unit.textContent = '%';
    wrap.append(input, unit);
    thresholdCell.appendChild(wrap);
    const processes = document.createElement('td');
    const processCount = Number(plant.alertCount || 0);
    processes.textContent = processCount ? processCount + (processCount === 1 ? ' proceso' : ' procesos') : 'Ninguno';
    processes.className = processCount ? 'threshold-processes-alert' : '';
    const state = document.createElement('td');
    state.className = 'threshold-state';
    row.append(name, change, thresholdCell, processes, state);
    fillThresholdState(row, plant, period);
    return row;
  }

  /** Estado de la fila con el umbral del borrador (vista previa) o el guardado. */
  function fillThresholdState(row, plant, period) {
    const cell = row.querySelector('.threshold-state');
    const input = row.querySelector('.threshold-input');
    const draft = thresholdDraft[plant.id];
    const threshold = draft === undefined ? getAlertThreshold(plant) : parseThresholdDraft(draft);
    input?.classList.toggle('is-invalid', threshold === null);
    input?.classList.toggle('is-changed', draft !== undefined && threshold !== null);
    const change = performanceChange(plant, period);
    const badge = document.createElement('span');
    if (threshold === null) {
      badge.className = 'source-status-badge registered';
      badge.textContent = 'Valor no válido (0 a 100)';
    } else if (!hasNumericValue(change)) {
      badge.className = 'source-status-badge';
      badge.textContent = 'Sin referencia';
    } else {
      const alert = change > threshold;
      badge.className = 'threshold-badge ' + (alert ? 'is-alert' : 'is-ok');
      badge.textContent = (alert ? '▲ Con alerta' : '● En rango') + (draft !== undefined ? ' (vista previa)' : '');
    }
    cell.replaceChildren(badge);
  }

  function renderThresholdsConfirmBar() {
    const bar = document.getElementById('thresholds-confirm-bar');
    const confirm = document.getElementById('btn-confirm-thresholds');
    if (!bar || !confirm) return;
    const ids = Object.keys(thresholdDraft);
    bar.hidden = !ids.length;
    if (!ids.length) return;
    const invalid = ids.some(id => parseThresholdDraft(thresholdDraft[id]) === null);
    confirm.disabled = invalid;
    setElementText('thresholds-confirm-text', invalid
      ? 'Corrige los valores marcados: el umbral va de 0 % a 100 %.'
      : 'Cambios sin guardar: ' + ids.map(id => DashboardStore.plants[id].name + ' '
        + formatDecimal(getAlertThreshold(DashboardStore.plants[id]) * 100, 1) + ' % → '
        + formatDecimal(parseThresholdDraft(thresholdDraft[id]) * 100, 1) + ' %').join(' · '));
  }

  async function saveThresholds() {
    const confirm = document.getElementById('btn-confirm-thresholds');
    const umbrales = { ...DashboardStore.thresholds.umbrales };
    for (const [id, text] of Object.entries(thresholdDraft)) {
      const value = parseThresholdDraft(text);
      if (value === null) return;
      umbrales[id] = value;
    }
    confirm.disabled = true;
    try {
      DashboardStore.thresholds = await api.guardarUmbrales(umbrales);
      thresholdDraft = {};
      getPipelinePlants().forEach(plant => applyEnergyDataset(plant, plant.analytics));
      renderAllViews();
      showToast('✓ Umbrales de alerta guardados.', 'success');
    } catch (error) {
      showToast('No se pudieron guardar los umbrales: ' + error.message, 'danger');
    } finally {
      confirm.disabled = false;
    }
  }

  function ensureDynamicPlantUI() {
    const landingGrid = document.querySelector('.battery-cards-grid');
    const landingTemplate = document.getElementById('tpl-landing-plant-card')?.content.firstElementChild;
    const sidebarList = document.querySelector('.sidebar-battery-list');
    const sidebarTemplate = document.getElementById('tpl-sidebar-plant-card')?.content.firstElementChild;
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

    [landingGrid, sidebarList, drawerList].forEach(container => {
      container?.querySelectorAll('[data-plant-id]').forEach(element => {
        if (!DashboardStore.plants[element.getAttribute('data-plant-id')]) element.remove();
      });
    });
  }

  // --- KPIs GLOBALES (modo pipeline) ---
  // Corte: un mes que tienen todas las plantas. Referencia: promedio mensual del año anterior al corte
  // (sin los periodos excluidos, p. ej. COVID), usando solo los meses comparables de cada indicador.
  // Semáforo: verde si igual o mejor que la referencia; ámbar si peor pero hasta NORMAL_MARGIN; rojo si
  // peor más allá de ese margen. Una planta "con alerta" tiene un desempeño energético más de
  // NORMAL_MARGIN peor que el de su año anterior.
  const NORMAL_MARGIN = 0.10;
  const PLANT_REFERENCE_MIN_MONTHS = 6;

  function getPipelinePlants() {
    return Object.values(DashboardStore.plants).filter(plant => plant.isPipeline && plant.analytics);
  }

  /** Meses con fila total (y mes anterior comparable) en todas las plantas del pipeline. */
  function getCommonPeriods() {
    const plants = getPipelinePlants();
    if (!plants.length) return [];
    return plants
      .map(plant => plant.analytics.availablePeriods)
      .reduce((common, periods) => common.filter(period => periods.includes(period)));
  }

  function applyGlobalPeriod(period) {
    if (!period) return;
    DashboardStore.globalPeriod = period;
    DashboardStore.selectedPeriod = period;
    getPipelinePlants().forEach(plant => {
      if (selectAnalyticsPeriod(plant.analytics, period)) applyEnergyDataset(plant, plant.analytics);
    });
  }

  /** Planta virtual para el filtro de período de la vista general: ofrece solo los meses comunes. */
  function getGlobalPeriodFilter() {
    const periods = getCommonPeriods();
    if (!periods.length) return null;
    return {
      id: '__global__',
      name: 'Todas las plantas',
      currentPeriod: DashboardStore.globalPeriod || periods.at(-1),
      analytics: { availablePeriods: periods, latestAvailable: { fecha: periods.at(-1) } }
    };
  }

  function isExcludedPeriod(plant, period) {
    const excluded = plant.analytics?.parameters?.periodos_excluidos || [];
    return excluded.some(([start, end]) => period >= String(start).slice(0, 7) && period <= String(end).slice(0, 7));
  }

  /** Meses del año anterior al corte que no están excluidos. */
  function referencePeriods(plant, period) {
    const year = Number(period.slice(0, 4)) - 1;
    return Array.from({ length: 12 }, (_, index) => year + '-' + String(index + 1).padStart(2, '0'))
      .filter(month => !isExcludedPeriod(plant, month));
  }

  function totalRecord(plant, period) {
    return plant.analytics.totalSeries.find(record => record.fecha === period) || null;
  }

  /** Desempeño energético de referencia de la planta: promedio mensual del año anterior al corte. */
  function performanceReference(plant, period) {
    const values = referencePeriods(plant, period)
      .map(month => totalRecord(plant, month)?.intensidad)
      .filter(hasNumericValue)
      .map(Number);
    return values.length >= PLANT_REFERENCE_MIN_MONTHS ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }

  /**
   * Meta de desempeño (presupuesto, kWh/ECU) de la planta en un mes: la del Excel; si falta y el mes es
   * posterior al primer presupuesto de la planta, su meta promedio. null antes del primer presupuesto
   * o si la planta nunca tuvo presupuesto.
   */
  function budgetTarget(plant, period, record) {
    if (hasNumericValue(record?.intensidad_ppto)) return Number(record.intensidad_ppto);
    const budgets = plant.analytics.totalSeries.filter(item => hasNumericValue(item.intensidad_ppto));
    if (!budgets.length || period < budgets[0].fecha) return null;
    return budgets.reduce((sum, item) => sum + Number(item.intensidad_ppto), 0) / budgets.length;
  }

  /** Plantas de energía con presupuesto en algún mes; solo ellas entran en la desviación global. */
  function getBudgetPlants() {
    return getPipelinePlants().filter(plant => plant.unit === 'kWh'
      && plant.analytics.totalSeries.some(item => hasNumericValue(item.intensidad_ppto)));
  }

  /** Totales de todas las plantas en un mes; null si alguna planta no tiene ese mes. */
  function globalSnapshot(period) {
    const plants = getPipelinePlants();
    const records = plants.map(plant => totalRecord(plant, period));
    if (!plants.length || records.some(record => !record)) return null;
    const energy = plants.map((plant, index) => [plant, records[index]]).filter(([plant]) => plant.unit === 'kWh');
    const energyKwh = energy.reduce((sum, [, record]) => sum + Number(record.consumo || 0), 0);
    const cost = records.reduce((sum, record) => sum + (hasNumericValue(record.costo_total) ? Number(record.costo_total) : 0), 0);
    // Plantas con costo en este mes: la referencia de costo solo compara meses con las mismas plantas.
    const costKey = plants.filter((plant, index) => hasNumericValue(records[index].costo_total)).map(plant => plant.id).join(',');
    // Desviación: consumo vs presupuesto (producción × meta) solo de las plantas con presupuesto.
    const budgetRows = getBudgetPlants().map(plant => {
      const record = records[plants.indexOf(plant)];
      return { record, target: budgetTarget(plant, period, record) };
    });
    const budgetComplete = budgetRows.length > 0 && budgetRows.every(({ record, target }) => (
      hasNumericValue(record.produccion) && hasNumericValue(target)
    ));
    const budget = budgetComplete
      ? budgetRows.reduce((sum, { record, target }) => sum + Number(record.produccion) * target, 0)
      : null;
    const budgetedKwh = budgetRows.reduce((sum, { record }) => sum + Number(record.consumo || 0), 0);
    return {
      period,
      energyKwh,
      cost: costKey ? cost : null,
      costKey,
      budgetKwh: budget,
      deviationPct: budget ? (budgetedKwh - budget) / budget * 100 : null
    };
  }

  /**
   * Índice de desempeño energético global (ISO 50001 / 50006): consumo real / consumo esperado, con
   * consumo esperado = Σ producción del mes × desempeño de referencia de cada planta. Solo plantas de
   * energía (kWh) con producción y referencia. 1,05 = se consumió 5 % más de lo esperado para lo producido.
   */
  function globalPerformance(period) {
    const rows = getPipelinePlants().filter(plant => plant.unit === 'kWh').map(plant => {
      const record = totalRecord(plant, period);
      const reference = performanceReference(plant, period);
      return { plant, record, reference };
    }).filter(({ record, reference }) => record && hasNumericValue(reference)
      && hasNumericValue(record.produccion) && Number(record.produccion) > 0);
    if (!rows.length) return null;
    const actual = rows.reduce((sum, { record }) => sum + Number(record.consumo), 0);
    const expected = rows.reduce((sum, { record, reference }) => sum + Number(record.produccion) * reference, 0);
    return { index: actual / expected, actual, expected, plants: rows.map(({ plant }) => plant.name) };
  }

  /** Cambio relativo del desempeño del mes frente a su referencia del año anterior (0,12 = 12 % peor). */
  function performanceChange(plant, period) {
    const reference = performanceReference(plant, period);
    const value = Number(totalRecord(plant, period)?.intensidad);
    return reference && Number.isFinite(value) ? value / reference - 1 : null;
  }

  /** Umbral de alerta de la planta (fracción): el editado en el panel de umbrales o el defecto. */
  function getAlertThreshold(plant) {
    const value = DashboardStore.thresholds.umbrales?.[plant.id];
    return hasNumericValue(value) ? Number(value) : Number(DashboardStore.thresholds.defecto ?? NORMAL_MARGIN);
  }

  /** Plantas cuyo consumo por unidad del corte supera su promedio del año anterior en más de su umbral. */
  function plantsWithAlert(period) {
    return getPipelinePlants()
      .map(plant => ({ plant, change: performanceChange(plant, period) }))
      .filter(item => item.change !== null && item.change > getAlertThreshold(item.plant));
  }

  /**
   * Promedio mensual de los indicadores globales en el año anterior al corte. Cada indicador usa solo
   * sus meses comparables (costo: mismas plantas con costo; desviación: meses con presupuesto).
   */
  function globalReference(period, current) {
    const plants = getPipelinePlants();
    if (!plants.length) return {};
    const snapshots = referencePeriods(plants[0], period).map(globalSnapshot).filter(Boolean);
    const average = items => items.length
      ? { value: items.reduce((sum, item) => sum + item.value, 0) / items.length, periods: items.map(item => item.period) }
      : null;
    const pick = (list, read) => list.map(item => ({ period: item.period, value: read(item) }));
    return {
      year: Number(period.slice(0, 4)) - 1,
      energyKwh: average(pick(snapshots, item => item.energyKwh)),
      cost: average(pick(snapshots.filter(item => current?.costKey && item.costKey === current.costKey), item => item.cost)),
      deviationPct: average(pick(snapshots.filter(item => hasNumericValue(item.deviationPct)), item => item.deviationPct))
    };
  }

  /** "promedio 2025" o, si faltan meses, "promedio oct–dic 2025". */
  function referenceLabel(reference, year) {
    if (!reference) return 'promedio ' + year;
    const periods = reference.periods;
    if (periods.length >= 12) return 'promedio ' + year;
    const month = value => formatMonthLabel(value).split(' ')[0];
    return 'promedio ' + (periods.length === 1 ? month(periods[0]) : month(periods[0]) + '–' + month(periods.at(-1))) + ' ' + year;
  }

  /** Semáforo para indicadores donde más es peor. `ratio` = actual / referencia. */
  function trafficLight(ratio) {
    if (!hasNumericValue(ratio)) return 'neutral';
    if (ratio <= 1) return 'positive';
    return ratio <= 1 + NORMAL_MARGIN ? 'warning' : 'negative';
  }

  /** Millones de COP con un decimal; la abreviación no convierte la moneda. */
  function formatMillionsCop(value) {
    return '$' + formatDecimal(Number(value) / 1e6, 1) + ' M';
  }

  function moreOrLess(changePct) {
    return formatDecimal(Math.abs(changePct), 1) + '% ' + (changePct >= 0 ? 'más' : 'menos');
  }

  function recalculatePipelineGlobalMetrics() {
    const period = DashboardStore.globalPeriod;
    const current = period ? globalSnapshot(period) : null;
    const global = DashboardStore.global;
    global.snapshot = current;
    global.reference = period ? globalReference(period, current) : {};
    global.performance = period ? globalPerformance(period) : null;
    global.plantsWithAlert = period ? plantsWithAlert(period) : [];
    global.totalEnergyKwh = current ? Math.round(current.energyKwh) : 0;
    global.energyCostCop = hasNumericValue(current?.cost) ? Math.round(current.cost) : null;
    global.budgetDeviationPct = current?.deviationPct ?? null;
    global.alertCount = global.plantsWithAlert.length;
  }

  /** Pinta una tarjeta: valor, frase explicativa, línea pequeña y estado (color). */
  function renderKpiCard(prefix, { value, unit = '', note = '', baseline = '', state = 'neutral', title = '' }) {
    setElementText('landing-global-' + prefix, value);
    setElementText('landing-global-' + prefix + '-unit', unit);
    const trend = document.getElementById('landing-global-' + prefix + '-trend');
    if (trend) trend.hidden = true;
    const noteElement = document.getElementById('landing-global-' + prefix + '-note');
    if (noteElement) {
      noteElement.classList.add('kpi-explainer');
      noteElement.textContent = note;
    }
    setElementText('landing-global-' + prefix + '-baseline', baseline);
    const card = document.getElementById('landing-global-' + prefix)?.closest('.kpi-card');
    if (card) {
      card.classList.add('kpi-card-tinted');
      card.title = title + (title ? ' ' : '') + 'Clic para ver el detalle por planta.';
      card.classList.remove('state-positive', 'state-negative', 'state-neutral', 'state-warning');
      card.classList.add('state-' + state);
    }
  }

  const TRAFFIC_LIGHT_HELP = 'Verde: igual o mejor que la referencia. Ámbar: peor, pero hasta '
    + (NORMAL_MARGIN * 100) + ' % (dentro de lo normal). Rojo: más de ' + (NORMAL_MARGIN * 100) + ' % peor.';

  function renderPipelineLandingMetrics() {
    const g = DashboardStore.global;
    const current = g.snapshot;
    const ref = g.reference || {};
    const year = ref.year;
    const monthLabel = formatMonthLabel(DashboardStore.globalPeriod);
    const performanceCard = document.getElementById('landing-kpi-performance-card');
    if (performanceCard) performanceCard.hidden = false;

    // 1. Consumo de energía (kWh, plantas eléctricas).
    const energyRatio = ref.energyKwh ? g.totalEnergyKwh / ref.energyKwh.value : null;
    renderKpiCard('kwh', {
      value: formatNumber(g.totalEnergyKwh),
      unit: 'kWh',
      note: energyRatio ? 'Se consumió ' + moreOrLess((energyRatio - 1) * 100) + ' que el ' + referenceLabel(ref.energyKwh, year)
        : 'Sin datos de ' + year + ' para comparar',
      baseline: ref.energyKwh ? referenceLabel(ref.energyKwh, year).replace(/^p/, 'P') + ': ' + formatNumber(Math.round(ref.energyKwh.value)) + ' kWh' : monthLabel,
      state: trafficLight(energyRatio),
      title: 'Consumo eléctrico de las plantas en ' + monthLabel + ' frente al promedio mensual de ' + year + '. ' + TRAFFIC_LIGHT_HELP
    });

    // 2. Gasto en energía y gas (COP).
    const costRatio = ref.cost && hasNumericValue(g.energyCostCop) ? g.energyCostCop / ref.cost.value : null;
    const costSeriesCount = current?.costKey ? current.costKey.split(',').length : 0;
    const totalSeriesCount = getPipelinePlants().length;
    const costCoverage = costSeriesCount < totalSeriesCount
      ? 'Costos disponibles: ' + costSeriesCount + ' de ' + totalSeriesCount + ' series'
      : '';
    renderKpiCard('cost', {
      value: hasNumericValue(g.energyCostCop) ? formatMillionsCop(g.energyCostCop) : 'n.a.',
      unit: 'COP',
      note: costRatio ? 'Se gastó ' + moreOrLess((costRatio - 1) * 100) + ' que el ' + referenceLabel(ref.cost, year)
        : hasNumericValue(g.energyCostCop) ? 'Sin costos de ' + year + ' para comparar' : 'Sin costos en ' + monthLabel,
      baseline: [ref.cost ? referenceLabel(ref.cost, year).replace(/^p/, 'P') + ': ' + formatMillionsCop(ref.cost.value) + ' COP' : '', costCoverage].filter(Boolean).join(' · '),
      state: trafficLight(costRatio),
      title: 'Costo de energía y gas en ' + monthLabel + ' frente al promedio mensual de ' + year
        + ' (solo meses con costo de las mismas plantas). Importe del corte: ' + formatCurrencyCop(g.energyCostCop) + '. ' + TRAFFIC_LIGHT_HELP
    });

    // 3. Desempeño energético global (índice ISO 50001).
    const performance = g.performance;
    renderKpiCard('performance', {
      value: performance ? formatDecimal(Math.abs(performance.index - 1) * 100, 1) + '%' : 'n.a.',
      unit: performance ? (performance.index > 1 ? 'peor' : 'mejor') : '',
      note: performance
        ? 'Por unidad producida se consumió ' + moreOrLess((performance.index - 1) * 100) + ' que en ' + year
        : 'Sin consumo por unidad de referencia de ' + year,
      baseline: performance
        ? 'Real ' + formatNumber(Math.round(performance.actual)) + ' · esperado ' + formatNumber(Math.round(performance.expected)) + ' kWh'
        : '',
      state: trafficLight(performance?.index),
      title: 'Consumo por unidad global (índice de desempeño energético ISO 50001): consumo real / consumo esperado, con consumo esperado = '
        + 'producción del mes × consumo por unidad promedio de ' + year + ' de cada planta (' + (performance?.plants.join(', ') || '—')
        + '). No depende de la mezcla de producción entre plantas. ' + TRAFFIC_LIGHT_HELP
    });

    // 4. Desviación de presupuesto.
    renderKpiCard('deviation', pipelineDeviationCard(current, ref, year, monthLabel));

    // 5. Plantas con alerta.
    const withAlert = g.plantsWithAlert || [];
    renderKpiCard('alerts', {
      value: String(withAlert.length),
      unit: withAlert.length === 1 ? 'planta con alerta' : 'plantas con alerta',
      note: 'Consumo por unidad sobre el umbral de la planta frente a su promedio ' + year,
      baseline: withAlert.length
        ? withAlert.map(item => item.plant.name + ' (+' + formatDecimal(item.change * 100, 0) + '%)').join(' · ')
        : 'Todas dentro de su umbral',
      state: withAlert.length ? 'negative' : 'positive',
      title: 'Plantas cuyo consumo por unidad producida en ' + monthLabel + ' supera su promedio mensual de '
        + year + ' en más de su umbral de alerta. Clic para ver y editar los umbrales.'
    });
  }

  /**
   * Desviación de presupuesto: el número va sin signo y una frase dice si se gastó más o menos que el
   * presupuesto del mes. Color: verde si se gastó menos; ámbar si se gastó más pero no más que el
   * promedio del año anterior (o no hay con qué comparar); rojo si se gastó más que ese promedio.
   */
  function pipelineDeviationCard(current, ref, year, monthLabel) {
    const deviation = current?.deviationPct;
    const budgetNames = getBudgetPlants().map(plant => plant.name).join(', ');
    const reference = ref.deviationPct;
    const title = 'Presupuesto = producción del mes × meta de consumo por unidad de cada planta (' + budgetNames + '). '
      + 'Verde: se gastó menos que el presupuesto. Ámbar: se gastó más, pero no más que el ' + referenceLabel(reference, year)
      + (reference ? ' (' + formatSigned(reference.value, 1) + '%)' : '') + '. Rojo: se gastó más que ese promedio.';
    if (!hasNumericValue(deviation)) {
      return {
        value: 'n.a.',
        note: 'Sin presupuesto en ' + monthLabel,
        baseline: budgetNames ? 'Plantas con presupuesto: ' + budgetNames : '',
        title
      };
    }
    const over = deviation > 0;
    return {
      value: formatDecimal(Math.abs(deviation), 1) + '%',
      note: Math.abs(deviation) < 0.05
        ? 'Se gastó lo mismo que el presupuesto del mes'
        : 'Se gastó ' + moreOrLess(deviation) + ' que el presupuesto del mes',
      baseline: 'Presupuesto: ' + formatNumber(Math.round(current.budgetKwh)) + ' kWh · ' + budgetNames,
      state: !over ? 'positive' : reference && deviation > reference.value ? 'negative' : 'warning',
      title
    };
  }

  function renderPlantCounts() {
    const plants = Object.values(DashboardStore.plants);
    const normalCount = plants.filter(plant => !plant.isCritical).length;
    const criticalCount = plants.length - normalCount;
    setElementText('legend-normal-count', normalCount + (normalCount === 1 ? ' planta en rango' : ' plantas en rango'));
    setElementText('legend-critical-count', criticalCount + (criticalCount === 1 ? ' planta con alerta' : ' plantas con alerta'));
    setElementText('blueprint-module-count', plants.length + ' SERIES DEL PIPELINE · DATOS MENSUALES');
    setElementText('sidebar-plant-count', '1 Activo / ' + plants.length + ' Total');
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

    renderSourceLoads();
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

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return formatDecimal(bytes / (1024 * 1024), 1) + ' MB';
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
        kwhEl.textContent = formatConsumption(p, p.kwh);
        kwhEl.style.color = p.isCritical ? 'var(--fire-red)' : '';
      }

      card.classList.toggle('critical', p.isCritical);

      const ratioEl = card.querySelector('.submetric-ratio');
      if (ratioEl) ratioEl.textContent = formatDecimal(p.ratioKwhUnit, 2) + ' ' + getPlantIntensityUnit(p);

      const costEl = card.querySelector('.submetric-cost');
      if (costEl) {
        costEl.textContent = getPlantCostDisplay(p, true);
        costEl.title = 'Costo del archivo de origen: ' + formatCurrencyCop(getPlantCostCop(p));
      }

      const devEl = card.querySelector('.submetric-dev');
      if (devEl) {
        const hasDeviation = hasNumericValue(p.deviationPct);
        devEl.textContent = hasDeviation
          ? formatSigned(p.deviationPct, 1) + '% ' + (p.deviationPct > 0 ? 'sobre presupuesto' : 'bajo presupuesto')
          : 'n.a. Sin presupuesto';
        devEl.className = 'submetric-val submetric-dev ' + (hasDeviation ? (p.deviationPct > 0 ? 'red' : 'green') : '');
      }

      const plantTrend = card.querySelector('.plant-trend-chip');
      if (plantTrend) {
        renderChangeElement(plantTrend, p.kwh, p.previous.kwh, ' vs mes anterior');
        plantTrend.classList.add('plant-trend-chip');
      }

      const alertTag = card.querySelector('.battery-alert-tag');
      if (alertTag) {
        alertTag.className = 'battery-alert-tag ' + (p.isCritical ? 'tag-danger' : 'tag-success');
        alertTag.textContent = p.isCritical ? 'CON ALERTA' : 'EN RANGO';
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
        sparklineLabels[0].textContent = 'Consumo · últimos 12 meses';
        sparklineLabels[1].textContent = p.isCritical ? 'Requiere atención' : 'En rango';
        sparklineLabels[1].style.color = p.isCritical ? 'var(--fire-red)' : 'var(--neon-green)';
      }

      // Draw SVG mini sparkline
      renderMiniSparkline(card.querySelector('.sparkline-svg'), p.sparklinePoints, p.isCritical ? '#FF3D57' : '#00E676');
    });
  }

  /**
   * Lectura ejecutiva: misma referencia que las KPIs (promedio mensual del año anterior al corte).
   * Exceso = consumo real − producción × desempeño de referencia; solo plantas eléctricas (kWh y m³
   * no se suman). El impacto valora el exceso de la planta foco con su tarifa del mes.
   */
  function renderExecutiveSummary() {
    const period = DashboardStore.globalPeriod;
    if (!period) return;
    const year = Number(period.slice(0, 4)) - 1;
    setElementText('decision-method', 'Consumo por unidad vs promedio ' + year);

    const rows = getPipelinePlants().map(plant => {
      const record = totalRecord(plant, period);
      const reference = performanceReference(plant, period);
      const production = Number(record?.produccion);
      const excess = record && reference && production > 0 ? Number(record.consumo) - production * reference : null;
      return { plant, record, change: performanceChange(plant, period), excess };
    });
    const evaluated = rows.filter(row => hasNumericValue(row.change));
    const improved = evaluated.filter(row => row.change < 0).length;
    setElementText('decision-balance', improved + ' de ' + evaluated.length + (evaluated.length === 1 ? ' planta mejora' : ' plantas mejoran'));

    const performance = DashboardStore.global.performance;
    const netExcess = performance ? performance.actual - performance.expected : null;
    setElementText(
      'decision-balance-detail',
      hasNumericValue(netExcess)
        ? 'Consumo eléctrico: ' + formatNumber(Math.abs(Math.round(netExcess))) + ' kWh ' + (netExcess > 0 ? 'más' : 'menos') + ' de lo esperado para lo producido'
        : 'Sin consumo por unidad de referencia de ' + year
    );

    const focus = rows
      .filter(row => row.plant.unit === 'kWh' && hasNumericValue(row.excess) && row.excess > 0)
      .sort((left, right) => right.excess - left.excess)[0];
    if (!focus) {
      setElementText('decision-focus', 'Sin exceso de consumo');
      setElementText('decision-focus-detail', 'Las plantas eléctricas consumen lo esperado o menos para su producción');
      setElementText('decision-impact', formatCurrencyCop(0, true));
      setElementText('decision-impact-detail', 'Sin costo por exceso de consumo');
      return;
    }
    setElementText('decision-focus', focus.plant.name);
    setElementText('decision-focus-detail', '+' + formatNumber(Math.round(focus.excess)) + ' kWh sobre lo esperado para su producción');
    const tariff = focus.record.costo_unitario;
    setElementText('decision-impact', hasNumericValue(tariff) ? '+' + formatCurrencyCop(focus.excess * Number(tariff), true) : 'n.a.');
    setElementText(
      'decision-impact-detail',
      hasNumericValue(tariff) ? 'Costo del exceso de ' + focus.plant.name + ' a su tarifa del mes' : 'Sin tarifa en el corte'
    );
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
        unit.textContent = getPlantConsumptionUnit(plant);
        kwhValue.replaceChildren(document.createTextNode(formatNumber(plant.kwh) + ' '), unit);
        kwhValue.style.color = plant.isCritical ? 'var(--fire-red)' : '';
      }

      const metricValues = card.querySelectorAll('.sidebar-submetrics-row .val');
      if (metricValues.length >= 3) {
        metricValues[0].textContent = formatDecimal(plant.ratioKwhUnit, 2);
        metricValues[1].textContent = getPlantCostDisplay(plant, true);
        metricValues[1].title = 'Costo del archivo de origen: ' + formatCurrencyCop(getPlantCostCop(plant));
        metricValues[2].textContent = hasNumericValue(plant.deviationPct) ? formatSigned(plant.deviationPct, 1) + '%' : 'n.a.';
        metricValues[2].style.color = hasNumericValue(plant.deviationPct)
          ? (plant.deviationPct > 0 ? 'var(--fire-red)' : 'var(--neon-green)')
          : 'var(--text-muted)';
      }

      const statusLine = card.querySelector('.sidebar-card-bottom > span:first-child');
      if (statusLine) {
        statusLine.removeAttribute('style');
        statusLine.className = 'sidebar-state ' + (plant.isCritical ? 'danger' : 'normal');
        statusLine.textContent = plant.isCritical ? '▲ CON ALERTA' : '● EN RANGO';
      }
      const sensorTag = card.querySelector('.sensor-count-tag');
      if (sensorTag) {
        sensorTag.textContent = getPlantDataSummary(plant);
        sensorTag.hidden = !sensorTag.textContent;
      }

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
    svgEl.setAttribute('viewBox', '-5 -2 ' + (width + 10) + ' ' + (height + 4));
    svgEl.setAttribute('preserveAspectRatio', 'none');
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
    const detailTab = document.getElementById('tab-detail');
    if (detailTab) {
      const dot = detailTab.querySelector('.tab-dot');
      detailTab.replaceChildren();
      if (dot) detailTab.appendChild(dot);
      detailTab.appendChild(document.createTextNode(' Detalle · ' + currentPlant.name));
      detailTab.classList.toggle('danger', currentPlant.isCritical);
    }
    updateComparisonPeriodLabel();
    setElementText('detail-comparison-period', 'VS ' + formatMonthLabel(currentPlant.analytics.previous.fecha).toUpperCase());

    // Status alert badge in header
    const statusPill = document.getElementById('detail-header-status-pill');
    if (statusPill) {
      statusPill.replaceChildren();
      const dot = document.createElement('span');
      dot.className = 'pulse-dot';
      const text = document.createElement('span');

      if (currentPlant.isCritical) {
        statusPill.className = 'status-badge-live danger';
        text.textContent = '▲ PLANTA CON ALERTA';
      } else {
        statusPill.className = 'status-badge-live normal';
        text.textContent = '● PLANTA EN RANGO';
      }
      statusPill.appendChild(dot);
      statusPill.appendChild(text);
    }

    // 3. High-level KPI Summary Cards (Detail)
    setElementText('detail-kpi-total-kwh', formatNumber(currentPlant.kwh));
    const isGas = getPlantConsumptionUnit(currentPlant) === 'm³';
    setElementText('detail-kpi-total-title', 'Consumo total (' + getPlantConsumptionUnit(currentPlant) + ')');
    setElementText('detail-kpi-cost-title', isGas ? 'Costo gas' : 'Costo energía');
    setElementText(
      'detail-kpi-kwh-sub',
      hasNumericValue(currentPlant.budgetKwh)
        ? 'Meta estimada: ' + formatConsumption(currentPlant, currentPlant.budgetKwh)
        : 'Meta no disponible en la fuente'
    );

    setElementText('detail-kpi-cost', hasNumericValue(currentPlant.costAmount) ? formatCurrencyCop(currentPlant.costAmount, true) : 'n.a.');
    setElementText(
      'detail-kpi-cost-context',
      hasNumericValue(currentPlant.energyTariff)
        ? 'Tarifa: ' + formatCurrencyCop(currentPlant.energyTariff) + ' / ' + getPlantConsumptionUnit(currentPlant)
        : 'Costo y tarifa no disponibles para este corte'
    );
    const costElement = document.getElementById('detail-kpi-cost');
    if (costElement) {
      costElement.title = hasNumericValue(currentPlant.costAmount)
        ? formatCurrencyCop(currentPlant.costAmount) + ' · valor tomado del archivo fuente'
        : 'Sin costo declarado para el período seleccionado';
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
        ? (currentPlant.deviationPct > 0 ? 'Consumo por unidad sobre presupuesto' : 'Consumo por unidad dentro del presupuesto')
        : 'Presupuesto no disponible'
    );

    setElementText('detail-kpi-prod-qty', formatNumber(currentPlant.productionUnits));
    setElementText('detail-kpi-prod-sub', currentPlant.productionType);

    const scadaStatusEl = document.getElementById('detail-kpi-scada-status');
    if (scadaStatusEl) {
      scadaStatusEl.textContent = currentPlant.alertCount + (currentPlant.alertCount === 1 ? ' PROCESO CON ALERTA' : ' PROCESOS CON ALERTA');
      scadaStatusEl.className = 'detail-kpi-val ' + (currentPlant.alertCount > 0 ? 'red' : 'green');
    }
    setElementText('detail-kpi-scada-sensors', 'Reglas de rango + presupuesto');
    setElementText('detail-kpi-status-title', 'Estado analítico');
    setTextPreservingIcon('btn-diag-inspect', 'Ver datos del corte');

    renderChange('detail-kpi-kwh-trend', currentPlant.kwh, currentPlant.previous.kwh);
    renderChange('detail-kpi-cost-trend', currentPlant.costAmount, currentPlant.previous.costAmount);
    const ratioState = renderPercentComparison('detail-kpi-ratio-trend', currentPlant.ratioKwhUnit, currentPlant.previous.ratioKwhUnit, true);
    const deviationTrendState = renderPointComparison('detail-kpi-dev-trend', currentPlant.deviationPct, currentPlant.previous.deviationPct, true);
    const productionState = renderPercentComparison('detail-kpi-prod-trend', currentPlant.productionUnits, currentPlant.previous.productionUnits, false);
    const scadaState = renderCountComparison('detail-kpi-scada-trend', currentPlant.alertCount, currentPlant.previous.alertCount, true);

    setKpiCardState('detail-card-kwh', 'neutral');
    setKpiCardState('detail-card-cost', 'neutral');
    // Color frente a la meta; sin meta, frente al mes anterior. El chip siempre compara con el mes anterior.
    const targetState = hasNumericValue(currentPlant.ratioTarget) && Number(currentPlant.ratioTarget) > 0
      ? trafficLight(currentPlant.ratioKwhUnit / currentPlant.ratioTarget)
      : null;
    setKpiCardState('detail-card-ratio', targetState || ratioState);
    setKpiCardState('detail-card-deviation', targetState || deviationTrendState);
    setKpiCardState('detail-card-production', productionState);
    setKpiCardState('detail-card-scada', currentPlant.alertCount > 0 ? 'negative' : scadaState);

    // 4. Update Automotive Tachometer
    updateTachometer(currentPlant);

    // 5. Update Charts
    const chartsGrid = document.getElementById('detail-charts-grid');
    setTextPreservingIcon('consumption-chart-title', 'Consumo mensual');
    setElementText('consumption-chart-subtitle', 'Real vs consumo esperado · últimos 24 meses');
    setElementText('consumption-chart-legend-reference', '--- Esperado');
    renderMonthlyConsumptionChart(getSelectedSeriesWindow(currentPlant.analytics, 24));
    // Con un solo proceso la barra siempre marca 100 %: el panel no aporta y se oculta.
    const processCard = document.getElementById('process-breakdown-card');
    const singleProcess = (currentPlant.processes?.length || 0) <= 1;
    if (processCard) processCard.hidden = singleProcess;
    if (chartsGrid) chartsGrid.classList.toggle('single-chart', singleProcess);
    renderProcessBars(currentPlant.processes, currentPlant.processAlert);
    renderStrategicAnalytics(currentPlant);
    renderForecastSection(currentPlant);

    // 6. Diagnostic Alert Card
    updateDiagnosticCard(currentPlant);
  }

  // --- PRONÓSTICO Y ESCENARIOS ---
  // Sin plan del usuario se muestra el pronóstico del pipeline (plan por defecto + incertidumbre de la
  // producción). Con un plan fijo (ECU/mes) se usan las 500 simulaciones del modelo:
  // consumo = s[d][h] + β[d] · producción y costo = consumo · precio[d][h].
  const forecastState = { plantId: null, production: null, goalMonth: null, goal: undefined, open: false, view: 'consumo' };

  function initForecast() {
    const production = document.getElementById('forecast-production-input');
    const goal = document.getElementById('forecast-goal-input');
    const goalMonth = document.getElementById('forecast-goal-month');
    const reset = document.getElementById('btn-forecast-reset');
    const current = () => DashboardStore.plants[DashboardStore.currentPlantId];
    // Abierto o cerrado se conserva al cambiar de planta.
    document.getElementById('btn-forecast-toggle')?.addEventListener('click', () => {
      forecastState.open = !forecastState.open;
      renderForecastSection(current());
    });
    document.querySelectorAll('[data-forecast-view]').forEach(button => {
      button.addEventListener('click', () => {
        forecastState.view = button.dataset.forecastView;
        document.querySelectorAll('[data-forecast-view]').forEach(other => {
          const active = other === button;
          other.classList.toggle('is-active', active);
          other.setAttribute('aria-pressed', String(active));
        });
        renderForecastSection(current(), { keepInputs: true });
      });
    });
    production?.addEventListener('input', () => {
      const value = Number(production.value);
      forecastState.production = production.value.trim() !== '' && value > 0 ? value : null;
      renderForecastSection(current(), { keepInputs: true });
    });
    reset?.addEventListener('click', () => {
      forecastState.production = null;
      renderForecastSection(current());
    });
    goal?.addEventListener('input', () => {
      const value = Number(String(goal.value).replace(',', '.'));
      forecastState.goal = goal.value.trim() !== '' && value > 0 ? value : null;
      renderForecastSection(current(), { keepInputs: true });
    });
    goalMonth?.addEventListener('change', () => {
      forecastState.goalMonth = goalMonth.value;
      renderForecastSection(current(), { keepInputs: true });
    });
  }

  function getForecastData(plant) {
    const dataset = plant?.analytics?.dataset;
    const forecast = dataset?.pronostico;
    const scenarios = dataset?.escenarios;
    if (!forecast?.meses?.length || !scenarios?.s?.length) return null;
    return { forecast, scenarios };
  }

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * q;
    const low = Math.floor(position);
    const high = Math.ceil(position);
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
  }

  function summarize(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    return { p2_5: quantile(sorted, 0.025), p50: quantile(sorted, 0.5), p97_5: quantile(sorted, 0.975) };
  }

  /** Mes actual 'YYYY-MM' (el pronóstico se ubica por fecha, no por posición). */
  function currentMonthKey() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  /** Meses pronosticados con consumo, consumo por unidad y costo (p2,5 / p50 / p97,5). */
  function buildForecastMonths(plant, data, production) {
    const { forecast, scenarios } = data;
    return forecast.meses.map((month, h) => {
      if (production === null) {
        const units = month.produccion?.p50;
        return {
          fecha: month.fecha,
          consumo: month.consumo,
          intensidad: hasNumericValue(units) && units > 0 ? month.consumo.p50 / units : null,
          costo: month.costo_total || null,
          produccion: units
        };
      }
      const consumption = scenarios.s.map((row, draw) => row[h] + scenarios.beta[draw] * production);
      const cost = scenarios.precio ? consumption.map((value, draw) => value * scenarios.precio[draw][h]) : [];
      const consumo = summarize(consumption);
      return {
        fecha: month.fecha,
        consumo,
        intensidad: consumo.p50 / production,
        costo: cost.length ? summarize(cost) : null,
        produccion: production
      };
    });
  }

  function renderForecastSection(plant, { keepInputs = false } = {}) {
    const section = document.getElementById('forecast-section');
    if (!section) return;
    const data = getForecastData(plant);
    section.hidden = !data;
    if (!data) return;
    if (forecastState.plantId !== plant.id) {
      // Al cambiar de planta se vuelve al plan por defecto y a la meta de la planta.
      // goal: undefined = aún sin tocar (se propone la meta del presupuesto); null = el usuario la borró.
      Object.assign(forecastState, { plantId: plant.id, production: null, goalMonth: null, goal: undefined });
      keepInputs = false;
    }
    const { forecast, scenarios } = data;
    const unit = getPlantConsumptionUnit(plant);
    const unitsLabel = getIntensityDenominator(plant.analytics.intensityUnit);
    const lastReal = plant.analytics.latestAvailable.fecha;
    const today = currentMonthKey();
    const defaultPlan = Number(scenarios.produccion_referencia?.[0] ?? forecast.plan_produccion?.[0]);
    const mape = Number(forecast.mape_backtest);

    setElementText('forecast-title', 'Pronóstico y escenarios · ' + plant.name);
    setElementText('forecast-summary', 'Último dato real: ' + formatMonthLabel(lastReal) + '. Los meses hasta '
      + formatMonthLabel(today) + ' no tienen dato real todavía y se muestran como estimados.');
    const confidence = document.getElementById('forecast-confidence-badge');
    if (confidence) {
      const low = forecast.confianza === 'baja';
      confidence.className = 'analytics-badge' + (low ? ' danger' : '');
      confidence.textContent = (low ? 'CONFIANZA BAJA' : 'CONFIANZA NORMAL') + (hasNumericValue(mape) ? ' · ERROR TÍPICO ±' + formatDecimal(mape * 100, 0) + '%' : '');
      confidence.title = 'Error medio del modelo en el backtest con el plan de producción por defecto (MAPE).'
        + (low ? ' Por encima del ' + formatDecimal(Number(forecast.umbral_mape) * 100, 0) + ' %: úsalo como orientación.' : '');
    }
    setElementText('forecast-origin-badge', 'DESDE ' + formatMonthLabel(forecast.meses[0].fecha).toUpperCase());
    const body = document.getElementById('forecast-body');
    const toggle = document.getElementById('btn-forecast-toggle');
    if (body) body.hidden = !forecastState.open;
    if (toggle) {
      toggle.textContent = forecastState.open ? 'Ocultar ▴' : 'Mostrar ▾';
      toggle.setAttribute('aria-expanded', String(forecastState.open));
    }
    if (!forecastState.open) return;

    setElementText('forecast-production-label', 'Producción por mes (' + unitsLabel + ')');
    const input = document.getElementById('forecast-production-input');
    if (input && !keepInputs) input.value = forecastState.production ?? Math.round(defaultPlan);
    const reset = document.getElementById('btn-forecast-reset');
    if (reset) reset.hidden = forecastState.production === null;
    setElementText('forecast-plan-note', forecastState.production === null
      ? 'Plan por defecto: promedio de los últimos ' + (scenarios.plan_meses || 3) + ' meses (' + formatNumber(Math.round(defaultPlan)) + ' '
        + unitsLabel + '). El rango incluye la incertidumbre de la producción.'
      : 'Escenario: ' + formatNumber(forecastState.production) + ' ' + unitsLabel + ' todos los meses. Cada ' + unitsLabel
        + ' adicional suma ≈ ' + formatDecimal(scenarios.beta_resumen?.media, 2) + ' ' + unit + '. El rango solo incluye la incertidumbre del modelo.');

    const months = buildForecastMonths(plant, data, forecastState.production);
    renderForecastGoalOptions(plant, months, today);
    renderForecastChart(plant, months, lastReal, today);
    renderForecastTable(plant, months, today);
    renderForecastGoal(plant);
  }

  function renderForecastTable(plant, months, today) {
    const body = document.getElementById('forecast-table-body');
    if (!body) return;
    const intensityUnit = getPlantIntensityUnit(plant);
    body.replaceChildren(...months.map(month => {
      const row = document.createElement('tr');
      const range = month.consumo.p2_5 !== null
        ? formatCompactNumber(month.consumo.p2_5) + ' – ' + formatCompactNumber(month.consumo.p97_5)
        : '—';
      const state = document.createElement('span');
      const estimated = month.fecha <= today;
      state.className = 'threshold-badge ' + (estimated ? 'is-estimated' : 'is-forecast');
      state.textContent = estimated ? 'Estimado · sin dato real' : 'Pronóstico';
      [formatMonthLabel(month.fecha), formatConsumption(plant, Math.round(month.consumo.p50)), range,
        hasNumericValue(month.intensidad) ? formatDecimal(month.intensidad, 2) + ' ' + intensityUnit : '—',
        month.costo?.p50 ? formatCurrencyCop(month.costo.p50, true) : '—', state].forEach(value => {
        const cell = document.createElement('td');
        if (value instanceof Node) cell.appendChild(value);
        else cell.textContent = value;
        row.appendChild(cell);
      });
      return row;
    }));
  }

  /**
   * Serie del gráfico según la vista: consumo total (pronóstico del pipeline o escenario) o consumo por
   * unidad. El consumo por unidad se simula con la producción del plan como dato fijo: (s + β·prod) / prod.
   */
  function buildForecastChartSeries(plant, months) {
    const history = plant.analytics.totalSeries.slice(-24);
    if (forecastState.view !== 'intensidad') {
      return {
        history: history.filter(record => hasNumericValue(record.consumo)).map(record => ({ fecha: record.fecha, real: Number(record.consumo) })),
        months: months.map(month => ({ fecha: month.fecha, ...month.consumo })),
        format: value => formatCompactNumber(value),
        floorZero: true
      };
    }
    const { forecast, scenarios } = getForecastData(plant);
    return {
      history: history.filter(record => hasNumericValue(record.intensidad)).map(record => ({ fecha: record.fecha, real: Number(record.intensidad) })),
      months: forecast.meses.map((month, h) => {
        const production = forecastState.production ?? Number(scenarios.produccion_referencia[h]);
        return { fecha: month.fecha, ...summarize(scenarios.s.map((row, draw) => (row[h] + scenarios.beta[draw] * production) / production)) };
      }),
      goal: forecastState.goal,
      format: value => formatDecimal(value, 2),
      floorZero: false
    };
  }

  function renderForecastChart(plant, months, lastReal, today) {
    const svg = document.getElementById('forecast-chart');
    if (!svg) return;
    svg.replaceChildren();
    const intensityView = forecastState.view === 'intensidad';
    const series = buildForecastChartSeries(plant, months);
    const history = series.history;
    const points = [...history, ...series.months];
    const goal = hasNumericValue(series.goal) ? Number(series.goal) : null;
    const width = 960;
    const height = 340;
    const padding = { top: 22, right: 24, bottom: 38, left: 64 };
    const values = points.flatMap(point => [point.real, point.p2_5, point.p97_5, point.p50]).filter(Number.isFinite);
    if (goal !== null) values.push(goal);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const span = Math.max(rawMax * 0.01, rawMax - rawMin);
    const minValue = series.floorZero ? Math.max(0, rawMin - span * 0.08) : rawMin - span * 0.08;
    const maxValue = rawMax + span * 0.08;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const getX = index => padding.left + (index / (points.length - 1)) * chartWidth;
    const getY = value => padding.top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;
    const path = (items, read) => items.map(([index, item], position) => (position ? 'L' : 'M') + ' ' + getX(index).toFixed(1) + ' ' + getY(read(item)).toFixed(1)).join(' ');

    // Meses ya transcurridos sin dato real (entre el último dato y hoy).
    const noData = points.map((point, index) => [index, point]).filter(([, point]) => point.fecha > lastReal && point.fecha <= today);
    if (noData.length) {
      const step = chartWidth / (points.length - 1);
      const x1 = getX(noData[0][0]) - step / 2;
      const x2 = getX(noData.at(-1)[0]) + step / 2;
      svg.appendChild(createSvgElement('rect', {
        x: x1, y: padding.top, width: x2 - x1, height: chartHeight, fill: 'rgba(255, 171, 0, 0.07)'
      }));
      svg.appendChild(createSvgElement('text', {
        x: (x1 + x2) / 2, y: padding.top + 12, 'text-anchor': 'middle', fill: 'var(--amber-warn)', 'font-size': 10
      }, 'Sin dato real'));
    }

    for (let index = 0; index <= 4; index++) {
      const y = padding.top + (chartHeight / 4) * index;
      svg.appendChild(createSvgElement('line', { x1: padding.left, y1: y, x2: width - padding.right, y2: y, stroke: 'var(--border-bright)', 'stroke-width': 1 }));
      svg.appendChild(createSvgElement('text', {
        x: padding.left - 8, y: y + 3, 'text-anchor': 'end', fill: 'var(--text-muted)', 'font-size': 10, 'font-family': 'var(--font-mono)'
      }, series.format(maxValue - ((maxValue - minValue) / 4) * index)));
    }

    // Banda del 95 % y mediana del pronóstico; arranca en el último dato real para que la línea sea continua.
    const lastHistory = history.length - 1;
    const forecastPoints = points.map((point, index) => [index, point]).filter(([, point]) => hasNumericValue(point.p50));
    const anchor = [lastHistory, { p2_5: points[lastHistory].real, p50: points[lastHistory].real, p97_5: points[lastHistory].real }];
    const band = [anchor, ...forecastPoints];
    const bandPath = path(band, item => item.p97_5) + ' ' + [...band].reverse().map(([index, item]) => 'L ' + getX(index).toFixed(1) + ' ' + getY(item.p2_5).toFixed(1)).join(' ') + ' Z';
    svg.appendChild(createSvgElement('path', { d: bandPath, fill: 'rgba(0, 216, 255, 0.14)', stroke: 'none' }));
    svg.appendChild(createSvgElement('path', { d: path(band, item => item.p50), fill: 'none', stroke: '#00D8FF', 'stroke-width': 2.2, 'stroke-dasharray': '6 4' }));

    // Meta de consumo por unidad (la del panel "Meta del mes").
    if (goal !== null) {
      const y = getY(goal);
      svg.appendChild(createSvgElement('line', { x1: padding.left, y1: y, x2: width - padding.right, y2: y, stroke: '#FFAB00', 'stroke-width': 1.8, 'stroke-dasharray': '3 3' }));
      svg.appendChild(createSvgElement('text', {
        x: width - padding.right - 4, y: y - 6, 'text-anchor': 'end', fill: '#FFAB00', 'font-size': 11, 'font-weight': 700
      }, 'Meta ' + formatDecimal(goal, 2)));
    }

    const realPoints = points.map((point, index) => [index, point]).filter(([, point]) => hasNumericValue(point.real));
    svg.appendChild(createSvgElement('path', { d: path(realPoints, item => item.real), fill: 'none', stroke: '#9E7DFF', 'stroke-width': 2.6, 'stroke-linejoin': 'round' }));
    svg.appendChild(createSvgElement('circle', { cx: getX(lastHistory), cy: getY(points[lastHistory].real), r: 4, fill: '#9E7DFF', stroke: '#fff', 'stroke-width': 1.2 }));

    const labels = [0, Math.floor(lastHistory / 2), lastHistory, points.length - 1];
    [...new Set(labels)].forEach(index => {
      svg.appendChild(createSvgElement('text', { x: getX(index), y: height - 12, 'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': 10 }, formatMonthLabel(points[index].fecha)));
    });

    const unit = intensityView ? getPlantIntensityUnit(plant) : getPlantConsumptionUnit(plant);
    svg.setAttribute('aria-label', (intensityView ? 'Consumo por unidad' : 'Consumo mensual') + ' de ' + plant.name + ' en ' + unit
      + ': real hasta ' + formatMonthLabel(lastReal) + ' y pronóstico hasta ' + formatMonthLabel(series.months.at(-1).fecha));
    setElementText('forecast-chart-kicker', intensityView ? 'CONSUMO POR UNIDAD · ' + unit : 'CONSUMO MENSUAL · ' + unit);
    const legendGoal = document.getElementById('forecast-legend-goal');
    if (legendGoal) legendGoal.hidden = goal === null;
    const units = getIntensityDenominator(plant.analytics.intensityUnit);
    const production = forecastState.production ?? Number(getForecastData(plant).scenarios.produccion_referencia[0]);
    setElementText('forecast-chart-note', intensityView
      ? 'La banda supone que se producen ' + formatNumber(Math.round(production)) + ' ' + units + ' cada mes (el plan del escenario): solo incluye la incertidumbre del modelo, no la de la producción.'
        + (goal === null ? ' Escribe una meta en "Meta del mes" para ver su línea.' : '')
      : '');
  }

  function renderForecastGoalOptions(plant, months, today) {
    const select = document.getElementById('forecast-goal-month');
    if (!select) return;
    const fechas = months.map(month => month.fecha);
    if (!forecastState.goalMonth || !fechas.includes(forecastState.goalMonth)) {
      // Mes en curso; si cae fuera del horizonte, el mes pronosticado más cercano.
      forecastState.goalMonth = fechas.includes(today) ? today : (today < fechas[0] ? fechas[0] : fechas.at(-1));
    }
    select.replaceChildren(...fechas.map(fecha => {
      const option = document.createElement('option');
      option.value = fecha;
      option.textContent = formatMonthLabel(fecha) + (fecha === today ? ' (mes en curso)' : '');
      return option;
    }));
    select.value = forecastState.goalMonth;
    const input = document.getElementById('forecast-goal-input');
    if (forecastState.goal === undefined) {
      const target = budgetTarget(plant, forecastState.goalMonth, null);
      forecastState.goal = hasNumericValue(target) ? Number(target.toFixed(2)) : null;
    }
    if (input && document.activeElement !== input) input.value = forecastState.goal ?? '';
    setElementText('forecast-goal-label', 'Meta (' + getPlantIntensityUnit(plant) + ')');
  }

  /** Probabilidad de que el consumo por unidad del mes supere la meta, con la producción del escenario. */
  function renderForecastGoal(plant) {
    const data = getForecastData(plant);
    const result = document.getElementById('forecast-goal-probability');
    if (!data || !result) return;
    const { forecast, scenarios } = data;
    const h = forecast.meses.findIndex(month => month.fecha === forecastState.goalMonth);
    const goal = forecastState.goal;
    const intensityUnit = getPlantIntensityUnit(plant);
    if (h < 0 || !hasNumericValue(goal)) {
      result.className = 'forecast-goal-probability';
      result.textContent = '—';
      setElementText('forecast-goal-detail', 'Escribe la meta de consumo por unidad del mes para calcular la probabilidad de superarla.');
      return;
    }
    const production = forecastState.production ?? Number(scenarios.produccion_referencia[h]);
    const intensities = scenarios.s.map((row, draw) => (row[h] + scenarios.beta[draw] * production) / production);
    const probability = intensities.filter(value => value > goal).length / intensities.length;
    const range = summarize(intensities);
    result.className = 'forecast-goal-probability ' + (probability > 0.5 ? 'is-alert' : probability > 0.2 ? 'is-warning' : 'is-ok');
    result.textContent = formatDecimal(probability * 100, 0) + '% de probabilidad de superar la meta';
    setElementText('forecast-goal-detail', 'Consumo por unidad esperado en ' + formatMonthLabel(forecastState.goalMonth) + ': '
      + formatDecimal(range.p50, 2) + ' ' + intensityUnit + ' (rango 95 %: ' + formatDecimal(range.p2_5, 2) + ' – ' + formatDecimal(range.p97_5, 2)
      + ') con ' + formatNumber(Math.round(production)) + ' ' + getIntensityDenominator(plant.analytics.intensityUnit) + ' producidas.');
  }

  // --- AUTOMOTIVE TACHOMETER (VELOCÍMETRO DE DEMANDA ELÉCTRICA) ---
  let currentAnimatedKwh = 0;
  let targetKwh = 0;
  let currentBudgetKwh = null;
  let currentMaxCapacity = 0;
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

    setElementText('cal-promedio-val', hasNumericValue(budgetKwh) ? formatConsumption(plant, budgetKwh) : 'n.a.');
    setElementText('cal-capacidad-val', formatConsumption(plant, maxKwh));
    setElementText('cal-previous-val', formatConsumption(plant, plant.previous.kwh));
    setElementText('cal-capacidad-name', 'Límite superior esperado');
    setElementText('tachometer-cluster-sub', 'Datos mensuales · ' + plant.name);

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
    if (posValEl) posValEl.textContent = formatConsumption(plant, newKwh);
    if (posSubEl) {
      if (!hasNumericValue(exceso)) {
        posSubEl.textContent = 'El corte no declara una meta energética';
        posSubEl.className = 'cal-sub';
      } else if (exceso > 0) {
        posSubEl.textContent = 'Zona de Sobreconsumo: +' + formatConsumption(plant, exceso) + ' Exceso';
        posSubEl.className = 'cal-sub red';
      } else {
        posSubEl.textContent = 'Margen de Seguridad: ' + formatConsumption(plant, Math.abs(exceso)) + ' Restante';
        posSubEl.className = 'cal-sub green';
      }
    }

    const capacityRemaining = maxKwh - newKwh;
    setElementText(
      'cal-capacidad-sub',
      capacityRemaining >= 0
        ? 'Margen hasta rango superior: ' + formatConsumption(plant, capacityRemaining)
        : 'Rango superior excedido: ' + formatConsumption(plant, Math.abs(capacityRemaining))
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
    const needleColor = !hasBudget ? 'var(--clarios-purple-light)' : (isOverBudget ? 'var(--fire-red)' : 'var(--neon-green)');
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
        gaugeAlertPill.textContent = `Límite superado: +${pctOver}% sobre la meta de ${formatConsumption(DashboardStore.plants[DashboardStore.currentPlantId], budget)}`;
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
        stroke: 'var(--border-bright)', 'stroke-width': 1
      }));
      svg.appendChild(createSvgElement('text', {
        x: padding.left - 6, y: y + 3, 'text-anchor': 'end', fill: 'var(--text-muted)',
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
        x: getX(index), y: height - 7, 'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': 9
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
    setElementText('analytics-source-badge', 'JSON · ' + analytics.period.meses + ' MESES');

    const insightParts = [];
    const historicalGap = percentageChange(latest.intensidad, range.esperado);
    if (hasNumericValue(historicalGap)) {
      insightParts.push('El consumo por unidad está ' + formatSigned(historicalGap, 1) + '% frente a lo esperado');
    }
    if (hasNumericValue(budgetDeviation)) insightParts.push(formatSigned(budgetDeviation, 1) + '% frente al presupuesto');
    if (hasNumericValue(estimatedCostImpact)) insightParts.push('impacto estimado: ' + formatCurrencyCop(estimatedCostImpact, true));
    setElementText('analytics-control-insight', insightParts.length ? insightParts.join(' · ') + '.' : 'El corte no tiene referencias suficientes para estimar la brecha; revise consumo, producción y consumo por unidad.');

    renderIntensityControlChart(getSelectedSeriesWindow(analytics, 24), analytics.intensityUnit);
    renderAnalyticsProcessComparison(analytics.processes, analytics.intensityUnit, latest.fecha, plant.name);
    renderAnalyticsAlerts(analytics.alerts, analytics.intensityUnit);
    renderAnalyticsCoverage(analytics);
  }

  function renderIntensityControlChart(series, unit) {
    const svg = document.getElementById('analytics-intensity-chart');
    if (!svg) return;
    svg.replaceChildren();

    const records = series.filter(record => hasNumericValue(record.intensidad));
    if (records.length < 2) {
      svg.appendChild(createSvgElement('text', {
        x: 380, y: 140, 'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': 12
      }, 'Se requieren dos cortes con consumo por unidad para dibujar la tendencia.'));
      return;
    }

    const width = 960;
    const height = 340;
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
        stroke: 'var(--border-bright)', 'stroke-width': 1
      }));
      svg.appendChild(createSvgElement('text', {
        x: padding.left - 8, y: y + 4, 'text-anchor': 'end', fill: 'var(--text-muted)',
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

    appendSeriesPath(svg, records, getX, getY, record => record.rangos?.intensidad?.esperado, 'var(--cyan-telemetry)', '5 4', 1.6);
    appendSeriesPath(svg, records, getX, getY, record => record.intensidad_ppto, '#FFAB00', '3 4', 1.7);
    appendSeriesPath(svg, records, getX, getY, record => record.intensidad, 'var(--clarios-purple-light)', '', 2.7);

    const lastIndex = records.length - 1;
    const last = records[lastIndex];
    svg.appendChild(createSvgElement('circle', {
      cx: getX(lastIndex), cy: getY(Number(last.intensidad)), r: 5,
      fill: '#FF3D57', stroke: '#fff', 'stroke-width': 1.5
    }));
    svg.appendChild(createSvgElement('text', {
      x: getX(lastIndex) - 8, y: getY(Number(last.intensidad)) - 10, 'text-anchor': 'end',
      fill: 'var(--fire-red)', 'font-size': 10, 'font-weight': 700, 'font-family': 'var(--font-mono)'
    }, formatDecimal(last.intensidad, 2)));

    [...new Set([0, 6, 12, 18, records.length - 1].filter(index => index < records.length))].forEach(index => {
      svg.appendChild(createSvgElement('text', {
        x: getX(index), y: height - 12, 'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': 9
      }, formatMonthLabel(records[index].fecha)));
    });
    svg.appendChild(createSvgElement('text', {
      x: padding.left, y: 12, fill: 'var(--text-muted)', 'font-size': 9
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
      if (!latest || !hasNumericValue(latest.intensidad)) return;
      const range = latest.rangos?.intensidad || {};
      const budgetDeviation = hasNumericValue(latest.desviacion_ppto) ? Number(latest.desviacion_ppto) * 100 : null;
      const dualSignal = hasNumericValue(budgetDeviation) && budgetDeviation < 0 && ['alto', 'bajo'].includes(range.estado);
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
        getIntensityRangeStatus(range).label,
        getIntensityRangeStatus(range).state
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
      ['Estacionalidad', seasonalityValue, seasonalityMetrics.length ? 'Consumo, producción y consumo por unidad' : 'No declarada en el archivo importado'],
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
      stats.textContent = `${formatConsumption(DashboardStore.plants[DashboardStore.currentPlantId], proc.kwh)} (${proc.pct}%)`;

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

  // 4. Diagnostic Card Update
  function updateDiagnosticCard(plant) {
    const card = document.getElementById('diagnostic-card');
    const badge = document.getElementById('diag-trip-badge');
    const desc = document.getElementById('diag-body-text');
    const meta = document.getElementById('diagnostic-meta-strip');

    if (!card) return;

    const latest = plant.analytics.latest;
    const range = latest.rangos?.intensidad || {};
    const hasAlerts = plant.analytics.alerts.length > 0 || range.estado === 'alto' || Number(latest.desviacion_ppto) > 0;
    const hasReference = hasPerformanceReference(plant);
    card.classList.toggle('resolved', !hasAlerts && hasReference);
    if (badge) badge.textContent = hasAlerts ? 'PRIORIDAD: CONSUMO POR UNIDAD' : (hasReference ? 'SIN ALERTAS ANALÍTICAS ACTIVAS' : 'REFERENCIAS INSUFICIENTES');
    if (desc) {
      const findings = [];
      if (hasNumericValue(latest.desviacion_ppto)) {
        const deviation = Number(latest.desviacion_ppto) * 100;
        findings.push('el consumo por unidad está ' + formatSigned(deviation, 1) + '% ' + (deviation > 0 ? 'sobre' : 'frente al') + ' presupuesto');
      } else {
        findings.push('el archivo no incluye presupuesto para este corte');
      }
      if (hasNumericValue(range.esperado)) {
        findings.push('el valor actual es ' + formatDecimal(latest.intensidad, 2) + ' frente a ' + formatDecimal(range.esperado, 2) + ' ' + getPlantIntensityUnit(plant) + ' esperados');
      }
      const mostRelevant = plant.analytics.alerts?.[0]?.proceso;
      if (mostRelevant) findings.push('la primera señal a revisar corresponde a ' + formatProcessName(mostRelevant));
      desc.textContent = plant.name + ': ' + findings.join('; ') + '. ' + (hasAlerts ? 'Conviene revisar las señales por proceso antes del siguiente corte.' : (hasReference ? 'No se detectaron señales analíticas activas con las reglas disponibles en el período seleccionado.' : 'La ausencia de alertas no confirma un buen consumo por unidad: faltan una meta y un rango histórico válido para evaluar este corte.'));
    }
    if (meta) {
      meta.textContent = 'Corte: ' + formatMonthLabel(latest.fecha) + ' · Fuente: ' + plant.sourceFileName + ' · Generado: ' + formatGeneratedDate(plant.analytics.generatedAt);
    }
  }

  function getIntensityRangeStatus(range = {}) {
    const states = {
      normal: { label: 'En rango histórico', state: 'positive' },
      alto: { label: 'Sobre el rango histórico', state: 'negative' },
      bajo: { label: 'Bajo el rango histórico', state: 'neutral' },
      sin_historia: { label: 'Sin historia suficiente', state: 'neutral' },
      inactivo: { label: 'Proceso inactivo', state: 'neutral' },
      excluido: { label: 'Excluido del rango histórico', state: 'neutral' },
      sin_dato: { label: 'Sin dato de consumo por unidad', state: 'neutral' }
    };
    return states[range.estado] || { label: 'Sin rango histórico válido', state: 'neutral' };
  }

  function hasPerformanceReference(plant) {
    const latest = plant.analytics?.latest;
    const target = latest ? latest.intensidad_ppto : plant.ratioTarget;
    return (hasNumericValue(target) && Number(target) > 0) ||
      ['normal', 'alto', 'bajo'].includes(latest?.rangos?.intensidad?.estado);
  }

  function buildPlantAnalysis(plant) {
    const analytics = plant.analytics;
    const current = analytics.latest;
    const previous = analytics.previous;
    const currentPeriod = current.fecha;
    const previousPeriod = previous.fecha;
    const consumption = current.consumo;
    const previousConsumption = previous.consumo;
    const consumptionChange = percentageChange(consumption, previousConsumption);
    const productionChange = percentageChange(current.produccion, previous.produccion);
    const ratioGap = hasNumericValue(plant.ratioTarget) && Number(plant.ratioTarget) !== 0
      ? percentageChange(plant.ratioKwhUnit, plant.ratioTarget)
      : null;
    const currentCost = getPlantCostCop(plant);
    const previousCost = plant.previous?.costAmount;
    const costChange = percentageChange(currentCost, previousCost);
    const budget = hasNumericValue(current.produccion) && hasNumericValue(current.intensidad_ppto)
      ? Number(current.produccion) * Number(current.intensidad_ppto)
      : null;
    const budgetGapKwh = hasNumericValue(budget)
      ? Number(consumption) - Number(budget)
      : null;
    const range = current.rangos?.intensidad || {};
    const processes = Array.isArray(plant.processes) ? plant.processes.filter(process => hasNumericValue(process.kwh)) : [];
    const topProcess = processes.length
      ? [...processes].sort((left, right) => Number(right.kwh) - Number(left.kwh))[0]
      : null;
    const alertCount = Number(plant.alertCount || 0);
    const signalCount = analytics.alerts?.length || 0;
    const hasReference = hasPerformanceReference(plant);
    const deviation = hasNumericValue(plant.deviationPct) ? Number(plant.deviationPct) : null;
    const isHighPriority = alertCount >= 2 || (hasNumericValue(deviation) && deviation >= 10) || (hasNumericValue(ratioGap) && ratioGap >= 10);
    const isMediumPriority = !isHighPriority && (alertCount > 0 || range.estado === 'alto' || (hasNumericValue(deviation) && deviation > 2) || (hasNumericValue(ratioGap) && ratioGap > 2));
    const priority = isHighPriority
      ? { key: 'high', label: 'Prioridad alta' }
      : (isMediumPriority ? { key: 'medium', label: 'Prioridad media' } : (hasReference ? { key: 'low', label: 'Sin alertas prioritarias' } : { key: 'neutral', label: 'Evaluación limitada' }));
    const seriesCount = analytics.totalSeries.filter(record => record.fecha <= currentPeriod).length;
    const scope = 'Descriptivo · ' + seriesCount + ' cortes hasta este período';
    const sourceLabel = 'Fuente: ' + plant.sourceFileName + ' · ' + seriesCount + ' cortes mensuales hasta ' + formatMonthLabel(currentPeriod);

    const findings = [];
    if (hasNumericValue(consumptionChange)) {
      findings.push(
        'El consumo fue ' + formatConsumption(plant, consumption) + ' y ' +
        (consumptionChange > 0 ? 'aumentó ' : (consumptionChange < 0 ? 'disminuyó ' : 'no cambió ')) +
        formatDecimal(Math.abs(consumptionChange), 1) + '% frente al corte anterior disponible (' + formatConsumption(plant, previousConsumption) + ').'
      );
    }
    if (hasNumericValue(ratioGap)) {
      findings.push(
        'El consumo por unidad es ' + formatDecimal(plant.ratioKwhUnit, 2) + ' ' + getPlantIntensityUnit(plant) +
        ', ' + (ratioGap === 0 ? 'igual a la meta.' : formatDecimal(Math.abs(ratioGap), 1) + '% ' + (ratioGap > 0 ? 'por encima' : 'por debajo') + ' de la meta.')
      );
    } else {
      findings.push('No existe una meta de consumo por unidad suficiente para evaluar la eficiencia por unidad producida.');
    }
    if (hasNumericValue(deviation) && hasNumericValue(budgetGapKwh)) {
      findings.push(
        'La brecha presupuestaria es ' + formatSigned(deviation, 1) + '%: ' +
        (budgetGapKwh === 0 ? 'consumo igual a la meta estimada.' : formatConsumption(plant, Math.abs(budgetGapKwh)) + ' ' + (budgetGapKwh > 0 ? 'sobre' : 'por debajo de') + ' la meta estimada.')
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
        topProcess.name + ' concentra ' + formatDecimal(topProcess.pct, 1) + '% del consumo visible (' + formatConsumption(plant, topProcess.kwh) + '); es el primer frente para segmentar la revisión.'
      );
    }
    const historicalGap = percentageChange(plant.ratioKwhUnit, range.esperado);
    if (hasNumericValue(historicalGap)) {
      findings.push(
        'Frente al rango histórico, el consumo por unidad ' + (historicalGap === 0 ? 'coincide con' : 'está ' + formatDecimal(Math.abs(historicalGap), 1) + '% ' +
        (historicalGap > 0 ? 'por encima' : 'por debajo') + ' del') + ' valor esperado de ' + formatDecimal(range.esperado, 2) + ' ' + getPlantIntensityUnit(plant) + '.'
      );
    }
    findings.push(signalCount > 0
      ? 'Hay ' + signalCount + (signalCount === 1 ? ' señal analítica' : ' señales analíticas') + ' en ' + alertCount + (alertCount === 1 ? ' proceso' : ' procesos') + (signalCount === 1 ? '; requiere' : '; requieren') + ' validación operativa.'
      : 'No se detectaron alertas por proceso con las reglas disponibles para este corte.' + (!hasReference ? ' Faltan una meta y un rango histórico válido; esto no confirma un buen consumo por unidad.' : ''));

    const decisions = [];
    if (alertCount > 0 || (hasNumericValue(deviation) && deviation > 0)) {
      decisions.push({
        title: 'Validar el foco de mayor consumo antes del siguiente corte',
        detail: 'Revisar ' + (topProcess?.name || 'el proceso principal') + ' con operación, mantenimiento y producción. Confirmar si el cambio corresponde a volumen, ineficiencia, parada, arranque o calidad del dato.',
        indicator: 'Criterio de cierre: consumo y consumo por unidad explicados y responsable asignado.'
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
        detail: 'Verificar si el aumento del costo se explica por más ' + getPlantConsumptionUnit(plant) + ', por una tarifa COP/' + getPlantConsumptionUnit(plant) + ' mayor o por ambos. Esto evita priorizar acciones operativas cuando la causa principal es contractual.',
        indicator: 'Seguimiento: costo total, ' + getPlantConsumptionUnit(plant) + ' y COP/' + getPlantConsumptionUnit(plant) + ' en la misma revisión.'
      });
    }
    if (hasNumericValue(productionChange) && hasNumericValue(consumptionChange) && productionChange < 0 && consumptionChange > 0) {
      decisions.push({
        title: 'Escalar la combinación consumo arriba / producción abajo',
        detail: 'La señal conjunta sugiere pérdida de eficiencia y merece revisión prioritaria de tiempos ociosos, rechazos, reprocesos y equipos auxiliares.',
        indicator: 'Seguimiento: producción, horas operadas, consumo por unidad y reproceso.'
      });
    }
    if (!hasReference) {
      decisions.push({
        title: 'Completar las referencias antes de evaluar el consumo por unidad',
        detail: 'El corte no tiene una meta ni un rango histórico válido. Validar la cobertura, la producción y el presupuesto con la fuente; la ausencia de alertas no demuestra eficiencia.',
        indicator: 'Criterio de cierre: referencias comparables y datos válidos para el corte seleccionado.'
      });
    }
    if (!decisions.length) {
      decisions.push({
        title: 'Mantener el control y documentar la práctica favorable',
        detail: 'El corte no muestra una desviación prioritaria con las reglas disponibles. Registrar las condiciones de operación y comprobar si el resultado es repetible.',
        indicator: 'Seguimiento: conservar el consumo por unidad en meta durante los próximos tres cortes.'
      });
    }
    decisions.push({
      title: 'Revisar nuevamente en el próximo corte',
      detail: 'Asignar responsable y fecha. Una recomendación solo se considera efectiva cuando el KPI posterior confirma el cambio sin deteriorar producción ni calidad.',
      indicator: 'Seguimiento mínimo: consumo, producción, consumo por unidad, costo y alertas.'
    });

    const limitations = [
      'Los costos se presentan en pesos colombianos (COP). Los campos costo_unitario y costo_total de los archivos importados se interpretan como COP.',
      'La fuente es mensual; no permite localizar horas pico, turnos, equipos o eventos SCADA dentro del mes.',
      'Las relaciones observadas son descriptivas. No prueban causalidad sin datos de operación, mantenimiento, producción, calidad y clima.'
    ];
    if (!hasNumericValue(currentCost)) limitations.push('La fuente no contiene un costo válido para este corte.');
    if (!hasNumericValue(budget)) limitations.push('La fuente no contiene presupuesto energético comparable.');
    if (!['normal', 'alto', 'bajo'].includes(range.estado)) limitations.push('El corte no tiene un rango histórico de consumo por unidad válido: ' + getIntensityRangeStatus(range).label.toLowerCase() + '.');
    limitations.push('La prioridad resume reglas de rango y presupuesto; no es una probabilidad ni una medida de confianza estadística.');

    const prioritySentence = priority.key === 'high'
      ? 'requiere atención prioritaria'
      : (priority.key === 'medium' ? 'requiere seguimiento dirigido' : (priority.key === 'low' ? 'no presenta alertas prioritarias según las reglas disponibles' : 'no puede evaluarse frente a una meta o rango histórico válido'));
    const consumptionSentence = hasNumericValue(consumptionChange)
      ? 'El consumo ' + (consumptionChange > 0 ? 'subió ' : (consumptionChange < 0 ? 'bajó ' : 'se mantuvo ')) + formatDecimal(Math.abs(consumptionChange), 1) + '% frente al corte anterior'
      : 'No hay un corte anterior comparable para consumo';
    const budgetSentence = hasNumericValue(deviation)
      ? ' y la brecha frente al presupuesto es ' + formatSigned(deviation, 1) + '%.'
      : '. No hay presupuesto suficiente para calcular la brecha.';

    return {
      plantId: plant.id,
      plantName: plant.name,
      period: formatMonthLabel(currentPeriod),
      previousPeriod: formatMonthLabel(previousPeriod),
      sourceLabel,
      priority,
      scope,
      summary: plant.name + ' ' + prioritySentence + '. ' + consumptionSentence + budgetSentence,
      metrics: [
        {
          label: 'Consumo',
          value: formatConsumption(plant, consumption),
          detail: hasNumericValue(consumptionChange) ? formatPercentChange(consumptionChange) + ' vs corte anterior' : 'Sin comparación',
          state: !hasNumericValue(consumptionChange) ? 'neutral' : (consumptionChange > 0 ? 'negative' : 'positive')
        },
        {
          label: 'Consumo por unidad',
          value: formatDecimal(plant.ratioKwhUnit, 2) + ' ' + getPlantIntensityUnit(plant),
          detail: hasNumericValue(ratioGap) ? formatPercentChange(ratioGap) + ' vs meta' : 'Meta no disponible',
          state: !hasNumericValue(ratioGap) ? 'neutral' : (ratioGap > 0 ? 'negative' : 'positive')
        },
        {
          label: 'Presupuesto',
          value: hasNumericValue(deviation) ? formatSigned(deviation, 1) + '%' : 'n.a.',
          detail: hasNumericValue(budgetGapKwh) ? formatConsumption(plant, Math.abs(Math.round(budgetGapKwh))) + ' de brecha' : 'Sin presupuesto',
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
    setElementText('analysis-confidence-badge', 'Alcance: ' + analysis.scope);

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
    addText(analysis.priority.label + ' | Alcance: ' + analysis.scope, { size: 10, bold: true, color: analysis.priority.key === 'high' ? '0.75 0.08 0.16' : (analysis.priority.key === 'medium' ? '0.72 0.42 0.02' : (analysis.priority.key === 'neutral' ? '0.35 0.38 0.43' : '0.02 0.50 0.28')), after: 8 });

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

    const period = plant.analytics.latest.fecha;
    setElementText(
      'data-inspector-context',
      'Valores leídos de ' + plant.sourceFileName + '. La tabla usa exactamente el período activo y permite comprobar de dónde salen los KPI.'
    );
    plant.analytics.processes.forEach(process => {
      const record = findProcessRecord(process, period);
      if (!record) return;
      const rangeStatus = getIntensityRangeStatus(record.rangos?.intensidad);
      const overBudget = hasNumericValue(record.desviacion_ppto) && Number(record.desviacion_ppto) > 0;
      const stateLabel = rangeStatus.label + (overBudget ? ' · Sobre presupuesto' : '');
      const stateClass = overBudget || rangeStatus.state === 'negative' ? 'alert' : (rangeStatus.state === 'positive' ? 'normal' : 'neutral');
      appendRow(
        formatMonthLabel(period),
        formatProcessName(process.proceso),
        hasNumericValue(record.consumo) ? formatConsumption(plant, Math.round(record.consumo)) : 'n.a.',
        hasNumericValue(record.intensidad) ? formatDecimal(record.intensidad, 2) + ' ' + plant.analytics.intensityUnit : 'n.a.',
        stateLabel,
        stateClass
      );
    });
    modal.classList.add('open');
  }

  function initModals() {
    // Inspector de los datos del corte seleccionado
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

  }

  function exportPlantCSV() {
    const p = DashboardStore.plants[DashboardStore.currentPlantId];
    let csv;
    let fileName;

    csv = 'Fecha,Consumo_kWh,Produccion_ECU,Consumo_por_unidad,Consumo_por_unidad_Ppto,Desviacion_Ppto,Costo_Unitario_COP_kWh,Costo_Total_COP,Estado_Consumo_por_unidad\n';
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
  /** Sub-encabezado: dónde está el usuario y hasta qué mes llegan los datos que ve. */
  function renderSubheader() {
    const view = DashboardStore.currentView;
    const plant = DashboardStore.plants[DashboardStore.currentPlantId];
    const location = view === 'detail' ? 'PLANTAS / ' + (plant?.name || '') : view === 'sources' ? 'FUENTES DE DATOS' : 'VISTA GENERAL';
    setElementText('subheader-node-name', location.toUpperCase());

    const period = view === 'detail' ? plant?.currentPeriod : DashboardStore.globalPeriod;
    const dataStatus = period ? 'DATOS AL CORTE ' + formatMonthLabel(period).toUpperCase() : 'DATOS MENSUALES';
    setElementText('subheader-data-status', dataStatus);
    setElementText('drawer-data-status', dataStatus);
    setElementText('sync-timer-label', 'Pipeline generado el ' + formatGeneratedDate(DashboardStore.pipeline.generatedAt));
  }

  /** Resumen de la serie de una planta para la tarjeta lateral (antes: conteo de sensores). */
  function getPlantDataSummary(plant) {
    // Plantas que solo reportan el total (RC) cuentan como un proceso.
    const processes = Math.max(plant.processes?.length || 0, 1);
    const months = plant.analytics.period?.meses || 0;
    return processes + (processes === 1 ? ' proceso' : ' procesos') + ' · ' + months + ' meses';
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
    const outcome = state === 'positive' ? 'mejora' : state === 'negative' ? 'empeora' : 'estable';

    element.className = 'trend-chip trend-' + state;
    element.textContent = arrow + ' ' + formatDecimal(Math.abs(change), 1) + '% ' + outcome + suffix;
    return state;
  }

  /** Cambio porcentual sin juicio (gris): consumo, costo y producción no son buenos ni malos por sí solos. */
  function renderChange(id, currentValue, previousValue) {
    const element = document.getElementById(id);
    if (element) renderChangeElement(element, currentValue, previousValue);
  }

  function renderChangeElement(element, currentValue, previousValue, suffix = '') {
    element.className = 'trend-chip trend-neutral';
    if (!hasNumericValue(currentValue) || !hasNumericValue(previousValue) || Number(previousValue) === 0) {
      element.textContent = '• Comparación no disponible' + suffix;
      return;
    }
    const change = (currentValue - previousValue) / previousValue * 100;
    const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '•';
    element.textContent = arrow + ' ' + formatDecimal(Math.abs(change), 1) + '%' + suffix;
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
    const outcome = state === 'positive' ? 'mejora' : state === 'negative' ? 'empeora' : 'estable';

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
    card.classList.remove('state-positive', 'state-negative', 'state-neutral', 'state-warning');
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
    return plant?.costAmount;
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

  /** Unidad de consumo de la planta: m³ para gas, kWh para energía. */
  function getPlantConsumptionUnit(plant) {
    return plant?.unit === 'm3' ? 'm³' : 'kWh';
  }

  function formatConsumption(plant, value) {
    return formatNumber(value) + ' ' + getPlantConsumptionUnit(plant);
  }

  function getPlantIntensityUnit(plant) {
    return (plant?.analytics?.intensityUnit || 'kWh/u').replace('m3', 'm³');
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
    const intensityDirection = intensityChange > 0 ? 'subió (empeoró)' : (intensityChange < 0 ? 'bajó (mejoró)' : 'se mantuvo');
    return 'El consumo ' + consumptionDirection + ', la producción ' + productionDirection + ' y el consumo por unidad ' + intensityDirection + ' frente al corte anterior.';
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
