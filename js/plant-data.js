/** Normalización y alertas de los JSON por planta que genera el pipeline (backend/output). */

const MONTHS = {
  ene: 1,
  enero: 1,
  jan: 1,
  january: 1,
  feb: 2,
  febrero: 2,
  february: 2,
  mar: 3,
  marzo: 3,
  march: 3,
  abr: 4,
  abril: 4,
  apr: 4,
  april: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  junio: 6,
  june: 6,
  jul: 7,
  julio: 7,
  july: 7,
  ago: 8,
  agosto: 8,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  septiembre: 9,
  september: 9,
  oct: 10,
  octubre: 10,
  october: 10,
  nov: 11,
  noviembre: 11,
  november: 11,
  dic: 12,
  diciembre: 12,
  dec: 12,
  december: 12
};

export function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

export function normalizeEnergyDataset(dataset, expectedId = '') {
  if (!dataset || !Array.isArray(dataset.procesos)) {
    throw new Error('El archivo no contiene la estructura de procesos esperada.');
  }
  if (expectedId && dataset.id !== expectedId) {
    throw new Error('El identificador del archivo no corresponde a la planta esperada.');
  }

  const processes = dataset.procesos
    .filter(process => process && Array.isArray(process.serie))
    .map(process => ({
      ...process,
      serie: [...process.serie]
        .filter(record => record && normalizePeriod(record.fecha))
        .map(record => ({ ...record, fecha: normalizePeriod(record.fecha) }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
    }));
  const totalProcess = processes.find(process => process.es_total === true);
  if (!totalProcess || totalProcess.serie.length < 2) {
    throw new Error('Se requieren al menos dos cortes mensuales en una serie total para crear la planta.');
  }

  const totalSeries = totalProcess.serie.filter(record => (
    hasNumericValue(record.consumo) && hasNumericValue(record.intensidad)
  ));
  if (totalSeries.length < 2) {
    throw new Error('La serie total no tiene suficientes valores válidos de consumo y desempeño energético.');
  }

  const analytics = {
    dataset,
    totalProcess,
    totalSeries,
    processes,
    period: dataset.periodo || {
      inicio: totalSeries[0].fecha,
      fin: totalSeries.at(-1).fecha,
      meses: totalSeries.length
    },
    parameters: dataset.parametros || {},
    quality: dataset.calidad || {},
    generatedAt: dataset.generado || '',
    unit: dataset.unidad || 'kWh',
    intensityUnit: (dataset.unidad_intensidad || 'kWh/u').replace('m3', 'm³'),
    availablePeriods: totalSeries.slice(1).map(record => record.fecha),
    latestAvailable: totalSeries.at(-1)
  };

  selectAnalyticsPeriod(analytics, analytics.latestAvailable.fecha);
  return analytics;
}

export function selectAnalyticsPeriod(analytics, period) {
  if (!analytics || !Array.isArray(analytics.totalSeries)) return false;
  const normalizedPeriod = normalizePeriod(period);
  const index = analytics.totalSeries.findIndex(record => record.fecha === normalizedPeriod);
  if (index < 1) return false;

  analytics.selectedIndex = index;
  analytics.latest = analytics.totalSeries[index];
  analytics.previous = analytics.totalSeries[index - 1];
  analytics.alerts = deriveAnalyticalAlerts(analytics.processes, normalizedPeriod);
  return true;
}

export function findProcessRecord(process, period) {
  const normalizedPeriod = normalizePeriod(period);
  return process?.serie?.find(record => record.fecha === normalizedPeriod) || null;
}

/**
 * Alertas por proceso (la fila total de la planta no cuenta): desempeño energético (intensidad)
 * peor que su rango normal, o por encima del presupuesto. Un desempeño mejor que el rango no es
 * alerta. Misma regla que el pipeline (_alerts en pipeline/export.py).
 */
export function deriveAnalyticalAlerts(processes, period) {
  const alerts = [];
  processes.forEach(process => {
    if (process.es_total) return;
    const record = findProcessRecord(process, period);
    if (!record) return;
    const range = record.rangos?.intensidad || {};
    if (range.estado === 'alto') {
      alerts.push({
        proceso: process.proceso,
        tipo: 'fuera_de_rango',
        metrica: 'intensidad',
        estado: range.estado,
        valor: record.intensidad,
        esperado: range.esperado,
        z: range.z
      });
    }
    if (hasNumericValue(record.desviacion_ppto) && Number(record.desviacion_ppto) > 0) {
      alerts.push({
        proceso: process.proceso,
        tipo: 'sobre_presupuesto',
        metrica: 'intensidad',
        valor: record.intensidad,
        presupuesto: record.intensidad_ppto,
        desviacion: record.desviacion_ppto
      });
    }
  });
  return alerts;
}

function normalizePeriod(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  let match = raw.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.]\d{1,2})?$/);
  if (match) return validPeriod(Number(match[1]), Number(match[2]));
  match = raw.match(/^(\d{1,2})[-\/.](\d{4})$/);
  if (match) return validPeriod(Number(match[2]), Number(match[1]));

  const normalized = normalizeToken(raw);
  const yearMatch = normalized.match(/(?:^|_)(20\d{2})(?:_|$)/);
  if (yearMatch) {
    const monthToken = normalized.split('_').find(token => MONTHS[token]);
    if (monthToken) return validPeriod(Number(yearMatch[1]), MONTHS[monthToken]);
  }
  return '';
}

function normalizeToken(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function validPeriod(year, month) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return '';
  return year + '-' + String(month).padStart(2, '0');
}
