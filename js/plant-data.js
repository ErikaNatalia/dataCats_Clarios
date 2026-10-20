import * as XLSX from 'xlsx';

const RANGE_WINDOW = 24;
const RANGE_MIN_OBSERVATIONS = 12;
const RANGE_Z = 3; // igual que el pipeline (RANGE_Z en pipeline/config.py)
const MAX_FILE_BYTES = 15 * 1024 * 1024;

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

const FIELD_ALIASES = {
  fecha: ['fecha', 'periodo', 'mes', 'corte', 'date', 'month', 'fecha_corte'],
  proceso: ['proceso', 'process', 'area', 'linea', 'centro', 'subproceso'],
  es_total: ['es_total', 'is_total', 'total_planta'],
  consumo: ['consumo', 'consumo_kwh', 'energia', 'energia_kwh', 'kwh', 'consumption', 'energy_kwh'],
  produccion: ['produccion', 'produccion_ecu', 'unidades', 'unidades_producidas', 'ecu', 'production', 'production_units'],
  unidad_produccion: ['unidad_produccion', 'unidad_producto', 'production_unit'],
  intensidad: ['intensidad', 'intensidad_kwh_ecu', 'kwh_ecu', 'consumo_unitario', 'energy_intensity'],
  intensidad_ppto: ['intensidad_ppto', 'presupuesto_intensidad', 'meta_intensidad', 'intensidad_presupuesto', 'kwh_ecu_ppto', 'budget_intensity'],
  presupuesto_kwh: ['presupuesto_kwh', 'meta_kwh', 'budget_kwh', 'consumo_presupuesto'],
  desviacion_ppto: ['desviacion_ppto', 'desviacion_presupuesto', 'budget_variance'],
  costo_unitario: ['costo_unitario', 'tarifa', 'tarifa_kwh', 'cost_per_kwh', 'unit_cost'],
  costo_total: ['costo_total', 'costo_energia', 'energy_cost', 'total_cost'],
  esperado: ['esperado', 'intensidad_esperada', 'expected_intensity'],
  rango_min: ['rango_min', 'limite_inferior', 'lower_limit'],
  rango_max: ['rango_max', 'limite_superior', 'upper_limit'],
  z: ['z', 'z_score', 'zscore'],
  estado: ['estado', 'estado_intensidad', 'status']
};

const ALIAS_LOOKUP = Object.entries(FIELD_ALIASES).reduce((lookup, [field, aliases]) => {
  aliases.forEach(alias => lookup.set(alias, field));
  return lookup;
}, new Map());

export function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

export function numberOrNull(value) {
  if (hasNumericValue(value)) return Number(value);
  if (typeof value !== 'string') return null;

  let normalized = value.trim().replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  if (!normalized) return null;
  const commaCount = (normalized.match(/,/g) || []).length;
  const dotCount = (normalized.match(/\./g) || []).length;

  if (commaCount && dotCount) {
    const decimalSeparator = normalized.lastIndexOf(',') > normalized.lastIndexOf('.') ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? /\./g : /,/g;
    normalized = normalized.replace(thousandsSeparator, '').replace(decimalSeparator, '.');
  } else if (commaCount > 1) {
    normalized = normalized.replace(/,/g, '');
  } else if (dotCount > 1) {
    normalized = normalized.replace(/\./g, '');
  } else if (commaCount === 1) {
    const decimals = normalized.length - normalized.lastIndexOf(',') - 1;
    normalized = decimals === 3 && Math.abs(Number(normalized.replace(',', ''))) >= 1000
      ? normalized.replace(',', '')
      : normalized.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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

export async function readPlantDataFile(file, plantName) {
  if (!(file instanceof File) || !file.name || file.size === 0) {
    throw new Error('Selecciona un archivo de datos válido para la planta.');
  }
  if (file.size > MAX_FILE_BYTES) throw new Error('El archivo supera el límite de 15 MB.');

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['xlsx', 'xls', 'csv', 'json'].includes(extension)) {
    throw new Error('Formato no admitido. Usa Excel (.xlsx o .xls), CSV o JSON.');
  }

  if (extension === 'json') {
    const rawText = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      throw new Error('El JSON no es válido. Revisa su estructura y vuelve a intentarlo.');
    }
    const analytics = normalizeEnergyDataset(parsed);
    return {
      analytics,
      rawText,
      previewText: rawText.split(/\r?\n/).slice(0, 20).join('\n').slice(0, 12000),
      sourcePeriod: buildPeriodLabel(analytics),
      sheets: ['JSON estructurado']
    };
  }

  let workbook;
  try {
    if (extension === 'csv') {
      workbook = XLSX.read(await file.text(), { type: 'string', cellDates: true });
    } else {
      workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    }
  } catch (error) {
    throw new Error('No fue posible leer el archivo. Verifica que no esté dañado o protegido por contraseña.');
  }

  const extracted = extractWorkbookRecords(workbook, plantName);
  const dataset = buildDatasetFromRecords(extracted.records, plantName, extracted.productionUnit);
  const analytics = normalizeEnergyDataset(dataset);
  return {
    analytics,
    rawText: extension === 'csv' ? await file.text() : '',
    previewText: extracted.previewText,
    sourcePeriod: buildPeriodLabel(analytics),
    sheets: extracted.sheets
  };
}

export function createSecurityCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint32Array(8);
  crypto.getRandomValues(values);
  const chars = Array.from(values, value => alphabet[value % alphabet.length]);
  return 'CL-' + chars.slice(0, 4).join('') + '-' + chars.slice(4).join('');
}

function extractWorkbookRecords(workbook, plantName) {
  const records = [];
  const previewLines = [];
  let productionUnit = 'u';

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    if (!matrix.length) return;
    const extracted = matrixToRecords(matrix, sheetName, plantName);
    records.push(...extracted.records);
    if (extracted.productionUnit === 'ECU') productionUnit = 'ECU';
    if (previewLines.length < 18) {
      previewLines.push('[' + sheetName + ']');
      matrix.slice(0, 5).forEach(row => previewLines.push(row.map(value => value ?? '').join(' | ')));
    }
  });

  if (!records.length) {
    throw new Error('No se detectaron filas mensuales. El archivo debe incluir fecha o período, consumo y producción o desempeño energético.');
  }
  return {
    records,
    productionUnit,
    previewText: previewLines.slice(0, 24).join('\n'),
    sheets: [...workbook.SheetNames]
  };
}

function matrixToRecords(matrix, sheetName, plantName) {
  let headerIndex = -1;
  let fieldMap = [];
  let bestScore = 0;

  matrix.slice(0, 20).forEach((row, rowIndex) => {
    const mapped = row.map(cell => ALIAS_LOOKUP.get(normalizeToken(cell)) || '');
    const fields = new Set(mapped.filter(Boolean));
    let score = fields.size;
    if (fields.has('fecha')) score += 3;
    if (fields.has('consumo')) score += 2;
    if (fields.has('produccion') || fields.has('intensidad')) score += 2;
    if (score > bestScore) {
      bestScore = score;
      headerIndex = rowIndex;
      fieldMap = mapped;
    }
  });

  if (headerIndex < 0 || bestScore < 7 || !fieldMap.includes('fecha') || !fieldMap.includes('consumo')) {
    return { records: [], productionUnit: 'u' };
  }

  const rawHeaders = matrix[headerIndex].map(normalizeToken);
  const productionUnit = rawHeaders.some(header => header.includes('ecu')) ? 'ECU' : 'u';
  const records = [];

  matrix.slice(headerIndex + 1).forEach(row => {
    const source = {};
    fieldMap.forEach((field, columnIndex) => {
      if (field && source[field] === undefined) source[field] = row[columnIndex];
    });
    const fecha = normalizePeriod(source.fecha);
    if (!fecha) return;

    let consumo = numberOrNull(source.consumo);
    let produccion = numberOrNull(source.produccion);
    let intensidad = numberOrNull(source.intensidad);
    if (!hasNumericValue(intensidad) && hasNumericValue(consumo) && hasNumericValue(produccion) && produccion !== 0) {
      intensidad = consumo / produccion;
    }
    if (!hasNumericValue(consumo) && hasNumericValue(intensidad) && hasNumericValue(produccion)) {
      consumo = intensidad * produccion;
    }
    if (!hasNumericValue(produccion) && hasNumericValue(consumo) && hasNumericValue(intensidad) && intensidad !== 0) {
      produccion = consumo / intensidad;
    }
    if (!hasNumericValue(consumo) || !hasNumericValue(intensidad)) return;

    const processName = String(source.proceso || sheetName || plantName).trim();
    records.push({
      fecha,
      proceso: processName,
      es_total: parseBoolean(source.es_total),
      consumo,
      produccion,
      intensidad,
      intensidad_ppto: numberOrNull(source.intensidad_ppto),
      presupuesto_kwh: numberOrNull(source.presupuesto_kwh),
      desviacion_ppto: numberOrNull(source.desviacion_ppto),
      costo_unitario: numberOrNull(source.costo_unitario),
      costo_total: numberOrNull(source.costo_total),
      esperado: numberOrNull(source.esperado),
      rango_min: numberOrNull(source.rango_min),
      rango_max: numberOrNull(source.rango_max),
      z: numberOrNull(source.z),
      estado: source.estado ? String(source.estado).trim().toLowerCase() : '',
      unidad_produccion: source.unidad_produccion || ''
    });
  });

  return { records, productionUnit };
}

function buildDatasetFromRecords(records, plantName, detectedProductionUnit) {
  const groups = new Map();
  records.forEach(record => {
    const key = record.proceso || plantName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  let processes = [...groups.entries()].map(([name, rows]) => ({
    proceso: name,
    es_total: rows.some(row => row.es_total) || isTotalProcessName(name, plantName),
    estacionalidad: {},
    serie: buildMonthlySeries(rows)
  })).filter(process => process.serie.length);

  let totalProcess = processes.find(process => process.es_total);
  if (!totalProcess && processes.length === 1) {
    processes[0].es_total = true;
    totalProcess = processes[0];
  }
  if (!totalProcess) {
    totalProcess = {
      proceso: plantName,
      es_total: true,
      estacionalidad: {},
      serie: buildSyntheticTotalSeries(processes)
    };
    processes.unshift(totalProcess);
  }

  if (totalProcess.serie.length < 2) {
    throw new Error('El archivo necesita por lo menos dos meses para comparar el corte actual con el anterior.');
  }

  const inferredUnit = records.find(record => String(record.unidad_produccion || '').trim())?.unidad_produccion;
  const productionUnit = String(inferredUnit || detectedProductionUnit || 'u').trim();
  const start = totalProcess.serie[0].fecha;
  const end = totalProcess.serie.at(-1).fecha;
  const dataset = {
    id: slugify(plantName),
    planta: plantName,
    servicio: 'energia',
    unidad: 'kWh',
    unidad_intensidad: 'kWh/' + productionUnit,
    generado: new Date().toISOString(),
    periodo: { inicio: start, fin: end, meses: totalProcess.serie.length },
    parametros: {
      periodos_excluidos: [],
      rango_ventana_meses: RANGE_WINDOW,
      rango_min_obs: RANGE_MIN_OBSERVATIONS,
      rango_z: RANGE_Z
    },
    calidad: {
      correcciones: [],
      observaciones: ['Datos detectados automáticamente desde el archivo cargado.']
    },
    procesos: processes
  };
  dataset.alertas_ultimo_mes = {
    fecha: end,
    alertas: deriveAnalyticalAlerts(processes, end)
  };
  return dataset;
}

function buildMonthlySeries(rows) {
  const byPeriod = new Map();
  rows.forEach(row => {
    if (!byPeriod.has(row.fecha)) byPeriod.set(row.fecha, []);
    byPeriod.get(row.fecha).push(row);
  });

  const series = [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, periodRows], index) => aggregatePeriodRows(fecha, periodRows, index));
  return enrichRanges(series);
}

function aggregatePeriodRows(fecha, rows, index) {
  const sum = field => {
    const values = rows.map(row => row[field]).filter(hasNumericValue).map(Number);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  };
  const first = field => rows.map(row => row[field]).find(hasNumericValue) ?? null;
  const consumo = sum('consumo');
  const produccion = sum('produccion');
  const costoTotal = sum('costo_total');
  const presupuestoKwhDirecto = sum('presupuesto_kwh');
  const intensidad = hasNumericValue(consumo) && hasNumericValue(produccion) && produccion !== 0
    ? consumo / produccion
    : first('intensidad');
  const budgetParts = rows.filter(row => hasNumericValue(row.intensidad_ppto) && hasNumericValue(row.produccion));
  const presupuestoKwh = hasNumericValue(presupuestoKwhDirecto)
    ? presupuestoKwhDirecto
    : (budgetParts.length ? budgetParts.reduce((total, row) => total + Number(row.intensidad_ppto) * Number(row.produccion), 0) : null);
  const intensidadPpto = hasNumericValue(presupuestoKwh) && hasNumericValue(produccion) && produccion !== 0
    ? presupuestoKwh / produccion
    : first('intensidad_ppto');
  const costoUnitario = hasNumericValue(costoTotal) && hasNumericValue(consumo) && consumo !== 0
    ? costoTotal / consumo
    : first('costo_unitario');
  const resolvedCostTotal = hasNumericValue(costoTotal)
    ? costoTotal
    : (hasNumericValue(costoUnitario) && hasNumericValue(consumo) ? costoUnitario * consumo : null);
  const deviation = hasNumericValue(intensidadPpto) && Number(intensidadPpto) !== 0
    ? (Number(intensidad) - Number(intensidadPpto)) / Number(intensidadPpto)
    : first('desviacion_ppto');

  return {
    fecha,
    indice: index + 1,
    consumo,
    produccion,
    intensidad,
    intensidad_ppto: intensidadPpto,
    desviacion_ppto: deviation,
    costo_unitario: costoUnitario,
    costo_total: resolvedCostTotal,
    rangos: {
      intensidad: hasNumericValue(first('esperado')) && hasNumericValue(first('rango_min')) && hasNumericValue(first('rango_max'))
        ? {
            esperado: first('esperado'),
            rango_min: first('rango_min'),
            rango_max: first('rango_max'),
            z: first('z'),
            estado: rows.find(row => row.estado)?.estado || 'normal'
          }
        : null
    }
  };
}

function buildSyntheticTotalSeries(processes) {
  const allRows = [];
  processes.forEach(process => {
    process.serie.forEach(record => allRows.push({
      ...record,
      presupuesto_kwh: hasNumericValue(record.intensidad_ppto) && hasNumericValue(record.produccion)
        ? Number(record.intensidad_ppto) * Number(record.produccion)
        : null
    }));
  });
  return buildMonthlySeries(allRows);
}

function enrichRanges(series) {
  return series.map((record, index) => {
    const intensityRange = record.rangos?.intensidad || buildRange(series, index, 'intensidad');
    return {
      ...record,
      rangos: {
        consumo: buildRange(series, index, 'consumo'),
        produccion: buildRange(series, index, 'produccion'),
        intensidad: intensityRange
      }
    };
  });
}

function buildRange(series, index, field) {
  const history = series
    .slice(Math.max(0, index - RANGE_WINDOW), index)
    .map(record => record[field])
    .filter(hasNumericValue)
    .map(Number);
  const current = numberOrNull(series[index]?.[field]);
  if (!hasNumericValue(current) || history.length < 2) {
    return { esperado: current, rango_min: null, rango_max: null, z: null, estado: 'sin_historia' };
  }

  const expected = history.reduce((sum, value) => sum + value, 0) / history.length;
  const variance = history.reduce((sum, value) => sum + Math.pow(value - expected, 2), 0) / Math.max(1, history.length - 1);
  const deviation = Math.sqrt(variance);
  const lower = expected - RANGE_Z * deviation;
  const upper = expected + RANGE_Z * deviation;
  const z = deviation > 0 ? (current - expected) / deviation : 0;
  const enoughHistory = history.length >= RANGE_MIN_OBSERVATIONS;
  const state = !enoughHistory ? 'sin_historia' : (current > upper ? 'alto' : (current < lower ? 'bajo' : 'normal'));
  return {
    esperado: round(expected, 4),
    rango_min: round(lower, 4),
    rango_max: round(upper, 4),
    z: round(z, 4),
    estado: state
  };
}

function normalizePeriod(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0');
  }
  if (typeof value === 'number' && value > 20000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m) return parsed.y + '-' + String(parsed.m).padStart(2, '0');
  }

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

function parseBoolean(value) {
  if (value === true || value === 1) return true;
  return ['true', 'si', 'sí', 'yes', '1', 'total'].includes(String(value ?? '').trim().toLowerCase());
}

function isTotalProcessName(name, plantName) {
  const normalized = normalizeToken(name);
  const normalizedPlant = normalizeToken(plantName);
  return normalized === normalizedPlant || normalized === 'total' || normalized.includes('total_planta');
}

function slugify(value) {
  return normalizeToken(value) || 'nueva_planta';
}

function round(value, digits) {
  if (!hasNumericValue(value)) return null;
  const factor = Math.pow(10, digits);
  return Math.round(Number(value) * factor) / factor;
}

function buildPeriodLabel(analytics) {
  return analytics.period.inicio + ' – ' + analytics.period.fin;
}
