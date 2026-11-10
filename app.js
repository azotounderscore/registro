/* ============================================================
   Registro voti — app.js
   Nessuna dipendenza esterna. Dati solo in localStorage.
   ============================================================ */
'use strict';

(function () {
  /* ---------- Costanti ---------- */

  const SCHEMA_VERSION = 1;
  const STORAGE_VERSION = '1';
  const KEYS = {
    settings: 'gradeTracker.settings',
    subjects: 'gradeTracker.subjects',
    grades: 'gradeTracker.grades',
    version: 'gradeTracker.version',
    // Chiave ausiliaria: serve solo a non riproporre l'onboarding.
    // Anche questa inizia con gradeTracker. e viene cancellata dal reset.
    onboarding: 'gradeTracker.onboardingSeen'
  };

  const TYPE_LABELS = {
    orale: 'Orale',
    scritto: 'Scritto',
    pratico: 'Pratico',
    test: 'Test',
    altro: 'Altro'
  };

  const TYPE_OPTIONS = [
    { value: '', label: 'Nessun tipo' },
    { value: 'orale', label: 'Orale' },
    { value: 'scritto', label: 'Scritto' },
    { value: 'pratico', label: 'Pratico' },
    { value: 'test', label: 'Test' },
    { value: 'altro', label: 'Altro' }
  ];

  const SUBJECT_COLORS = [
    '#0B5ED7', '#0E8E84', '#7A4BC2', '#D2548A', '#C2410C',
    '#15803D', '#B7791F', '#0369A1', '#475569', '#B91C1C'
  ];

  const SUGGESTED_SUBJECTS = [
    'Italiano', 'Latino', 'Greco', 'Matematica', 'Inglese', 'Storia',
    'Filosofia', 'Scienze', 'Fisica', 'Arte', 'Scienze motorie', 'Religione'
  ];

  const PERIOD_LABELS = {
    tutti: 'Tutto',
    anno: 'Anno intero',
    trimestre1: 'Trimestre 1',
    trimestre2: 'Trimestre 2',
    pentamestre: 'Pentamestre',
    custom: 'Personalizzato'
  };

  /* ---------- Riferimenti DOM ---------- */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const els = {
    shell: $('#appShell'),
    header: $('#appHeader'),
    headerAverage: $('#headerAverage'),
    headerGoal: $('#headerGoal'),
    headerVoteCount: $('#headerVoteCount'),
    headerSubjectCount: $('#headerSubjectCount'),
    brandTitle: $('#brandTitle'),
    brandSubtitle: $('#brandSubtitle'),
    main: $('#mainScroll'),
    stage: $('#viewStage'),
    bottomNav: $('#bottomNav'),
    navPill: $('#navPill'),
    headerContext: $('#headerContext'),
    settingsButton: $('#settingsButton'),
    fab: $('#fab'),
    fabMenu: $('#fabMenu'),
    sheetOverlay: $('#sheetOverlay'),
    sheet: $('#bottomSheet'),
    sheetTitle: $('#sheetTitle'),
    sheetEyebrow: $('#sheetEyebrow'),
    sheetBody: $('#sheetBody'),
    sheetFooter: $('#sheetFooter'),
    dragZone: $('#sheetDragZone'),
    toastRegion: $('#toastRegion'),
    successOverlay: $('#successOverlay'),
    confirmDialog: $('#confirmDialog'),
    confirmTitle: $('#confirmTitle'),
    confirmMessage: $('#confirmMessage'),
    confirmIcon: $('#confirmIcon'),
    confirmOk: $('#confirmOk'),
    confirmCancel: $('#confirmCancel'),
    onboarding: $('#onboarding'),
    onboardingContent: $('#onboardingContent'),
    onboardingActions: $('#onboardingActions'),
    onboardingDots: $('#onboardingDots'),
    onboardingSkip: $('#onboardingSkip'),
    importInput: $('#importInput'),
    liveRegion: $('#liveRegion')
  };

  /* ---------- Stato applicativo ---------- */

  function defaultSettings() {
    return {
      sogliaSufficienza: 6,
      obiettivoGenerale: null,
      arrotondamentoVisuale: 'dueDecimali',
      schemaVersion: SCHEMA_VERSION
    };
  }

  const state = {
    settings: defaultSettings(),
    subjects: [],
    grades: [],
    tab: 'home',
    previousTab: 'home',
    settingsOpen: false,
    storageAvailable: true,
    storageIssue: null,
    writeBlocked: false,
    onboardingSeen: false,
    onboardingOpen: false,
    onboardStep: 0,
    onboardSubjects: [],
    onboardCustom: [],
    gradesFilters: {
      search: '', subject: '', period: 'tutti', from: '', to: '', type: '', min: '', max: ''
    },
    gradesFiltersOpen: false,
    importError: null,
    settingsRoundingDraft: null,
    onboardSelected: [],
    onboardFocus: null,
    groupBy: 'date',
    analysisFilters: { subject: '', period: 'anno', from: '', to: '' },
    lineMode: 'single',
    simMode: 'whatif',
    simScope: 'all',
    simTarget: '',
    simCount: '1',
    simWeight: '100',
    scenarios: [],
    newGradeId: null,
    fabPulseStopped: false,
    fabMenuOpen: false,
    homeAnimated: false,
    sheet: {
      open: false,
      mode: null,
      gradeId: null,
      pickerInt: null,
      pickerMod: '',
      subjectId: '',
      returnFocus: null,
      onSaved: null
    },
    chartObservers: [],
    toastTimer: null,
    dialogResolver: null
  };

  /* ---------- Utility ---------- */

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return (prefix || 'id') + '_' + window.crypto.randomUUID();
    }
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  const nf2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf1 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });

  function fmt2(value) {
    return Number.isFinite(value) ? nf2.format(value) : '—';
  }

  function fmtSmart(value) {
    if (!Number.isFinite(value)) return '—';
    return Math.abs(value - Math.round(value)) < 0.001 ? nf0.format(value) : nf2.format(value);
  }

  // Arrotondamento puramente visuale delle medie: i calcoli usano sempre
  // il valore pieno, qui si prepara solo il numero da mostrare.
  function roundForDisplay(value) {
    if (!Number.isFinite(value)) return value;
    const mode = state.settings.arrotondamentoVisuale;
    if (mode === 'quarti') return Math.round(value * 4) / 4;
    if (mode === 'mezzi') return Math.round(value * 2) / 2;
    return value;
  }

  function fmtAverage(value) {
    if (!Number.isFinite(value)) return '—';
    return nf2.format(roundForDisplay(value));
  }

  function fmtDelta(value) {
    if (!Number.isFinite(value)) return '';
    if (Math.abs(value) < 0.005) return '0,00';
    return (value > 0 ? '+' : '−') + nf2.format(Math.abs(value));
  }

  function fmtWeight(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return Math.abs(num - Math.round(num)) < 0.001 ? nf0.format(num) : nf1.format(num);
  }

  function fmtPercent(value) {
    return Number.isFinite(value) ? nf0.format(value) + '%' : '—';
  }

  // Converte "7,75" o "7.75" in numero. Accetta solo valori positivi semplici.
  function parseDecimalInput(raw) {
    if (typeof raw === 'number') return raw;
    const text = String(raw == null ? '' : raw).trim().replace(/\s+/g, '');
    if (!text) return NaN;
    if (!/^\d+(?:[.,]\d+)?$/.test(text)) return NaN;
    return parseFloat(text.replace(',', '.'));
  }

  function todayISO() {
    return localISO(new Date());
  }

  function localISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function parseISODate(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const parts = iso.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) return null;
    return date;
  }

  const dateLongFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const dateMediumFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  const dateShortFmt = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit' });

  function formatDateLong(iso) {
    const d = parseISODate(iso);
    return d ? dateLongFmt.format(d) : iso;
  }

  function formatDateMedium(iso) {
    const d = parseISODate(iso);
    return d ? dateMediumFmt.format(d).replace(/\./g, '') : iso;
  }

  function formatDateShort(iso) {
    const d = parseISODate(iso);
    return d ? dateShortFmt.format(d) : iso;
  }

  function dateGroupLabel(iso) {
    const d = parseISODate(iso);
    if (!d) return iso;
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diff = Math.round((todayStart - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (diff === 0) return 'Oggi · ' + dateMediumFmt.format(d).replace(/\./g, '');
    if (diff === 1) return 'Ieri · ' + dateMediumFmt.format(d).replace(/\./g, '');
    if (diff === -1) return 'Domani · ' + dateMediumFmt.format(d).replace(/\./g, '');
    return dateLongFmt.format(d);
  }

  // L'anno scolastico va da settembre a giugno. Nei mesi estivi si usa
  // l'anno appena concluso, così i preset restano coerenti.
  function schoolYearBounds(reference) {
    const now = reference || new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const startYear = m >= 8 ? y : y - 1;
    return {
      start: new Date(startYear, 8, 1),
      end: new Date(startYear + 1, 5, 30)
    };
  }

  function periodRange(period, from, to) {
    if (period === 'tutti') return null;
    if (period === 'custom') {
      const start = from ? parseISODate(from) : null;
      const end = to ? parseISODate(to) : null;
      if (!start && !end) return null;
      return { start: start, end: end };
    }
    const y = schoolYearBounds();
    if (period === 'anno') return { start: y.start, end: y.end };
    if (period === 'trimestre1') return { start: y.start, end: new Date(y.start.getFullYear(), 11, 31) };
    if (period === 'trimestre2') return { start: new Date(y.start.getFullYear() + 1, 0, 1), end: new Date(y.start.getFullYear() + 1, 2, 31) };
    if (period === 'pentamestre') return { start: new Date(y.start.getFullYear() + 1, 0, 1), end: y.end };
    return null;
  }

  function periodLabel(period, from, to) {
    if (period === 'custom') {
      if (from && to) return 'Dal ' + formatDateShort(from) + ' al ' + formatDateShort(to);
      if (from) return 'Dal ' + formatDateShort(from);
      if (to) return 'Fino al ' + formatDateShort(to);
      return 'Date personalizzate';
    }
    return PERIOD_LABELS[period] || period;
  }

  function isInPeriod(iso, period, from, to) {
    const range = periodRange(period, from, to);
    if (!range) return true;
    const d = parseISODate(iso);
    if (!d) return false;
    const time = d.getTime();
    if (range.start && time < range.start.getTime()) return false;
    if (range.end && time > range.end.getTime()) return false;
    return true;
  }

  function formatDuration(ms) {
    return Math.max(0, ms).toFixed(0) + ' ms';
  }

  /* ---------- Sistema di voti ---------- */

  function computePickerValue(intValue, mod) {
    if (intValue == null) return null;
    const base = Number(intValue);
    if (mod === '-') return base - 0.25;
    if (mod === '+') return base + 0.25;
    if (mod === 'half') return base + 0.5;
    return base;
  }

  function pickerLabel(intValue, mod) {
    if (intValue == null) return '—';
    if (mod === '-') return intValue + '-';
    if (mod === '+') return intValue + '+';
    if (mod === 'half') return intValue + '½';
    return String(intValue);
  }

  function valueToLabel(value) {
    if (!Number.isFinite(value)) return '—';
    const whole = Math.floor(value + 1e-9);
    const quarter = Math.round((value - whole) * 4);
    if (quarter === 0) return String(whole);
    if (quarter === 1) return whole === 10 ? '10+' : whole + '+';
    if (quarter === 2) return whole + '½';
    return (whole + 1) + '-';
  }

  function pickerFromValue(value) {
    const safe = Number(value);
    if (!Number.isFinite(safe)) return { int: null, mod: '' };
    const whole = Math.floor(safe + 1e-9);
    const quarter = Math.round((safe - whole) * 4);
    if (quarter === 0) return { int: whole, mod: '' };
    if (quarter === 1) return { int: whole, mod: '+' };
    if (quarter === 2) return { int: whole, mod: 'half' };
    return { int: whole + 1, mod: '-' };
  }

  function isAllowedGradeValue(value) {
    if (!Number.isFinite(value)) return false;
    if (value < 0 || value > 10.25 + 1e-9) return false;
    const quarter = Math.round(value * 4);
    return Math.abs(quarter / 4 - value) < 1e-9;
  }

  function modifierDisabled(intValue, mod) {
    if (intValue == null) return true;
    if (mod === '-') return intValue === 0;
    if (mod === 'half') return intValue === 10;
    return false;
  }

  function allGradeValues() {
    const values = [];
    for (let i = 0; i <= 10; i += 1) {
      values.push(i);
      if (i < 10) {
        values.push(i + 0.25);
        values.push(i + 0.5);
        values.push(i + 0.75);
      } else {
        values.push(9.75);
        values.push(10.25);
      }
    }
    return Array.from(new Set(values.map((v) => Math.round(v * 4) / 4))).sort((a, b) => a - b);
  }

  const GRADE_VALUES = allGradeValues();

  function gradeOptionLabel(value) {
    return valueToLabel(value);
  }

  /* ---------- Calcoli ---------- */

  function getSubject(subjectId) {
    return state.subjects.find((s) => s.id === subjectId) || null;
  }

  function sortedGradesByChronology(grades) {
    return grades.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });
  }

  function sortedGradesNewest(grades) {
    return grades.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  function meanOf(grades) {
    let totalWeight = 0;
    let total = 0;
    grades.forEach((g) => {
      const w = Number(g.weight) > 0 ? Number(g.weight) : 0;
      totalWeight += w;
      total += Number(g.value) * w;
    });
    return totalWeight > 0 ? total / totalWeight : null;
  }

  function sumAndWeight(grades) {
    let sum = 0;
    let weight = 0;
    grades.forEach((g) => {
      const w = Number(g.weight) > 0 ? Number(g.weight) : 0;
      weight += w;
      sum += Number(g.value) * w;
    });
    return { sum, weight };
  }

  function computeStats(grades) {
    const n = grades.length;
    if (!n) {
      return { n: 0, mean: null, median: null, mode: null, min: null, max: null, std: null, sufficiency: null };
    }
    const values = grades.map((g) => Number(g.value)).filter((v) => Number.isFinite(v));
    if (!values.length) {
      return { n: 0, mean: null, median: null, mode: null, min: null, max: null, std: null, sufficiency: null };
    }
    const mean = meanOf(grades);
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const freq = new Map();
    values.forEach((v) => {
      const key = Math.round(v * 4) / 4;
      freq.set(key, (freq.get(key) || 0) + 1);
    });
    let mode = null;
    let best = -1;
    Array.from(freq.keys()).sort((a, b) => a - b).forEach((key) => {
      const count = freq.get(key);
      if (count > best) { best = count; mode = key; }
    });
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    // Deviazione standard di popolazione: descrive l'intero set di voti.
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    const sufficient = values.filter((v) => v >= Number(state.settings.sogliaSufficienza)).length;
    return {
      n: values.length,
      mean: mean,
      median: median,
      mode: mode,
      min: min,
      max: max,
      std: std,
      sufficiency: (sufficient / values.length) * 100
    };
  }

  // Regressione lineare semplice sulle medie progressive (ponderate).
  function computeTrend(grades) {
    const sorted = sortedGradesByChronology(grades);
    if (sorted.length < 2) return { key: 'flat', label: 'Dati insufficienti', slope: 0, points: [] };
    const first = parseISODate(sorted[0].date);
    if (!first) return { key: 'flat', label: 'Dati insufficienti', slope: 0, points: [] };
    let sum = 0;
    let weight = 0;
    const points = [];
    sorted.forEach((grade) => {
      const w = Number(grade.weight) > 0 ? Number(grade.weight) : 0;
      weight += w;
      sum += Number(grade.value) * w;
      const date = parseISODate(grade.date) || first;
      points.push({
        x: (date.getTime() - first.getTime()) / 86400000,
        y: weight > 0 ? sum / weight : null
      });
    });
    const valid = points.filter((p) => Number.isFinite(p.y));
    if (valid.length < 2) return { key: 'flat', label: 'Dati insufficienti', slope: 0, points: points };
    const n = valid.length;
    const meanX = valid.reduce((a, p) => a + p.x, 0) / n;
    const meanY = valid.reduce((a, p) => a + p.y, 0) / n;
    let num = 0;
    let den = 0;
    valid.forEach((p) => {
      num += (p.x - meanX) * (p.y - meanY);
      den += Math.pow(p.x - meanX, 2);
    });
    const slope = den > 0 ? num / den : 0;
    const span = valid[valid.length - 1].x - valid[0].x;
    const totalShift = slope * span;
    if (totalShift > 0.12) return { key: 'up', label: 'In miglioramento', slope, points };
    if (totalShift < -0.12) return { key: 'down', label: 'In calo', slope, points };
    return { key: 'flat', label: 'Stabile', slope, points };
  }

  function trendLabelHTML(trend) {
    if (!trend || !trend.label) {
      return '<span class="trend-pill flat">' + icon('minus', 11) + ' Stabile</span>';
    }
    if (trend.label === 'Dati insufficienti') {
      return '<span class="trend-pill flat">' + icon('minus', 11) + ' Dati insufficienti</span>';
    }
    if (trend.key === 'flat') {
      return '<span class="trend-pill flat">' + icon('minus', 11) + ' Stabile</span>';
    }
    if (trend.key === 'up') return '<span class="trend-pill up">' + icon('arrowUp', 11) + ' In miglioramento</span>';
    return '<span class="trend-pill down">' + icon('arrowDown', 11) + ' In calo</span>';
  }

  function trendInline(trend) {
    if (!trend || trend.label === 'Dati insufficienti') return '<span class="compare-trend flat">' + icon('minus', 10) + ' dati insufficienti</span>';
    if (trend.key === 'flat') return '<span class="compare-trend flat">' + icon('minus', 10) + ' stabile</span>';
    if (trend.key === 'up') return '<span class="compare-trend up">' + icon('arrowUp', 10) + ' in crescita</span>';
    return '<span class="compare-trend down">' + icon('arrowDown', 10) + ' in calo</span>';
  }

  function activeGrades() {
    const ids = new Set(state.subjects.map((s) => s.id));
    return state.grades.filter((g) => ids.has(g.subjectId));
  }

  function gradesForSubject(subjectId, grades) {
    return (grades || activeGrades()).filter((g) => g.subjectId === subjectId);
  }

  function applyGradeFilters(grades, filters) {
    const search = (filters.search || '').trim().toLowerCase();
    const min = filters.min === '' ? null : Number(filters.min);
    const max = filters.max === '' ? null : Number(filters.max);
    return grades.filter((g) => {
      if (filters.subject && g.subjectId !== filters.subject) return false;
      if (filters.type && g.type !== filters.type) return false;
      if (!isInPeriod(g.date, filters.period, filters.from, filters.to)) return false;
      if (Number.isFinite(min) && Number(g.value) < min) return false;
      if (Number.isFinite(max) && Number(g.value) > max) return false;
      if (search) {
        const haystack = [g.description || '', (g.tags || []).join(' ')].join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  function countActiveFilters(filters) {
    let count = 0;
    if (filters.subject) count += 1;
    if (filters.period && filters.period !== 'tutti') count += 1;
    if (filters.type) count += 1;
    if (filters.min !== '') count += 1;
    if (filters.max !== '') count += 1;
    return count;
  }

  /* ---------- Storage ---------- */

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  function safeRemove(key) {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (err) {
      return false;
    }
  }

  function normalizeVersion(raw) {
    if (raw == null) return null;
    const text = String(raw).trim().replace(/^"|"$/g, '');
    return text;
  }

  function isHexColor(value) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  }

  function validateSettings(raw) {
    if (!isPlainObject(raw)) return null;
    const threshold = Number(raw.sogliaSufficienza);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 10.25) return null;
    const goal = raw.obiettivoGenerale == null ? null : Number(raw.obiettivoGenerale);
    if (goal != null && (!Number.isFinite(goal) || goal < 0 || goal > 10.25)) return null;
    const rounding = ['dueDecimali', 'quarti', 'mezzi'].includes(raw.arrotondamentoVisuale) ? raw.arrotondamentoVisuale : 'dueDecimali';
    return {
      sogliaSufficienza: threshold,
      obiettivoGenerale: goal,
      arrotondamentoVisuale: rounding,
      schemaVersion: SCHEMA_VERSION
    };
  }

  function validateSubject(raw) {
    if (!isPlainObject(raw)) return null;
    if (typeof raw.id !== 'string' || !raw.id) return null;
    if (typeof raw.nome !== 'string' || !raw.nome.trim()) return null;
    const goal = raw.obiettivo == null ? null : Number(raw.obiettivo);
    if (goal != null && (!Number.isFinite(goal) || goal < 0 || goal > 10.25)) return null;
    return {
      id: raw.id,
      nome: raw.nome.trim().slice(0, 60),
      colore: isHexColor(raw.colore) ? raw.colore : SUBJECT_COLORS[0],
      obiettivo: goal,
      note: typeof raw.note === 'string' ? raw.note.slice(0, 400) : ''
    };
  }

  function validateGrade(raw, subjectIds) {
    if (!isPlainObject(raw)) return null;
    if (typeof raw.id !== 'string' || !raw.id) return null;
    if (typeof raw.subjectId !== 'string' || !subjectIds.has(raw.subjectId)) return null;
    const value = Number(raw.value);
    if (!isAllowedGradeValue(value)) return null;
    if (typeof raw.label !== 'string' || !raw.label.trim() || raw.label.length > 12) return null;
    if (!parseISODate(raw.date)) return null;
    const type = raw.type == null || raw.type === '' ? null : raw.type;
    if (type != null && !Object.prototype.hasOwnProperty.call(TYPE_LABELS, type)) return null;
    const weight = raw.weight == null ? 100 : Number(raw.weight);
    if (!Number.isFinite(weight) || weight <= 0) return null;
    const tags = Array.isArray(raw.tags)
      ? raw.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 30)).slice(0, 20)
      : [];
    return {
      id: raw.id,
      subjectId: raw.subjectId,
      value: Math.round(value * 4) / 4,
      label: raw.label.trim(),
      date: raw.date,
      type: type,
      weight: weight,
      description: typeof raw.description === 'string' ? raw.description.slice(0, 400) : '',
      tags: tags,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString()
    };
  }

  function parseStoredJSON(key) {
    const raw = safeGet(key);
    if (raw == null) return { missing: true, value: null, error: null };
    try {
      return { missing: false, value: JSON.parse(raw), error: null };
    } catch (err) {
      return { missing: false, value: null, error: 'JSON non valido in ' + key };
    }
  }

  function bootStorage() {
    let available = true;
    try {
      const probe = 'gradeTracker.__probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
    } catch (err) {
      available = false;
    }
    state.storageAvailable = available;
    if (!available) {
      state.storageIssue = {
        type: 'unavailable',
        message: 'Questo browser non permette di salvare dati locali (forse navigazione privata). L\'app funziona, ma i voti non verranno conservati.'
      };
      return;
    }

    const versionRaw = safeGet(KEYS.version);
    const settingsRaw = safeGet(KEYS.settings);
    const subjectsRaw = safeGet(KEYS.subjects);
    const gradesRaw = safeGet(KEYS.grades);
    const hasAnyData = versionRaw != null || settingsRaw != null || subjectsRaw != null || gradesRaw != null;

    if (!hasAnyData) {
      // Primo avvio: si crea solo la struttura vuota.
      state.settings = defaultSettings();
      state.subjects = [];
      state.grades = [];
      writeSnapshot();
      return;
    }

    if (versionRaw == null || normalizeVersion(versionRaw) !== STORAGE_VERSION) {
      state.writeBlocked = true;
      state.storageIssue = {
        type: 'schema',
        message: 'La versione dello schema dati non è supportata' + (versionRaw == null ? ' (versione mancante).' : ' (versione ' + escapeHTML(normalizeVersion(versionRaw)) + ').') + ' L\'app non sovrascriverà i tuoi dati: puoi importare un backup compatibile o reimpostarli dalle impostazioni.'
      };
      return;
    }

    const settingsParsed = parseStoredJSON(KEYS.settings);
    const subjectsParsed = parseStoredJSON(KEYS.subjects);
    const gradesParsed = parseStoredJSON(KEYS.grades);

    if (settingsParsed.error || subjectsParsed.error || gradesParsed.error) {
      state.writeBlocked = true;
      state.storageIssue = {
        type: 'corrupt',
        message: 'Alcuni dati salvati non sono leggibili. L\'app non li ha modificati. Puoi importare un backup o reimpostare i dati dalle impostazioni.'
      };
      return;
    }

    if (!Array.isArray(subjectsParsed.value) || !Array.isArray(gradesParsed.value) || !isPlainObject(settingsParsed.value)) {
      state.writeBlocked = true;
      state.storageIssue = {
        type: 'corrupt',
        message: 'I dati salvati hanno un formato inatteso. L\'app non li ha modificati. Importa un backup o reimposta i dati dalle impostazioni.'
      };
      return;
    }

    const settings = validateSettings(settingsParsed.value);
    if (!settings) {
      state.writeBlocked = true;
      state.storageIssue = {
        type: 'corrupt',
        message: 'Le impostazioni salvate non sono valide. Importa un backup o reimposta i dati dalle impostazioni.'
      };
      return;
    }

    const subjects = [];
    for (const item of subjectsParsed.value) {
      const subject = validateSubject(item);
      if (!subject) {
        state.writeBlocked = true;
        state.storageIssue = {
          type: 'corrupt',
          message: 'Una materia salvata non è valida. Importa un backup o reimposta i dati dalle impostazioni.'
        };
        return;
      }
      subjects.push(subject);
    }
    const subjectIds = new Set(subjects.map((s) => s.id));
    const grades = [];
    for (const item of gradesParsed.value) {
      const grade = validateGrade(item, subjectIds);
      if (!grade) {
        state.writeBlocked = true;
        state.storageIssue = {
          type: 'corrupt',
          message: 'Un voto salvato non è valido. Importa un backup o reimposta i dati dalle impostazioni.'
        };
        return;
      }
      grades.push(grade);
    }

    state.settings = settings;
    state.subjects = subjects;
    state.grades = grades;
  }

  function snapshotStorage() {
    return {
      settings: safeGet(KEYS.settings),
      subjects: safeGet(KEYS.subjects),
      grades: safeGet(KEYS.grades),
      version: safeGet(KEYS.version)
    };
  }

  function restoreSnapshot(snapshot) {
    Object.keys(snapshot).forEach((name) => {
      const raw = snapshot[name];
      if (raw == null) safeRemove(KEYS[name]);
      else safeSet(KEYS[name], raw);
    });
  }

  // Scrittura "transazionale": se una delle chiavi fallisce, prova a
  // ripristinare esattamente i valori precedenti.
  function writeSnapshot() {
    if (!state.storageAvailable) return false;
    const snapshot = snapshotStorage();
    try {
      window.localStorage.setItem(KEYS.settings, JSON.stringify(state.settings));
      window.localStorage.setItem(KEYS.subjects, JSON.stringify(state.subjects));
      window.localStorage.setItem(KEYS.grades, JSON.stringify(state.grades));
      window.localStorage.setItem(KEYS.version, STORAGE_VERSION);
      return true;
    } catch (err) {
      restoreSnapshot(snapshot);
      state.storageIssue = {
        type: 'quota',
        message: 'Non c\'è spazio sufficiente per salvare i dati. Esporta un backup e libera spazio, oppure elimina qualche voto.'
      };
      showToast('Errore di salvataggio: spazio esaurito.', 'error');
      return false;
    }
  }

  function canWrite() {
    if (!state.storageAvailable) {
      showToast('Salvataggio non disponibile: i dati restano solo in memoria.', 'error');
      return false;
    }
    if (state.writeBlocked) {
      showToast('Dati bloccati per proteggere quelli esistenti. Vai in Impostazioni.', 'error');
      return false;
    }
    return true;
  }

  function commitData(changes) {
    if (!canWrite()) return false;
    const previous = {
      settings: state.settings,
      subjects: state.subjects,
      grades: state.grades
    };
    if (changes.settings) state.settings = changes.settings;
    if (changes.subjects) state.subjects = changes.subjects;
    if (changes.grades) state.grades = changes.grades;
    if (!writeSnapshot()) {
      state.settings = previous.settings;
      state.subjects = previous.subjects;
      state.grades = previous.grades;
      return false;
    }
    return true;
  }

  function markOnboardingSeen() {
    state.onboardingSeen = true;
    if (state.storageAvailable) safeSet(KEYS.onboarding, '1');
  }

  /* ---------- Icone SVG ---------- */

  function icon(name, size, className) {
    const s = size || 18;
    const cls = className ? ' class="' + className + '"' : '';
    const open = '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"' + cls + '>';
    const close = '</svg>';
    const paths = {
      plus: '<path d="M12 5v14M5 12h14"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
      search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
      sliders: '<path d="M4 7h10M18 7h2M4 17h3M11 17h9"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
      chevronDown: '<path d="m6 9 6 6 6-6"/>',
      chevronRight: '<path d="m9 6 6 6-6 6"/>',
      minus: '<path d="M5 12h14"/>',
      arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
      arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
      arrowRight: '<path d="M4 12h16M14 6l6 6-6 6"/>',
      trash: '<path d="M4 7h16M9 7V4.5h6V7M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
      copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M5 16H4.5A1.5 1.5 0 0 1 3 14.5V5A2 2 0 0 1 5 3h8.5A1.5 1.5 0 0 1 15 4.5V5"/>',
      edit: '<path d="m4 20 4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z"/><path d="m13.5 6.5 3 3"/>',
      alert: '<path d="M12 4 3.2 19.5h17.6L12 4Z"/><path d="M12 9v5M12 17.2v.1"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.1"/>',
      target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
      book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>',
      chart: '<path d="M4 19V5M4 19h16"/><path d="m7.5 15 3.2-3.6 3 2.1L20 6.5"/>',
      calc: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8.5 7.5h7M8.5 12h2M13.5 12h2M8.5 16h2M13.5 16h2"/>',
      shield: '<path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4.5"/>',
      lock: '<rect x="5" y="10" width="14" height="11" rx="2.5"/><path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3M12 14v3"/>',
      download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
      upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
      reset: '<path d="M4 10a8 8 0 1 1 2.3 8.5"/><path d="M4 4v6h6"/>',
      calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="3"/><path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17"/>',
      spark: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>',
      graduation: '<path d="m2.5 9.5 9.5-5 9.5 5-9.5 5-9.5-5Z"/><path d="M6.5 12v4.2c2.7 2 8.3 2 11 0V12M21.5 9.5v5"/>',
      tag: '<path d="M20 13.5 13.5 20a2 2 0 0 1-2.8 0L4 13.3V4h9.3l6.7 6.7a2 2 0 0 1 0 2.8Z"/><circle cx="8.5" cy="8.5" r="1.2"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      scale: '<path d="M12 4v16M7 20h10M5 6h14M5 6l-2.5 6h5L5 6ZM19 6l-2.5 6h5L19 6Z"/>',
      eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
      file: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>'
    };
    return open + (paths[name] || paths.info) + close;
  }

  /* ---------- Animazione dei numeri ---------- */

  const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Contatore leggero: rAF usato solo per valori intermedi, non per animazioni CSS.
  function animateNumber(el, from, to, formatter, duration) {
    if (!el) return;
    const startValue = Number.isFinite(from) ? from : to;
    const endValue = Number(to);
    if (!Number.isFinite(endValue)) {
      el.textContent = '—';
      return;
    }
    if (prefersReducedMotion() || !Number.isFinite(startValue) || Math.abs(endValue - startValue) < 0.005) {
      el.textContent = formatter(endValue);
      return;
    }
    if (el._counterFrame) cancelAnimationFrame(el._counterFrame);
    const start = performance.now();
    const durationMs = duration || 350;
    function frame(now) {
      const progress = clamp((now - start) / durationMs, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * eased;
      el.textContent = formatter(current);
      if (progress < 1) el._counterFrame = requestAnimationFrame(frame);
      else {
        el.textContent = formatter(endValue);
        el._counterFrame = null;
      }
    }
    el._counterFrame = requestAnimationFrame(frame);
  }

  function kindFormatter(kind) {
    if (kind === 'integer') return (v) => nf0.format(v);
    if (kind === 'percent') return (v) => fmtPercent(v);
    if (kind === 'average') return (v) => fmtAverage(v);
    if (kind === 'label') return (v) => valueToLabel(Math.round(v * 4) / 4);
    return (v) => fmt2(v);
  }

  function runCounters(root) {
    $$('[data-count]', root).forEach((el) => {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target)) return;
      const from = el.dataset.countFrom !== undefined ? Number(el.dataset.countFrom) : 0;
      animateNumber(el, from, target, kindFormatter(el.dataset.countKind || 'decimal'), 350);
    });
  }

  /* ---------- Toast ---------- */

  function showToast(message, type) {
    if (!els.toastRegion) return;
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }
    els.toastRegion.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.textContent = message;
    els.toastRegion.appendChild(toast);
    els.liveRegion.textContent = message;
    state.toastTimer = window.setTimeout(() => {
      toast.classList.add('leaving');
      window.setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 200);
    }, 2500);
  }

  /* ---------- Intestazione e navigazione ---------- */

  function renderHeader() {
    const grades = activeGrades();
    const average = meanOf(grades);
    const previous = els.headerAverage.dataset.value === '' ? null : Number(els.headerAverage.dataset.value);
    if (average != null) {
      if (els.headerAverage.dataset.value !== '' && Number.isFinite(previous) && Math.abs(previous - average) > 0.001) {
        animateNumber(els.headerAverage, previous, average, fmtAverage, 350);
      } else {
        els.headerAverage.textContent = fmtAverage(average);
      }
      els.headerAverage.dataset.value = String(average);
    } else {
      els.headerAverage.textContent = '—';
      els.headerAverage.dataset.value = '';
    }

    const goal = state.settings.obiettivoGenerale;
    if (goal != null && average != null) {
      const delta = average - goal;
      els.headerGoal.hidden = false;
      els.headerGoal.className = 'header-goal ' + (delta >= 0 ? 'positive' : 'negative');
      els.headerGoal.textContent = 'Obiettivo ' + fmtAverage(goal) + ' · ' + fmtDelta(delta);
    } else {
      els.headerGoal.hidden = true;
      els.headerGoal.textContent = '';
    }

    const n = grades.length;
    const ns = state.subjects.length;
    els.headerVoteCount.textContent = n + (n === 1 ? ' voto' : ' voti');
    els.headerSubjectCount.textContent = ns + (ns === 1 ? ' materia' : ' materie');
    els.headerContext.hidden = state.settingsOpen;
  }

  function updateNavPill(initial) {
    if (!els.bottomNav || state.settingsOpen) return;
    const active = els.bottomNav.querySelector('[aria-current="page"]');
    if (!active || !els.navPill) return;
    const pillWidth = Math.max(56, Math.min(82, active.offsetWidth - 18));
    els.navPill.style.width = pillWidth + 'px';
    const left = active.offsetLeft + (active.offsetWidth - pillWidth) / 2;
    if (initial) {
      els.navPill.classList.add('no-transition');
      els.navPill.style.transform = 'translate3d(' + left + 'px, 0, 0)';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => els.navPill.classList.remove('no-transition'));
      });
    } else {
      els.navPill.style.transform = 'translate3d(' + left + 'px, 0, 0)';
    }
  }

  function renderChrome(initialNav) {
    const settings = state.settingsOpen;
    els.header.classList.toggle('settings-mode', settings);
    els.shell.classList.toggle('is-settings', settings);
    els.settingsButton.setAttribute('aria-label', settings ? 'Torna indietro' : 'Apri impostazioni');
    els.brandTitle.textContent = settings ? 'Impostazioni' : 'Registro voti';
    els.brandSubtitle.textContent = settings ? 'Dati e preferenze' : 'Il tuo anno, in chiaro';

    $$('.nav-item', els.bottomNav).forEach((btn) => {
      const active = !settings && btn.dataset.nav === state.tab;
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    if (!settings) updateNavPill(!!initialNav);
    renderHeader();

    const fabRelevant = !settings && (state.tab === 'home' || state.tab === 'grades');
    els.fab.hidden = !fabRelevant;
    if (!fabRelevant && state.fabMenuOpen) closeFabMenu();
    const hasVotes = activeGrades().length > 0;
    const shouldPulse = fabRelevant && !hasVotes && !state.fabPulseStopped && !state.onboardingOpen;
    els.fab.classList.toggle('is-pulsing', shouldPulse);
  }

  /* ---------- Viste ---------- */

  function resetChartObservers() {
    state.chartObservers.forEach((observer) => observer.disconnect());
    state.chartObservers = [];
  }

  function viewHTML() {
    if (state.settingsOpen) return renderSettings();
    if (state.tab === 'grades') return renderGrades();
    if (state.tab === 'analysis') return renderAnalysis();
    if (state.tab === 'simulate') return renderSimulate();
    return renderHome();
  }

  function renderView(options) {
    const opts = options || {};
    const animate = opts.animate !== false;
    const preserveScroll = !!opts.preserveScroll;
    const oldView = els.stage.firstElementChild;
    const oldScroll = els.main.scrollTop;
    const html = viewHTML();

    resetChartObservers();
    if (oldView && animate) {
      const clone = oldView.cloneNode(true);
      clone.className = 'view is-leaving';
      clone.setAttribute('aria-hidden', 'true');
      els.stage.innerHTML = '';
      els.stage.appendChild(clone);
      window.setTimeout(() => {
        if (clone.parentNode) clone.remove();
      }, 230);
    } else {
      els.stage.innerHTML = '';
    }

    const view = document.createElement('div');
    view.className = 'view' + (animate && oldView ? ' is-entering' : '');
    view.dataset.view = state.settingsOpen ? 'settings' : state.tab;
    view.innerHTML = html;
    els.stage.appendChild(view);

    renderChrome(false);
    runCounters(view);
    animateHeroAverage(view);
    animateSimAverage(view);
    observeCharts(view);
    decorateNewGrade();
    if (!preserveScroll) els.main.scrollTop = 0;
    else els.main.scrollTop = oldScroll;
    if (state.tab === 'home' && !state.settingsOpen) state.homeAnimated = true;
  }

  function refreshCurrentView(preserveScroll) {
    renderView({ animate: false, preserveScroll: !!preserveScroll });
  }

  function animateHeroAverage(root) {
    const el = $('[data-hero-average]', root);
    if (!el) return;
    const target = Number(el.dataset.heroAverage);
    if (!Number.isFinite(target)) return;
    const previous = Number.isFinite(state.previousHeroAverage) ? state.previousHeroAverage : target;
    if (Math.abs(previous - target) > 0.001) {
      animateNumber(el, previous, target, fmtAverage, 350);
    }
    state.previousHeroAverage = target;
  }

  function animateSimAverage(root) {
    const el = $('[data-sim-average]', root);
    if (!el) return;
    const target = Number(el.dataset.simAverage);
    if (!Number.isFinite(target)) return;
    const previous = Number.isFinite(state.previousSimAverage) ? state.previousSimAverage : target;
    if (Math.abs(previous - target) > 0.001) {
      animateNumber(el, previous, target, fmtAverage, 350);
    }
    state.previousSimAverage = target;
  }

  function decorateNewGrade() {
    if (!state.newGradeId) return;
    const id = state.newGradeId;
    $$('.grade-row.is-new').forEach((row) => {
      if (row.dataset.gradeId !== id) row.classList.remove('is-new');
    });
    window.setTimeout(() => {
      $$('.grade-row.is-new').forEach((row) => row.classList.remove('is-new'));
      if (state.newGradeId === id) state.newGradeId = null;
    }, 500);
  }

  function observeCharts(root) {
    const charts = $$('[data-chart-observe]', root);
    if (!charts.length) return;
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      charts.forEach((chart) => chart.classList.add('chart-animate'));
      return;
    }
    charts.forEach((chart) => {
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('chart-animate');
            obs.disconnect();
          }
        });
      }, { threshold: 0.12 });
      observer.observe(chart);
      state.chartObservers.push(observer);
    });
  }

  function storageWarningHTML() {
    if (!state.storageIssue) return '';
    const issue = state.storageIssue;
    const showAction = !state.settingsOpen;
    return '<div class="notice ' + (issue.type === 'quota' ? 'warning' : 'danger') + '" data-warning role="alert">' +
      icon(issue.type === 'quota' ? 'alert' : 'lock', 18) +
      '<span>' + escapeHTML(issue.message) + '</span>' +
      (showAction ? '<button class="notice-action" type="button" data-action="go-settings">Apri</button>' : '') +
      '</div>';
  }

  function countText(count, singular, plural) {
    return count + ' ' + (count === 1 ? singular : plural);
  }

  function gradeRowHTML(grade, options) {
    const opts = options || {};
    const subject = getSubject(grade.subjectId);
    if (!subject) return '';
    const isBelow = Number(grade.value) < Number(state.settings.sogliaSufficienza);
    const valueClass = isBelow ? 'below' : 'above';
    const meta = [];
    if (opts.showDate) meta.push('<span>' + escapeHTML(formatDateShort(grade.date)) + '</span>');
    if (grade.type && TYPE_LABELS[grade.type]) meta.push('<span>' + escapeHTML(TYPE_LABELS[grade.type]) + '</span>');
    if (Number(grade.weight) !== 100) meta.push('<span>Peso ' + escapeHTML(fmtWeight(grade.weight)) + '</span>');
    const metaHTML = meta.join('<span class="sep"></span>');
    const description = grade.description
      ? '<div class="grade-desc">' + escapeHTML(grade.description) + '</div>'
      : '';
    return '<button class="grade-row' + (state.newGradeId === grade.id ? ' is-new' : '') + '" type="button" data-action="open-grade" data-grade-id="' + escapeHTML(grade.id) + '">' +
      '<span class="subject-dot" style="--dot-color:' + escapeHTML(subject.colore) + ';background:' + escapeHTML(subject.colore) + '" aria-hidden="true"></span>' +
      '<span class="grade-row-main">' +
        '<span class="grade-subject">' + escapeHTML(subject.nome) + '</span>' +
        (metaHTML ? '<span class="grade-meta">' + metaHTML + '</span>' : '') +
        description +
      '</span>' +
      '<span class="grade-value ' + valueClass + '">' + escapeHTML(grade.label) + '</span>' +
    '</button>';
  }

  /* ---------- Home ---------- */

  function homeCardClass(index) {
    return state.homeAnimated ? '' : ' stagger-card" style="--i:' + index + '"';
  }

  function heroAverageMarkup(value) {
    return '<strong class="hero-average" data-hero-average="' + value + '">' + fmtAverage(value) + '</strong>';
  }

  function smoothPath(points) {
    if (!points.length) return '';
    if (points.length === 1) return 'M' + points[0].x + ' ' + points[0].y;
    let d = 'M' + points[0].x.toFixed(2) + ' ' + points[0].y.toFixed(2);
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const mid = (p0.x + p1.x) / 2;
      d += ' C' + mid.toFixed(2) + ' ' + p0.y.toFixed(2) + ',' + mid.toFixed(2) + ' ' + p1.y.toFixed(2) + ',' + p1.x.toFixed(2) + ' ' + p1.y.toFixed(2);
    }
    return d;
  }

  function miniTrendSVG(grades, trend) {
    const sorted = sortedGradesByChronology(grades);
    if (sorted.length < 2) {
      return '<div class="trend-empty">Servono almeno due voti per vedere la direzione della media.</div>';
    }
    let total = 0;
    let weight = 0;
    const raw = sorted.map((g, index) => {
      const w = Number(g.weight) > 0 ? Number(g.weight) : 0;
      total += Number(g.value) * w;
      weight += w;
      return { x: index, y: weight > 0 ? total / weight : 0 };
    });
    const vals = raw.map((p) => p.y);
    let min = Math.min.apply(null, vals);
    let max = Math.max.apply(null, vals);
    if (max - min < 1) {
      min -= 0.5;
      max += 0.5;
    } else {
      min -= 0.25;
      max += 0.25;
    }
    const w = 300;
    const h = 70;
    const padX = 4;
    const padY = 8;
    const denomX = Math.max(1, raw.length - 1);
    const points = raw.map((p, index) => ({
      x: padX + (index / denomX) * (w - padX * 2),
      y: padY + (1 - (p.y - min) / (max - min)) * (h - padY * 2)
    }));
    const line = smoothPath(points);
    const end = points[points.length - 1];
    const fallback = '<table class="sr-only"><caption>Andamento recente della media progressiva</caption><thead><tr><th>Voto</th><th>Media progressiva</th></tr></thead><tbody>' +
      sorted.map((g, i) => '<tr><td>' + escapeHTML(g.label) + '</td><td>' + fmt2(raw[i].y) + '</td></tr>').join('') +
      '</tbody></table>';
    return '<div class="trend-mini-wrap" data-chart-observe>' +
      '<svg class="trend-mini" viewBox="0 0 300 70" role="img" aria-label="Mini grafico dell\'andamento della media progressiva: ' + escapeHTML(trend.label) + '">' +
        '<path d="' + line + '" fill="none" stroke="#0B5ED7" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" pathLength="1" class="line-path"></path>' +
        '<circle cx="' + end.x.toFixed(2) + '" cy="' + end.y.toFixed(2) + '" r="4" fill="#fff" stroke="#0B5ED7" stroke-width="2.5"></circle>' +
      '</svg>' + fallback + '</div>';
  }

  function renderHome() {
    const active = activeGrades();
    const stats = computeStats(active);
    const average = stats.mean;
    const goal = state.settings.obiettivoGenerale;
    const sorted = sortedGradesNewest(active);
    const trend = computeTrend(active);
    let html = '<div class="view-inner">' + storageWarningHTML();

    if (!active.length) {
      html += '<section class="empty-state card home-empty"' + (state.homeAnimated ? '' : ' style="--i:0;animation:card-in .38s var(--ease-out) both"') + '>' +
        '<div class="empty-illustration" aria-hidden="true">' + icon('file', 36) + '</div>' +
        '<h2>Il tuo registro parte da qui</h2>' +
        '<p>Aggiungi il primo voto e vedrai media, andamento e simulazioni prendere forma. Servono solo pochi secondi.</p>' +
        '<button class="button primary" type="button" data-action="add-grade">' + icon('plus', 18) + ' Aggiungi il primo voto</button>' +
        (state.subjects.length
          ? '<button class="text-button" type="button" data-action="add-subject">' + icon('book', 16) + ' Gestisci le materie</button>'
          : '<button class="text-button" type="button" data-action="add-subject">' + icon('book', 16) + ' Aggiungi prima una materia</button>') +
      '</section>' +
      '<div class="card mt-16" style="padding:15px 15px 12px">' +
        '<div class="section-head" style="margin-bottom:2px"><h2 class="section-title">Come funzionano i voti</h2></div>' +
        '<p class="small muted">Usa la notazione che conosci già: <strong>8-</strong> vale 7,75 · <strong>6½</strong> vale 6,50 · <strong>5+</strong> vale 5,25.</p>' +
        '<div class="hint mt-12">' + icon('shield', 16) + '<span>Tutto resta sul tuo dispositivo. Puoi esportare un backup dalle impostazioni.</span></div>' +
      '</div>' +
      '</div>';
      return html;
    }

    const delta = goal != null ? average - goal : null;
    const goalRatio = goal != null && goal > 0 ? clamp(average / goal, 0, 1) : 0;
    const deltaClass = delta == null ? 'neutral' : delta >= 0 ? 'positive' : 'negative';
    const deltaHTML = delta == null
      ? ''
      : '<span class="hero-delta ' + deltaClass + '">' + (delta >= 0 ? icon('arrowUp', 12) : icon('arrowDown', 12)) + ' ' + fmtDelta(delta) + '</span>';

    html += '<section class="home-hero' + homeCardClass(0) + '">' +
      '<div class="hero-top"><div>' +
        '<span class="eyebrow">Media ponderata</span>' +
        '<div>' + heroAverageMarkup(average) + '</div>' +
      '</div>' + deltaHTML + '</div>' +
      (goal != null
        ? '<div class="hero-goal-row"><span>Obiettivo ' + fmtAverage(goal) + '</span><span>·</span><span>' + (delta >= 0 ? 'raggiunto' : 'mancano ' + fmt2(Math.abs(delta)) + ' punti') + '</span></div>' +
          '<div class="hero-goal-line" role="img" aria-label="Progresso verso l\'obiettivo: ' + Math.round(goalRatio * 100) + '%"><span class="hero-goal-fill" style="transform:scaleX(' + goalRatio.toFixed(4) + ')"></span></div>'
        : '') +
      '<div class="hero-mini-stats">' +
        '<span class="hero-mini-stat"><strong>' + stats.n + '</strong> voti</span>' +
        '<span class="hero-mini-stat"><strong>' + fmtPercent(stats.sufficiency) + '</strong> sufficienze</span>' +
        '<span class="hero-mini-stat"><strong>' + state.subjects.length + '</strong> materie</span>' +
      '</div>' +
    '</section>';

    html += '<section class="trend-card card mt-12' + homeCardClass(1) + '">' +
      '<div class="trend-head"><div><p class="trend-title">Andamento</p><p class="trend-sub">Media progressiva degli ultimi voti</p></div>' +
        trendLabelHTML(trend) +
      '</div>' +
      miniTrendSVG(active, trend) +
      '<button class="text-button" type="button" data-action="go-analysis">Apri l\'analisi completa ' + icon('arrowRight', 14) + '</button>' +
    '</section>';

    const problemSubjects = state.subjects
      .map((subject) => ({ subject, grades: gradesForSubject(subject.id, active) }))
      .filter((item) => item.grades.length && meanOf(item.grades) < Number(state.settings.sogliaSufficienza))
      .sort((a, b) => meanOf(a.grades) - meanOf(b.grades));
    const goalFar = goal != null && average < goal - 0.5;
    if (problemSubjects.length || goalFar) {
      html += '<div class="mt-16">' +
        '<div class="section-head"><h2 class="section-title">Da tenere d\'occhio</h2></div>' +
        '<div class="alert-list' + homeCardClass(2) + '">';
      problemSubjects.slice(0, 3).forEach((item) => {
        const subjectMean = meanOf(item.grades);
        html += '<div class="alert-item amber">' + icon('alert', 18) + '<span><strong>' + escapeHTML(item.subject.nome) + '</strong> è sotto la soglia: media ' + fmtAverage(subjectMean) + ' su ' + fmt2(state.settings.sogliaSufficienza) + '.</span></div>';
      });
      if (problemSubjects.length > 3) {
        html += '<div class="alert-item blue">' + icon('info', 18) + '<span>Altre ' + (problemSubjects.length - 3) + ' materie sono sotto la soglia. Trovi il dettaglio in Analisi.</span></div>';
      }
      if (goalFar) {
        html += '<div class="alert-item blue">' + icon('target', 18) + '<span>Ti mancano <strong>' + fmt2(goal - average) + '</strong> punti per l\'obiettivo generale di ' + fmtAverage(goal) + '.</span></div>';
      }
      html += '</div></div>';
    }

    html += '<section class="mt-16' + homeCardClass(3) + '">' +
      '<div class="section-head"><h2 class="section-title">Ultimi voti</h2><button class="section-link" type="button" data-action="go-grades">Vedi tutti ' + icon('chevronRight', 14) + '</button></div>' +
      '<div class="recent-card card"><div class="recent-list">' + sorted.slice(0, 5).map((g) => gradeRowHTML(g, { showDate: true })).join('') + '</div></div>' +
    '</section>';

    return html + '</div>';
  }

  /* ---------- Voti ---------- */

  function periodOptionsHTML(selected) {
    return Object.keys(PERIOD_LABELS).map((key) => '<option value="' + key + '"' + (selected === key ? ' selected' : '') + '>' + escapeHTML(PERIOD_LABELS[key]) + '</option>').join('');
  }

  function gradeFilterOptions(selected) {
    let html = '<option value="">Qualsiasi</option>';
    GRADE_VALUES.forEach((value) => {
      html += '<option value="' + value + '"' + (String(selected) === String(value) ? ' selected' : '') + '>' +
        escapeHTML(valueToLabel(value) + ' · ' + fmt2(value)) + '</option>';
    });
    return html;
  }

  function typeOptionsHTML(selected, allowEmpty) {
    return TYPE_OPTIONS.filter((option) => allowEmpty || option.value).map((option) => '<option value="' + option.value + '"' + (selected === option.value ? ' selected' : '') + '>' + escapeHTML(option.label) + '</option>').join('');
  }

  function subjectOptionsHTML(selected, includeAll) {
    const all = includeAll ? '<option value="">' + (includeAll === 'all' ? 'Tutte le materie' : 'Tutte') + '</option>' : '';
    return all + state.subjects.map((subject) => '<option value="' + escapeHTML(subject.id) + '"' + (selected === subject.id ? ' selected' : '') + '>' + escapeHTML(subject.nome) + '</option>').join('');
  }

  function activeFilterChipsHTML(filters) {
    const chips = [];
    if (filters.subject) {
      const subject = getSubject(filters.subject);
      chips.push({ name: 'subject', label: subject ? subject.nome : 'Materia' });
    }
    if (filters.period && filters.period !== 'tutti') {
      chips.push({ name: 'period', label: periodLabel(filters.period, filters.from, filters.to) });
    }
    if (filters.type) chips.push({ name: 'type', label: TYPE_LABELS[filters.type] || filters.type });
    if (filters.min !== '') chips.push({ name: 'min', label: 'da ' + valueToLabel(Number(filters.min)) });
    if (filters.max !== '') chips.push({ name: 'max', label: 'fino a ' + valueToLabel(Number(filters.max)) });
    if (!chips.length) return '';
    return '<div class="active-chips" aria-label="Filtri attivi">' +
      chips.map((chip) => '<button type="button" class="active-chip" data-action="clear-filter" data-filter-name="' + chip.name + '">' + escapeHTML(chip.label) + icon('close', 11) + '</button>').join('') +
      '<button type="button" class="text-button" data-action="clear-filters" style="min-height:44px;min-width:44px;padding:5px 6px;font-size:10.5px">Azzera</button>' +
    '</div>';
  }

  function groupedGradesHTML(grades) {
    if (!grades.length) return '';
    if (state.groupBy === 'subject') {
      const groups = new Map();
      grades.forEach((grade) => {
        if (!groups.has(grade.subjectId)) groups.set(grade.subjectId, []);
        groups.get(grade.subjectId).push(grade);
      });
      const sortedGroups = Array.from(groups.entries())
        .map(([id, items]) => ({ subject: getSubject(id), items: sortedGradesNewest(items) }))
        .filter((group) => group.subject)
        .sort((a, b) => a.subject.nome.localeCompare(b.subject.nome, 'it'));
      return '<div class="grade-groups">' + sortedGroups.map((group) => {
        const avg = meanOf(group.items);
        return '<section>' +
          '<div class="grade-group-head">' +
            '<span class="subject-dot" style="background:' + escapeHTML(group.subject.colore) + '"></span>' +
            '<h3>' + escapeHTML(group.subject.nome) + '</h3>' +
            '<span class="grade-group-count">' + group.items.length + '</span>' +
            (avg != null ? '<span class="group-average">media ' + fmtAverage(avg) + '</span>' : '') +
          '</div>' +
          '<div class="grade-list-card">' + group.items.map((g) => gradeRowHTML(g, { showDate: true })).join('') + '</div>' +
        '</section>';
      }).join('') + '</div>';
    }

    const groups = new Map();
    sortedGradesNewest(grades).forEach((grade) => {
      if (!groups.has(grade.date)) groups.set(grade.date, []);
      groups.get(grade.date).push(grade);
    });
    return '<div class="grade-groups">' + Array.from(groups.entries()).map(([date, items]) => {
      return '<section>' +
        '<div class="grade-group-head"><h3>' + escapeHTML(dateGroupLabel(date)) + '</h3><span class="grade-group-count">' + items.length + '</span></div>' +
        '<div class="grade-list-card">' + items.map((g) => gradeRowHTML(g, { showDate: false })).join('') + '</div>' +
      '</section>';
    }).join('') + '</div>';
  }

  function gradesResultsHTML(filtered) {
    const allActive = activeGrades();
    const avg = meanOf(filtered);
    if (!filtered.length) {
      if (!allActive.length) {
        return '<div class="empty-state card mt-16">' +
          '<div class="empty-illustration" aria-hidden="true">' + icon('graduation', 36) + '</div>' +
          '<h2>Ancora nessun voto</h2>' +
          '<p>Quando arriva il primo voto, registralo qui. Potrai sempre modificarlo o aggiungere dettagli.</p>' +
          '<button class="button primary" type="button" data-action="add-grade">' + icon('plus', 18) + ' Aggiungi il primo voto</button>' +
        '</div>';
      }
      return '<div class="empty-state card mini mt-16">' +
        '<div class="empty-illustration" aria-hidden="true">' + icon('search', 26) + '</div>' +
        '<h2>Nessun voto con questi filtri</h2>' +
        '<p>Prova a cambiare periodo, materia o intervallo di voto.</p>' +
        '<button class="button secondary" type="button" data-action="clear-filters">Azzera i filtri</button>' +
      '</div>';
    }
    return '<div class="count-line"><p><strong>' + filtered.length + '</strong> ' + (filtered.length === 1 ? 'voto trovato' : 'voti trovati') + '</p>' +
      (avg != null ? '<p>Media <strong>' + fmtAverage(avg) + '</strong></p>' : '') + '</div>' + groupedGradesHTML(filtered);
  }

  function updateGradesResults() {
    const container = $('#gradesResults', els.stage);
    if (!container) return;
    const filtered = applyGradeFilters(activeGrades(), state.gradesFilters);
    container.innerHTML = gradesResultsHTML(filtered);
    const count = $('#gradesPageCount', els.stage);
    if (count) count.textContent = activeGrades().length;
    decorateNewGrade();
  }

  function renderGrades() {
    const active = activeGrades();
    const filters = state.gradesFilters;
    const filtered = applyGradeFilters(active, filters);
    const filterCount = countActiveFilters(filters);
    const searchValue = filters.search;
    let html = '<div class="view-inner">' + storageWarningHTML();

    html += '<div class="page-heading"><div><h1>I tuoi voti</h1><p>Tutto il tuo anno, voto per voto.</p></div>' +
      '<span class="count-badge" id="gradesPageCount" aria-label="' + active.length + ' voti totali">' + active.length + '</span></div>';

    html += '<div class="search-box">' + icon('search', 19) +
      '<label class="sr-only" for="gradesSearch">Cerca per descrizione o tag</label>' +
      '<input id="gradesSearch" type="search" placeholder="Cerca descrizione o tag" value="' + escapeHTML(searchValue) + '" autocomplete="off" data-search-input="grades">' +
      (searchValue ? '<button class="search-clear" type="button" data-action="clear-search" aria-label="Cancella ricerca">' + icon('close', 18) + '</button>' : '') +
    '</div>';

    html += '<div class="toolbar-row">' +
      '<button class="filter-toggle" id="filterToggle" type="button" data-action="filter-toggle" aria-expanded="' + (state.gradesFiltersOpen ? 'true' : 'false') + '" aria-controls="gradesFilters">' +
        icon('sliders', 17) + ' Filtri' +
        '<span class="filter-count" id="filterCount"' + (filterCount ? '' : ' hidden') + '>' + filterCount + '</span>' +
      '</button>' +
      '<div class="segmented" role="group" aria-label="Raggruppa i voti">' +
        '<button type="button" data-action="group-by" data-value="date" aria-pressed="' + (state.groupBy === 'date' ? 'true' : 'false') + '">Per data</button>' +
        '<button type="button" data-action="group-by" data-value="subject" aria-pressed="' + (state.groupBy === 'subject' ? 'true' : 'false') + '">Per materia</button>' +
      '</div>' +
    '</div>';

    html += '<div class="filters-panel' + (state.gradesFiltersOpen ? ' open' : '') + '" id="gradesFilters"><div class="filters-panel-inner"><div class="filter-card">' +
      '<div class="filter-grid">' +
        '<div class="field full"><label for="filterSubject">Materia</label><select class="select" id="filterSubject" data-filter-field="subject">' + subjectOptionsHTML(filters.subject, 'all') + '</select></div>' +
        '<div class="field"><label for="filterPeriod">Periodo</label><select class="select" id="filterPeriod" data-filter-field="period">' + periodOptionsHTML(filters.period) + '</select></div>' +
        '<div class="field"><label for="filterType">Tipo</label><select class="select" id="filterType" data-filter-field="type">' + typeOptionsHTML(filters.type, true) + '</select></div>' +
        '<div class="field"><label for="filterMin">Voto da</label><select class="select" id="filterMin" data-filter-field="min">' + gradeFilterOptions(filters.min) + '</select></div>' +
        '<div class="field"><label for="filterMax">Voto a</label><select class="select" id="filterMax" data-filter-field="max">' + gradeFilterOptions(filters.max) + '</select></div>' +
      '</div>' +
      '<div class="period-custom" data-period-custom' + (filters.period === 'custom' ? '' : ' hidden') + '>' +
        '<div class="field"><label for="filterFrom">Dal</label><input class="input" type="date" id="filterFrom" value="' + escapeHTML(filters.from) + '" data-filter-field="from"></div>' +
        '<div class="field"><label for="filterTo">Al</label><input class="input" type="date" id="filterTo" value="' + escapeHTML(filters.to) + '" data-filter-field="to"></div>' +
      '</div>' +
      '<div class="filter-actions"><span class="tiny muted">I filtri restano attivi finché non li azzeri.</span><button type="button" class="text-button" data-action="clear-filters">Azzera filtri</button></div>' +
    '</div></div></div>';

    html += activeFilterChipsHTML(filters);
    html += '<div id="gradesResults">' + gradesResultsHTML(filtered) + '</div>';
    return html + '</div>';
  }

  /* ---------- Analisi: dati e grafici ---------- */

  const DISTRIBUTION_BANDS = [
    { key: 'lt5', label: 'Meno di 5', short: '<5', min: -Infinity, max: 5 },
    { key: '5-6', label: 'Da 5 a 6', short: '5–6', min: 5, max: 6 },
    { key: '6-7', label: 'Da 6 a 7', short: '6–7', min: 6, max: 7 },
    { key: '7-8', label: 'Da 7 a 8', short: '7–8', min: 7, max: 8 },
    { key: '8-9', label: 'Da 8 a 9', short: '8–9', min: 8, max: 9 },
    { key: '9-10', label: 'Da 9 a 10', short: '9–10', min: 9, max: 10 },
    { key: '10+', label: 'Oltre 10', short: '10+', min: 10, max: Infinity }
  ];

  function bandIndexForValue(value) {
    const v = Number(value);
    if (v < 5) return 0;
    if (v < 6) return 1;
    if (v < 7) return 2;
    if (v < 8) return 3;
    if (v < 9) return 4;
    if (v <= 10) return 5;
    return 6;
  }

  function bandIsBelowThreshold(index) {
    const band = DISTRIBUTION_BANDS[index];
    const threshold = Number(state.settings.sogliaSufficienza);
    if (index === 0) return true;
    // Una fascia è "sotto soglia" quando il suo limite superiore non
    // supera la sufficienza impostata.
    return Number.isFinite(band.max) && band.max <= threshold + 1e-9;
  }

  function bandColor(index) {
    const blueShades = ['#083B82', '#0B5ED7', '#2F7CE8', '#5B98EA', '#8AB6F2'];
    if (index === 0) return '#B93830';
    if (bandIsBelowThreshold(index)) return '#C17A0C';
    let blueIndex = 0;
    for (let i = 1; i < index; i += 1) {
      if (!bandIsBelowThreshold(i) && i !== 0) blueIndex += 1;
    }
    return blueShades[Math.min(blueIndex, blueShades.length - 1)];
  }

  function distributionForGrades(grades) {
    const counts = DISTRIBUTION_BANDS.map(() => 0);
    grades.forEach((grade) => {
      counts[bandIndexForValue(grade.value)] += 1;
    });
    return DISTRIBUTION_BANDS.map((band, index) => ({
      ...band,
      index,
      count: counts[index],
      color: bandColor(index)
    }));
  }

  function polarPoint(cx, cy, radius, angleDegrees) {
    const angle = (angleDegrees - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  }

  function donutArcPath(cx, cy, radius, startAngle, endAngle) {
    const sweep = Math.min(359.99, endAngle - startAngle);
    const start = polarPoint(cx, cy, radius, startAngle);
    const end = polarPoint(cx, cy, radius, startAngle + sweep);
    const largeArc = sweep > 180 ? 1 : 0;
    if (sweep >= 359.9) {
      const opposite = polarPoint(cx, cy, radius, startAngle + 180);
      return 'M' + start.x.toFixed(2) + ' ' + start.y.toFixed(2) +
        ' A' + radius + ' ' + radius + ' 0 1 1 ' + opposite.x.toFixed(2) + ' ' + opposite.y.toFixed(2) +
        ' A' + radius + ' ' + radius + ' 0 1 1 ' + start.x.toFixed(2) + ' ' + start.y.toFixed(2);
    }
    return 'M' + start.x.toFixed(2) + ' ' + start.y.toFixed(2) +
      ' A' + radius + ' ' + radius + ' 0 ' + largeArc + ' 1 ' + end.x.toFixed(2) + ' ' + end.y.toFixed(2);
  }

  function chartTableHTML(caption, headers, rows) {
    return '<table class="sr-only"><caption>' + escapeHTML(caption) + '</caption><thead><tr>' +
      headers.map((h) => '<th scope="col">' + escapeHTML(h) + '</th>').join('') +
      '</tr></thead><tbody>' +
      rows.map((row) => '<tr>' + row.map((cell) => '<td>' + escapeHTML(cell) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table>';
  }

  function donutCardHTML(grades) {
    const bands = distributionForGrades(grades);
    const total = grades.length;
    if (!total) {
      return '<section class="chart-card card"><div class="chart-head"><div><h2>Distribuzione dei voti</h2><p>Le fasce di voto del periodo.</p></div></div>' +
        '<div class="chart-empty">' + icon('chart', 24) + '<strong>Nessun dato da rappresentare</strong>Registra un voto per vedere la distribuzione.</div></section>';
    }
    const visible = bands.filter((band) => band.count > 0);
    const cx = 160;
    const cy = 105;
    const radius = 62;
    const stroke = 22;
    let angle = 0;
    const gap = visible.length > 1 ? 1.4 : 0;
    // Lo spessore trasparente di 50 unità SVG mantiene l'area di tocco
    // di almeno 44 px anche alla larghezza minima di 360 px.
    const segments = visible.map((band, visibleIndex) => {
      const portion = band.count / total;
      const startAngle = angle + gap / 2;
      angle += portion * 360;
      const endAngle = angle - gap / 2;
      const path = donutArcPath(cx, cy, radius, startAngle, endAngle);
      const percent = Math.round(portion * 100);
      const aria = band.label + ': ' + band.count + ' ' + (band.count === 1 ? 'voto' : 'voti') + ', ' + percent + '%';
      return '<g class="donut-segment" style="--seg-i:' + Math.min(visibleIndex, 8) + '">' +
        '<path d="' + path + '" fill="none" stroke="' + band.color + '" stroke-width="' + stroke + '" stroke-linecap="butt" pathLength="100" class="segment-path"></path>' +
        '<path d="' + path + '" fill="none" stroke="transparent" stroke-width="50" stroke-linecap="butt" class="segment-hit chart-interactive" tabindex="0" role="button" aria-label="' + escapeHTML(aria) + '" data-tip-title="' + escapeHTML(band.label) + '" data-tip-body="' + escapeHTML(band.count + ' ' + (band.count === 1 ? 'voto' : 'voti') + ' · ' + percent + '%') + '"></path>' +
      '</g>';
    }).join('');
    const legend = bands.map((band) => {
      const percent = total ? Math.round((band.count / total) * 100) : 0;
      return '<span class="legend-item"><span class="legend-swatch round" style="background:' + band.color + '"></span>' + escapeHTML(band.short) + ' · ' + band.count + ' (' + percent + '%)</span>';
    }).join('');
    const table = chartTableHTML('Distribuzione dei voti per fasce', ['Fascia', 'Numero voti', 'Percentuale'],
      bands.map((band) => [band.label, band.count, total ? Math.round((band.count / total) * 100) + '%' : '0%']));
    return '<section class="chart-card card">' +
      '<div class="chart-head"><div><h2>Distribuzione dei voti</h2><p>Come si distribuiscono i voti del periodo.</p></div><span class="pill blue">' + total + ' voti</span></div>' +
      '<div class="chart-area" data-chart-observe>' +
        '<svg viewBox="0 0 320 210" role="img" aria-label="Grafico ad anello della distribuzione dei voti in ' + total + ' fasce.">' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="#eef2f8" stroke-width="' + stroke + '"></circle>' +
          segments +
          '<g class="donut-labels"><text class="donut-center-number" x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle">' + total + '</text>' +
          '<text class="donut-center-label" x="' + cx + '" y="' + (cy + 13) + '" text-anchor="middle">' + (total === 1 ? 'VOTO' : 'VOTI') + '</text></g>' +
        '</svg>' +
        '<div class="chart-tooltip" role="status" aria-live="polite"></div>' +
      '</div>' +
      '<div class="chart-legend">' + legend + '</div>' +
      table +
    '</section>';
  }

  function lineSeriesData(grades, mode) {
    const sorted = sortedGradesByChronology(grades);
    if (mode === 'progressive') {
      let sum = 0;
      let weight = 0;
      return sorted.map((grade) => {
        const w = Number(grade.weight) > 0 ? Number(grade.weight) : 0;
        weight += w;
        sum += Number(grade.value) * w;
        return { grade, value: weight > 0 ? sum / weight : Number(grade.value) };
      });
    }
    return sorted.map((grade) => ({ grade, value: Number(grade.value) }));
  }

  function lineCardHTML(grades) {
    const mode = state.lineMode === 'progressive' ? 'progressive' : 'single';
    const series = lineSeriesData(grades, mode);
    const toggle = '<div class="chart-toggle"><div class="segmented" role="group" aria-label="Tipo di andamento">' +
      '<button type="button" data-action="line-mode" data-value="single" aria-pressed="' + (mode === 'single' ? 'true' : 'false') + '">Voti</button>' +
      '<button type="button" data-action="line-mode" data-value="progressive" aria-pressed="' + (mode === 'progressive' ? 'true' : 'false') + '">Media</button>' +
    '</div></div>';
    if (series.length < 2) {
      return '<section class="chart-card card">' +
        '<div class="chart-head"><div><h2>Andamento nel tempo</h2><p>Come cambiano i voti durante il periodo.</p></div>' + toggle + '</div>' +
        '<div class="chart-empty">' + icon('chart', 24) + '<strong>Servono almeno due voti</strong>Con un solo voto il tempo non racconta ancora una direzione. Aggiungi un altro voto per vedere la linea.</div>' +
      '</section>';
    }
    const width = 340;
    const height = 230;
    const margin = { top: 13, right: 12, bottom: 31, left: 27 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const timestamps = series.map((item) => (parseISODate(item.grade.date) || new Date(0)).getTime());
    const minDate = Math.min.apply(null, timestamps);
    const maxDate = Math.max.apply(null, timestamps);
    const dateSpan = maxDate - minDate;
    const yMax = 10.5;
    const y = (value) => margin.top + (1 - clamp(value, 0, yMax) / yMax) * innerH;
    const x = (timestamp) => margin.left + (dateSpan > 0 ? ((timestamp - minDate) / dateSpan) * innerW : innerW / 2);
    const points = series.map((item, index) => ({
      ...item,
      x: x(timestamps[index]),
      y: y(item.value)
    }));
    const gridTicks = [0, 2, 4, 6, 8, 10];
    let grid = '';
    gridTicks.forEach((tick) => {
      grid += '<line x1="' + margin.left + '" y1="' + y(tick).toFixed(2) + '" x2="' + (width - margin.right) + '" y2="' + y(tick).toFixed(2) + '" class="chart-grid-line"></line>';
      grid += '<text x="' + (margin.left - 7) + '" y="' + (y(tick) + 3).toFixed(2) + '" text-anchor="end" class="chart-axis-label">' + tick + '</text>';
    });
    const uniqueDates = Array.from(new Set(timestamps));
    const xIndexes = uniqueDates.length <= 4
      ? uniqueDates.map((ts) => timestamps.indexOf(ts))
      : [0, Math.round((points.length - 1) / 3), Math.round(((points.length - 1) * 2) / 3), points.length - 1];
    const tickIndexes = Array.from(new Set(xIndexes.filter((i) => i >= 0)));
    let xLabels = '';
    tickIndexes.forEach((index, labelIndex) => {
      const anchor = tickIndexes.length === 1 ? 'middle' : labelIndex === 0 ? 'start' : labelIndex === tickIndexes.length - 1 ? 'end' : 'middle';
      const px = tickIndexes.length === 1 ? margin.left + innerW / 2 : clamp(points[index].x, margin.left, width - margin.right);
      xLabels += '<text x="' + px.toFixed(2) + '" y="' + (height - 8) + '" text-anchor="' + anchor + '" class="chart-axis-label">' + escapeHTML(formatDateShort(points[index].grade.date)) + '</text>';
    });
    const linePath = smoothPath(points);
    const color = mode === 'progressive' ? '#0B5ED7' : '#3E71C7';
    // Area di tocco più ampia possibile (fino a 44 px) senza sovrapporre
    // i punti vicini, così i tooltip restano raggiungibili anche con molti voti.
    const minPointGap = points.reduce((min, point, index) => (
      index === 0 ? min : Math.min(min, point.x - points[index - 1].x)
    ), Infinity);
    const hitRadius = Number.isFinite(minPointGap)
      ? Math.max(11, Math.min(22, minPointGap / 2))
      : 14;
    const pointMarkup = points.map((point, index) => {
      const subject = getSubject(point.grade.subjectId);
      const title = mode === 'progressive' ? 'Media progressiva ' + fmtAverage(point.value) : point.grade.label;
      const body = (subject ? subject.nome + ' · ' : '') + formatDateLong(point.grade.date) + (mode === 'single' ? ' · ' + fmt2(point.value) : '');
      return '<g class="chart-point" style="--point-i:' + Math.min(index, 10) + '">' +
        '<circle cx="' + point.x.toFixed(2) + '" cy="' + point.y.toFixed(2) + '" r="3.6" fill="#fff" stroke="' + color + '" stroke-width="2"></circle>' +
        '<circle cx="' + point.x.toFixed(2) + '" cy="' + point.y.toFixed(2) + '" r="' + hitRadius.toFixed(1) + '" fill="transparent" class="chart-point-hit chart-interactive" tabindex="0" role="button" aria-label="' + escapeHTML(title + ': ' + body) + '" data-tip-title="' + escapeHTML(title) + '" data-tip-body="' + escapeHTML(body) + '"></circle>' +
      '</g>';
    }).join('');
    const tableRows = series.map((item) => {
      const subject = getSubject(item.grade.subjectId);
      return [
        formatDateLong(item.grade.date),
        subject ? subject.nome : '',
        item.grade.label,
        mode === 'progressive' ? 'Media ' + fmtAverage(item.value) : fmt2(item.value)
      ];
    });
    const table = chartTableHTML(
      mode === 'progressive' ? 'Andamento della media progressiva' : 'Andamento dei singoli voti',
      ['Data', 'Materia', 'Voto', 'Valore'], tableRows
    );
    return '<section class="chart-card card">' +
      '<div class="chart-head"><div><h2>Andamento nel tempo</h2><p>' + (mode === 'progressive' ? 'Media progressiva dei voti.' : 'Ogni voto, in ordine cronologico.') + '</p></div>' + toggle + '</div>' +
      '<div class="chart-area" data-chart-observe>' +
        '<svg viewBox="0 0 340 230" role="img" aria-label="' + (mode === 'progressive' ? 'Grafico della media progressiva' : 'Grafico dei singoli voti') + ' in ordine di data, con ' + series.length + ' punti.">' +
          '<g class="axis-fade">' + grid +
            '<line x1="' + margin.left + '" y1="' + (margin.top + innerH) + '" x2="' + (width - margin.right) + '" y2="' + (margin.top + innerH) + '" class="chart-axis-line"></line>' +
            xLabels +
          '</g>' +
          '<path d="' + linePath + '" fill="none" stroke="' + color + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" pathLength="1" class="line-path"></path>' +
          pointMarkup +
        '</svg>' +
        '<div class="chart-tooltip" role="status" aria-live="polite"></div>' +
      '</div>' +
      table +
    '</section>';
  }

  function truncateLabel(text, max) {
    const value = String(text);
    return value.length > max ? value.slice(0, Math.max(1, max - 1)).trimEnd() + '…' : value;
  }

  function barsCardHTML(grades) {
    const groups = new Map();
    grades.forEach((grade) => {
      if (!groups.has(grade.subjectId)) groups.set(grade.subjectId, []);
      groups.get(grade.subjectId).push(grade);
    });
    const subjects = Array.from(groups.entries())
      .map(([id, items]) => ({ subject: getSubject(id), grades: items, mean: meanOf(items) }))
      .filter((item) => item.subject && item.mean != null)
      .sort((a, b) => a.mean - b.mean);
    if (!subjects.length) {
      return '<section class="chart-card card"><div class="chart-head"><div><h2>Media per materia</h2><p>Confronta le materie del periodo.</p></div></div>' +
        '<div class="chart-empty">' + icon('book', 24) + '<strong>Nessuna materia da confrontare</strong>Aggiungi un voto per vedere le medie.</div></section>';
    }

    const width = 340;
    const top = 10;
    // 50 unità SVG restano almeno 44 px anche a 360 px di larghezza.
    const rowHeight = 50;
    const height = top + subjects.length * rowHeight + 20;
    const left = 96;
    const right = 25;
    const chartWidth = width - left - right;
    const goal = state.settings.obiettivoGenerale;
    const threshold = Number(state.settings.sogliaSufficienza);
    const x = (value) => left + (clamp(value, 0, 10.5) / 10.5) * chartWidth;
    let bars = '';
    let rows = '';
    subjects.forEach((item, index) => {
      const yTop = top + index * rowHeight + 10;
      const barWidth = Math.max(3, x(item.mean) - left);
      const above = item.mean >= threshold;
      const fill = above ? '#15803D' : '#BB433B';
      const valueLabelX = x(item.mean) + 5 > width - 3 ? width - 3 : x(item.mean) + 5;
      const anchor = x(item.mean) + 5 > width - 3 ? 'end' : 'start';
      rows += '<text x="4" y="' + (yTop + 14) + '" class="chart-axis-label" style="font-size:10px;fill:#36445a;font-weight:600">' + escapeHTML(truncateLabel(item.subject.nome, 17)) + '</text>' +
        '<rect x="' + left + '" y="' + yTop + '" width="' + chartWidth + '" height="20" rx="10" fill="#f1f4f9"></rect>' +
        '<rect x="' + left + '" y="' + yTop + '" width="' + barWidth.toFixed(2) + '" height="20" rx="10" fill="' + fill + '" class="bar-rect" style="--bar-i:' + Math.min(index, 8) + '"></rect>' +
        '<text x="' + valueLabelX.toFixed(2) + '" y="' + (yTop + 14) + '" text-anchor="' + anchor + '" class="chart-axis-label" style="font-size:10px;fill:#1f3450;font-weight:700">' + fmtAverage(item.mean) + '</text>' +
        '<rect x="0" y="' + (yTop - 6) + '" width="' + width + '" height="50" fill="transparent" class="chart-bar-hit chart-interactive" tabindex="0" role="button" aria-label="' + escapeHTML(item.subject.nome + ': media ' + fmtAverage(item.mean) + ', ' + item.grades.length + (item.grades.length === 1 ? ' voto' : ' voti')) + '" data-tip-title="' + escapeHTML(item.subject.nome) + '" data-tip-body="' + escapeHTML('Media ' + fmtAverage(item.mean) + ' · ' + item.grades.length + (item.grades.length === 1 ? ' voto' : ' voti')) + '"></rect>';
    });
    let goalLine = '';
    if (goal != null) {
      goalLine = '<line x1="' + x(goal).toFixed(2) + '" y1="' + (top + 2) + '" x2="' + x(goal).toFixed(2) + '" y2="' + (height - 14) + '" class="chart-threshold goal-line" style="--bar-count:' + Math.min(subjects.length, 8) + '"></line>' +
        '<text x="' + x(goal).toFixed(2) + '" y="' + (height - 4) + '" text-anchor="middle" class="chart-axis-label">obiettivo</text>';
    }
    const legend = '<span class="legend-item"><span class="legend-swatch round" style="background:#15803D"></span>Sopra soglia</span>' +
      '<span class="legend-item"><span class="legend-swatch round" style="background:#BB433B"></span>Sotto soglia</span>' +
      (goal != null ? '<span class="legend-item"><span class="legend-line"></span>Obiettivo ' + fmtAverage(goal) + '</span>' : '');
    const table = chartTableHTML('Media per materia', ['Materia', 'Media', 'Numero voti'],
      subjects.slice().sort((a, b) => b.mean - a.mean).map((item) => [item.subject.nome, fmtAverage(item.mean), item.grades.length]));
    return '<section class="chart-card card">' +
      '<div class="chart-head"><div><h2>Media per materia</h2><p>Barra verde sopra soglia, rossa sotto.</p></div><span class="pill">' + subjects.length + (subjects.length === 1 ? ' materia' : ' materie') + '</span></div>' +
      '<div class="chart-area" data-chart-observe>' +
        '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Grafico a barre delle medie per materia, con ' + subjects.length + ' materie e linea tratteggiata dell\'obiettivo.">' +
          bars + goalLine + rows +
        '</svg>' +
        '<div class="chart-tooltip" role="status" aria-live="polite"></div>' +
      '</div>' +
      '<div class="chart-legend">' + legend + '</div>' +
      table +
    '</section>';
  }

  function analysisFilteredGrades() {
    const f = state.analysisFilters;
    let grades = activeGrades();
    if (f.subject) grades = grades.filter((g) => g.subjectId === f.subject);
    grades = grades.filter((g) => isInPeriod(g.date, f.period, f.from, f.to));
    return grades;
  }

  function renderAnalysis() {
    const active = activeGrades();
    const filtered = analysisFilteredGrades();
    const stats = computeStats(filtered);
    const trend = computeTrend(filtered);
    const f = state.analysisFilters;
    let html = '<div class="view-inner">' + storageWarningHTML();
    html += '<div class="page-heading"><div><h1>Analisi</h1><p>Il quadro completo del periodo.</p></div>' +
      '<span class="count-badge" aria-label="' + filtered.length + ' voti analizzati">' + filtered.length + '</span></div>';

    html += '<div class="analysis-filters card">' +
      '<div class="field"><label for="analysisPeriod">Periodo</label><select class="select" id="analysisPeriod" data-analysis-field="period">' + periodOptionsHTML(f.period) + '</select></div>' +
      '<div class="field"><label for="analysisSubject">Materia</label><select class="select" id="analysisSubject" data-analysis-field="subject">' + subjectOptionsHTML(f.subject, 'all') + '</select></div>' +
      (f.period === 'custom'
        ? '<div class="period-custom full" style="margin-top:0"><div class="field"><label for="analysisFrom">Dal</label><input class="input" type="date" id="analysisFrom" value="' + escapeHTML(f.from) + '" data-analysis-field="from"></div>' +
          '<div class="field"><label for="analysisTo">Al</label><input class="input" type="date" id="analysisTo" value="' + escapeHTML(f.to) + '" data-analysis-field="to"></div></div>'
        : '') +
      '<div class="full analysis-meta" style="margin:0"><p>' + escapeHTML(periodLabel(f.period, f.from, f.to)) + (f.subject ? ' · ' + escapeHTML((getSubject(f.subject) || {}).nome || '') : ' · tutte le materie') + '</p>' + trendLabelHTML(trend) + '</div>' +
    '</div>';

    if (!active.length) {
      html += '<div class="empty-state card mt-16">' +
        '<div class="empty-illustration" aria-hidden="true">' + icon('chart', 36) + '</div>' +
        '<h2>Ancora niente da analizzare</h2>' +
        '<p>Registra il primo voto: qui troverai distribuzione, andamento, medie per materia e molto altro.</p>' +
        '<button class="button primary" type="button" data-action="add-grade">' + icon('plus', 18) + ' Aggiungi il primo voto</button>' +
      '</div></div>';
      return html;
    }

    if (!filtered.length) {
      html += '<div class="empty-state card mini mt-16">' +
        '<div class="empty-illustration" aria-hidden="true">' + icon('search', 26) + '</div>' +
        '<h2>Nessun voto in questo periodo</h2>' +
        '<p>Allarga il periodo o cambia materia per vedere le statistiche.</p>' +
        '<button class="button secondary" type="button" data-action="reset-analysis-filters">Mostra l\'anno intero</button>' +
      '</div></div>';
      return html;
    }

    const kpiValue = (kind, value, className) => {
      if (!Number.isFinite(value)) return '<span class="kpi-value">—</span>';
      return '<span class="kpi-value' + (className ? ' ' + className : '') + '" data-count="' + value + '" data-count-kind="' + kind + '">' + kindFormatter(kind)(value) + '</span>';
    };
    const kpis = [
      { label: 'Media', kind: 'average', value: stats.mean, sub: 'ponderata' },
      { label: 'Mediana', kind: 'decimal', value: stats.median, sub: 'valori' },
      { label: 'Moda', kind: 'decimal', value: stats.mode, sub: stats.mode != null ? 'equivale a ' + valueToLabel(stats.mode) : 'nessuna' },
      { label: 'Minimo', kind: 'decimal', value: stats.min, sub: stats.min != null ? valueToLabel(stats.min) : '—' },
      { label: 'Massimo', kind: 'decimal', value: stats.max, sub: stats.max != null ? valueToLabel(stats.max) : '—' },
      { label: 'Dev. std', kind: 'decimal', value: stats.std, sub: 'dispersione' },
      { label: 'Voti', kind: 'integer', value: stats.n, sub: 'nel periodo' },
      { label: 'Sufficienti', kind: 'percent', value: stats.sufficiency, sub: '≥ ' + fmt2(state.settings.sogliaSufficienza) }
    ];
    html += '<div class="section-head mt-16" style="margin-bottom:5px"><h2 class="section-title">Numeri del periodo</h2><span class="tiny muted">scorri →</span></div>';
    html += '<div class="kpi-scroller">' + kpis.map((kpi) => '<div class="kpi-card"><span class="kpi-label">' + kpi.label + '</span>' +
      kpiValue(kpi.kind, kpi.value) + '<span class="kpi-sub">' + escapeHTML(kpi.sub) + '</span></div>').join('') + '</div>';

    html += donutCardHTML(filtered);
    html += '<div class="mt-12">' + lineCardHTML(filtered) + '</div>';
    html += '<div class="mt-12">' + barsCardHTML(filtered) + '</div>';

    const groups = new Map();
    filtered.forEach((grade) => {
      if (!groups.has(grade.subjectId)) groups.set(grade.subjectId, []);
      groups.get(grade.subjectId).push(grade);
    });
    const subjectRows = Array.from(groups.entries())
      .map(([id, items]) => ({ subject: getSubject(id), grades: items, mean: meanOf(items), trend: computeTrend(items) }))
      .filter((item) => item.subject && item.mean != null)
      .sort((a, b) => b.mean - a.mean);

    if (subjectRows.length) {
      html += '<div class="mt-16"><div class="section-head"><h2 class="section-title">Confronto per materia</h2></div>' +
        '<div class="subject-compare card">' +
        subjectRows.map((item) => '<div class="compare-row">' +
          '<div><div class="compare-subject"><span class="subject-dot" style="background:' + escapeHTML(item.subject.colore) + '"></span><span>' + escapeHTML(item.subject.nome) + '</span></div>' +
          '<div class="compare-meta">' + item.grades.length + (item.grades.length === 1 ? ' voto' : ' voti') + trendInline(item.trend) + '</div></div>' +
          '<span class="compare-value">' + fmtAverage(item.mean) + '</span>' +
        '</div>').join('') + '</div></div>';

      const best = subjectRows[0];
      const worst = subjectRows[subjectRows.length - 1];
      html += '<div class="section-head mt-16"><h2 class="section-title">Materia migliore e da recuperare</h2></div>';
      html += '<div class="explainer-row">' +
        '<div class="insight-card best"><span class="insight-label">' + icon('arrowUp', 12) + ' Migliore</span><div class="insight-name">' + escapeHTML(best.subject.nome) + '</div><div class="insight-value">' + fmtAverage(best.mean) + '</div></div>' +
        (subjectRows.length > 1
          ? '<div class="insight-card worst"><span class="insight-label">' + icon('alert', 12) + ' Da recuperare</span><div class="insight-name">' + escapeHTML(worst.subject.nome) + '</div><div class="insight-value">' + fmtAverage(worst.mean) + '</div></div>'
          : '<div class="insight-card"><span class="insight-label">' + icon('info', 12) + ' Confronto</span><div class="insight-name">Aggiungi un\'altra materia</div><div class="tiny muted" style="margin-top:5px">Con una sola materia non c\'è un confronto.</div></div>') +
      '</div>';
    }

    const oral = meanOf(filtered.filter((g) => g.type === 'orale'));
    const written = meanOf(filtered.filter((g) => g.type === 'scritto'));
    const oralCount = filtered.filter((g) => g.type === 'orale').length;
    const writtenCount = filtered.filter((g) => g.type === 'scritto').length;
    html += '<div class="mt-16"><div class="section-head"><h2 class="section-title">Orale e scritto</h2></div>' +
      '<div class="orale-scritto card">' +
        '<div class="type-compare"><div class="type-compare-label">' + icon('info', 13) + ' Orale</div><div class="type-compare-value">' + (oral != null ? fmtAverage(oral) : '—') + '</div><div class="type-compare-count">' + oralCount + (oralCount === 1 ? ' voto' : ' voti') + '</div>' +
          '<div class="type-bar"><span style="transform:scaleX(' + (oral != null ? clamp(oral / 10, 0, 1) : 0).toFixed(3) + ')"></span></div></div>' +
        '<div class="type-compare"><div class="type-compare-label">' + icon('edit', 13) + ' Scritto</div><div class="type-compare-value">' + (written != null ? fmtAverage(written) : '—') + '</div><div class="type-compare-count">' + writtenCount + (writtenCount === 1 ? ' voto' : ' voti') + '</div>' +
          '<div class="type-bar"><span style="transform:scaleX(' + (written != null ? clamp(written / 10, 0, 1) : 0).toFixed(3) + ')"></span></div></div>' +
        (!oralCount || !writtenCount ? '<p class="tiny muted full" style="grid-column:1/-1">Aggiungi voti con tipo “orale” o “scritto” per un confronto completo.</p>' : '') +
      '</div></div>';

    return html + '</div>';
  }

  /* ---------- Simulatore ---------- */

  function simScopeSubject() {
    if (state.simScope === 'all') return null;
    return getSubject(state.simScope);
  }

  function actualForScope(scope) {
    const all = activeGrades();
    if (scope === 'all') return all;
    return all.filter((g) => g.subjectId === scope);
  }

  function scenariosForScope(scope) {
    if (scope === 'all') return state.scenarios;
    return state.scenarios.filter((item) => item.subjectId === scope);
  }

  function scenarioMean(scope) {
    const actual = actualForScope(scope);
    const scenarios = scenariosForScope(scope);
    const combined = actual.concat(scenarios.map((item) => ({
      value: item.value,
      weight: item.weight
    })));
    return {
      actual: actual,
      scenarios: scenarios,
      currentMean: meanOf(actual),
      newMean: meanOf(combined)
    };
  }

  function simScopeOptionsHTML(selected) {
    return '<option value="all"' + (selected === 'all' ? ' selected' : '') + '>Generale</option>' +
      state.subjects.map((subject) => '<option value="' + escapeHTML(subject.id) + '"' + (selected === subject.id ? ' selected' : '') + '>' + escapeHTML(subject.nome) + '</option>').join('');
  }

  function renderWhatIf() {
    if (!state.subjects.length) {
      return '<div class="empty-state card mt-16">' +
        '<div class="empty-illustration" aria-hidden="true">' + icon('calc', 36) + '</div>' +
        '<h2>Prima crea una materia</h2>' +
        '<p>Il simulatore ha bisogno di almeno una materia per calcolare una media ipotetica.</p>' +
        '<button class="button primary" type="button" data-action="add-subject">' + icon('plus', 18) + ' Aggiungi materia</button>' +
      '</div>';
    }
    if (state.simScope !== 'all' && !getSubject(state.simScope)) state.simScope = 'all';
    const data = scenarioMean(state.simScope);
    const delta = data.newMean != null && data.currentMean != null ? data.newMean - data.currentMean : null;
    const deltaClass = delta == null || Math.abs(delta) < 0.005 ? 'flat' : delta > 0 ? '' : 'down';
    const scopeSubject = simScopeSubject();
    const label = scopeSubject ? scopeSubject.nome : 'Generale';
    const scenarioList = data.scenarios.length
      ? '<div class="scenario-list">' + data.scenarios.map((item) => {
        const subject = getSubject(item.subjectId);
        return '<div class="scenario-row">' +
          '<div class="scenario-subject"><span class="subject-dot" style="background:' + escapeHTML(subject ? subject.colore : '#0B5ED7') + '"></span><span><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHTML(subject ? subject.nome : 'Materia') + '</span><span class="scenario-meta">Peso ' + fmtWeight(item.weight) + '</span></span></div>' +
          '<span class="scenario-value">' + escapeHTML(item.label) + '</span>' +
          '<button class="remove-icon" type="button" data-action="remove-scenario" data-scenario-id="' + escapeHTML(item.id) + '" aria-label="Rimuovi voto ipotetico">' + icon('trash', 17) + '</button>' +
        '</div>';
      }).join('') + '</div>'
      : '<p class="small muted" style="margin-top:11px">Nessun voto ipotetico. Aggiungine uno per vedere l\'effetto sulla media.</p>';

    return '<div class="mt-12">' +
      '<div class="scenario-summary">' +
        '<div class="scope-row"><span class="scope-label">Stai simulando</span><select class="scope-select" data-sim-scope aria-label="Ambito della simulazione">' + simScopeOptionsHTML(state.simScope) + '</select></div>' +
        '<div class="scenario-main"><div><div class="scenario-average-label">Nuova media ' + escapeHTML(label.toLowerCase()) + '</div>' +
          '<div class="scenario-average" data-sim-average="' + (data.newMean == null ? '' : data.newMean) + '">' + (data.newMean == null ? '—' : fmtAverage(data.newMean)) + '</div></div>' +
          '<span class="scenario-delta ' + deltaClass + '">' + (delta == null ? icon('minus', 12) : delta > 0 ? icon('arrowUp', 12) : icon('arrowDown', 12)) + ' ' + (delta == null ? 'delta —' : fmtDelta(delta)) + '</span>' +
        '</div>' +
        '<div class="scenario-compare">' +
          '<div><div class="scenario-mini-label">Media attuale</div><div class="scenario-mini-value">' + (data.currentMean == null ? '—' : fmtAverage(data.currentMean)) + ' <small>' + data.actual.length + ' voti</small></div></div>' +
          '<div><div class="scenario-mini-label">Ipotesi</div><div class="scenario-mini-value">' + data.scenarios.length + ' <small>' + (data.scenarios.length === 1 ? 'voto' : 'voti') + '</small></div></div>' +
        '</div>' +
      '</div>' +
      '<div class="scenario-actions">' +
        '<button class="button primary" type="button" data-action="add-scenario">' + icon('plus', 17) + ' Aggiungi ipotesi</button>' +
        (state.scenarios.length ? '<button class="button ghost" type="button" data-action="clear-scenarios">Azzera</button>' : '') +
      '</div>' +
      '<div class="card card-block mt-12"><h2>Voti ipotetici</h2><p>Gli scenari sono temporanei e non vengono salvati.</p>' + scenarioList + '</div>' +
      '<div class="hint mt-12">' + icon('info', 16) + '<span>La media usa gli stessi pesi dei voti reali. Se scegli una materia, nel confronto contano solo le ipotesi di quella materia.</span></div>' +
    '</div>';
  }

  function neededResultData() {
    const target = parseDecimalInput(state.simTarget);
    const count = Number(state.simCount);
    const weight = parseDecimalInput(state.simWeight);
    if (state.simTarget.trim() === '') {
      return { status: 'empty', message: 'Inserisci l\'obiettivo di media che vuoi raggiungere.' };
    }
    if (!Number.isFinite(target) || target < 0 || target > 10) {
      return { status: 'invalid', message: 'L\'obiettivo deve essere un numero tra 0 e 10.' };
    }
    if (!Number.isInteger(count) || count < 1 || count > 60) {
      return { status: 'invalid', message: 'Inserisci un numero di voti futuri tra 1 e 60.' };
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      return { status: 'invalid', message: 'Il peso dei voti futuri deve essere maggiore di zero.' };
    }
    const scope = state.simScope;
    const actual = actualForScope(scope);
    const sums = sumAndWeight(actual);
    const current = sums.weight > 0 ? sums.sum / sums.weight : null;
    if (current != null && current >= target - 1e-9) {
      return {
        status: 'reached',
        current,
        target,
        scope,
        message: 'Obiettivo già raggiunto: la media attuale è ' + fmtAverage(current) + ', pari o superiore all\'obiettivo.'
      };
    }
    const newWeight = count * weight;
    const required = (target * (sums.weight + newWeight) - sums.sum) / newWeight;
    if (required < 0) {
      return {
        status: 'reached',
        current,
        target,
        scope,
        message: 'Obiettivo già raggiunto con i voti attuali.'
      };
    }
    if (required > 10 + 1e-9) {
      return {
        status: 'impossible',
        current,
        target,
        scope,
        required,
        message: 'Impossibile: servirebbe una media di ' + fmt2(required) + ' nei prossimi voti, oltre il massimo di 10.'
      };
    }
    // Il voto mostrato è arrotondato verso l'alto al quarto disponibile:
    // così la media richiesta è davvero raggiungibile con una label ammessa.
    const minimum = Math.min(10, Math.ceil((required - 1e-9) * 4) / 4);
    return {
      status: 'possible',
      current,
      target,
      scope,
      required,
      minimum,
      label: valueToLabel(minimum),
      count,
      weight,
      message: 'Ti serve una media di almeno ' + fmt2(minimum) + ' nei prossimi ' + count + ' ' + (count === 1 ? 'voto' : 'voti') + '.' +
        (Math.abs(minimum - required) > 0.001 ? ' Calcolo esatto: ' + fmt2(required) + '.' : '')
    };
  }

  function neededResultHTML() {
    const result = neededResultData();
    if (result.status === 'invalid' || result.status === 'empty') {
      return '<div class="result-card visible' + (result.status === 'invalid' ? ' impossible' : '') + '">' +
        '<div class="result-kicker">' + (result.status === 'invalid' ? 'Controlla i dati' : 'Risultato') + '</div>' +
        '<p class="result-text" style="margin-top:5px">' + escapeHTML(result.message) + '</p></div>';
    }
    if (result.status === 'reached') {
      return '<div class="result-card visible reached"><div class="result-kicker">Obiettivo</div><div class="result-main"><span class="result-value">Già</span><span class="result-label">raggiunto</span></div>' +
        '<p class="result-text">' + escapeHTML(result.message) + '</p></div>';
    }
    if (result.status === 'impossible') {
      return '<div class="result-card visible impossible"><div class="result-kicker">Obiettivo</div><div class="result-main"><span class="result-value" style="font-size:28px">Impossibile</span></div>' +
        '<p class="result-text">' + escapeHTML(result.message) + '</p></div>';
    }
    return '<div class="result-card visible success">' +
      '<div class="result-kicker">Voto necessario</div>' +
      '<div class="result-main"><span class="result-value">' + fmt2(result.minimum) + '</span><span class="result-label">' + escapeHTML(result.label) + '</span></div>' +
      '<p class="result-text">' + escapeHTML(result.message) + '</p>' +
      '<div class="calc-formula">Formula: (obiettivo × peso totale − somma pesata attuale) ÷ peso dei nuovi voti. Il risultato indicato è arrotondato al quarto superiore.</div>' +
    '</div>';
  }

  function updateNeededResult() {
    const box = $('#neededResult', els.stage);
    if (box) box.innerHTML = neededResultHTML();
  }

  function renderNeededGrade() {
    if (!state.subjects.length) {
      return '<div class="empty-state card mt-16">' +
        '<div class="empty-illustration" aria-hidden="true">' + icon('scale', 36) + '</div>' +
        '<h2>Serve almeno una materia</h2>' +
        '<p>Per calcolare il voto necessario devi avere una materia su cui fare il calcolo.</p>' +
        '<button class="button primary" type="button" data-action="add-subject">' + icon('plus', 18) + ' Aggiungi materia</button>' +
      '</div>';
    }
    if (state.simScope !== 'all' && !getSubject(state.simScope)) state.simScope = 'all';
    const actual = actualForScope(state.simScope);
    return '<div class="card calc-card mt-12">' +
      '<h2 style="font-size:14px;font-weight:720">Quanto devo prendere?</h2>' +
      '<p class="small muted" style="margin-top:3px">Scegli l\'obiettivo e ipotizza i prossimi voti. Il calcolo si aggiorna mentre scrivi.</p>' +
      '<form class="calc-form-grid" data-form="needed" novalidate>' +
        '<div class="field full"><label for="neededTarget">Obiettivo di media</label><input class="input" id="neededTarget" type="text" inputmode="decimal" placeholder="es. 7,50" value="' + escapeHTML(state.simTarget) + '" data-calc-field="target"></div>' +
        '<div class="field full"><label for="neededScope">Ambito</label><select class="select" id="neededScope" data-calc-field="scope">' + simScopeOptionsHTML(state.simScope) + '</select></div>' +
        '<div class="field"><label for="neededCount">Voti futuri</label><input class="input" id="neededCount" type="number" min="1" max="60" step="1" inputmode="numeric" value="' + escapeHTML(state.simCount) + '" data-calc-field="count"></div>' +
        '<div class="field"><label for="neededWeight">Peso di ciascuno</label><input class="input" id="neededWeight" type="text" inputmode="decimal" value="' + escapeHTML(state.simWeight) + '" data-calc-field="weight"></div>' +
        '<div class="full"><div class="hint">' + icon('info', 16) + '<span>Il peso è quello di ogni singolo voto futuro. La media richiesta vale per tutti i voti ipotizzati.</span></div></div>' +
        '<div class="full"><button class="button primary block" type="submit">Calcola voto necessario</button></div>' +
      '</form>' +
      '<div id="neededResult">' + neededResultHTML() + '</div>' +
      '<p class="tiny muted" style="margin-top:11px">Nel calcolo rientrano i voti attuali dell\'ambito scelto. ' + actual.length + ' voti considerati.</p>' +
    '</div>';
  }

  function renderSimulate() {
    let html = '<div class="view-inner">' + storageWarningHTML();
    html += '<div class="page-heading"><div><h1>Simula</h1><p>Prova uno scenario prima di viverlo.</p></div><span class="pill blue">' + icon('spark', 12) + ' non salva</span></div>';
    html += '<div class="sim-tabs" role="tablist" aria-label="Modalità di simulazione">' +
      '<button class="sim-tab" type="button" role="tab" aria-selected="' + (state.simMode === 'whatif' ? 'true' : 'false') + '" data-action="sim-mode" data-value="whatif">' + icon('spark', 14) + ' What-if</button>' +
      '<button class="sim-tab" type="button" role="tab" aria-selected="' + (state.simMode === 'needed' ? 'true' : 'false') + '" data-action="sim-mode" data-value="needed">' + icon('target', 14) + ' Voto necessario</button>' +
    '</div>';
    html += state.simMode === 'needed' ? renderNeededGrade() : renderWhatIf();
    return html + '</div>';
  }

  /* ---------- Impostazioni ---------- */

  function renderSettings() {
    const hasIssues = !!state.storageIssue;
    const rounding = state.settingsRoundingDraft || state.settings.arrotondamentoVisuale;
    const subjectRows = state.subjects.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    let html = '<div class="settings-view">' + storageWarningHTML();
    html += '<div class="settings-heading"><h1>Impostazioni</h1><p>Materie, criteri di calcolo e backup. I dati restano sempre sul dispositivo.</p></div>';

    html += '<section class="card settings-section">' +
      '<div class="settings-section-head"><div><h2>Materie</h2><p>' + state.subjects.length + (state.subjects.length === 1 ? ' materia' : ' materie') + ' nel registro</p></div>' +
        '<button class="button small secondary" type="button" data-action="add-subject">' + icon('plus', 15) + ' Aggiungi</button></div>' +
      '<div class="settings-body">' +
        (subjectRows.length
          ? subjectRows.map((subject) => {
            const grades = gradesForSubject(subject.id, activeGrades());
            const mean = meanOf(grades);
            const meta = grades.length + (grades.length === 1 ? ' voto' : ' voti') +
              (mean != null ? ' · media ' + fmtAverage(mean) : '') +
              (subject.obiettivo != null ? ' · obiettivo ' + fmtAverage(subject.obiettivo) : '');
            return '<button class="subject-admin-row" type="button" data-action="edit-subject" data-subject-id="' + escapeHTML(subject.id) + '">' +
              '<span class="subject-dot" style="background:' + escapeHTML(subject.colore) + '"></span>' +
              '<span class="subject-admin-copy"><span class="subject-admin-name">' + escapeHTML(subject.nome) + '</span><span class="subject-admin-meta">' + escapeHTML(meta) + '</span></span>' +
              icon('chevronRight', 17) +
            '</button>';
          }).join('')
          : '<div class="empty-state mini" style="padding-left:0;padding-right:0"><div class="empty-illustration" aria-hidden="true">' + icon('book', 25) + '</div><h2>Nessuna materia</h2><p>Aggiungi le materie che vuoi seguire durante l\'anno.</p></div>') +
      '</div>' +
    '</section>';

    html += '<section class="card settings-section">' +
      '<div class="settings-section-head"><div><h2>Criteri e obiettivi</h2><p>Come vengono lette le medie.</p></div></div>' +
      '<form class="settings-body" data-form="settings" novalidate>' +
        '<div class="field"><label for="settingsGoal">Obiettivo media generale <span class="optional">facoltativo</span></label>' +
          '<input class="input" id="settingsGoal" type="text" inputmode="decimal" placeholder="Nessun obiettivo" value="' + (state.settings.obiettivoGenerale != null ? fmt2(state.settings.obiettivoGenerale) : '') + '" data-settings-field="goal">' +
          '<p class="field-error" data-error-for="goal" hidden></p>' +
          '<span class="field-help">Se lo imposti, vedrai il delta nella Home e la linea obiettivo nei grafici.</span></div>' +
        '<div class="field mt-12"><label for="settingsThreshold">Soglia di sufficienza</label>' +
          '<input class="input" id="settingsThreshold" type="text" inputmode="decimal" value="' + fmt2(state.settings.sogliaSufficienza) + '" data-settings-field="threshold">' +
          '<p class="field-error" data-error-for="threshold" hidden></p>' +
          '<span class="field-help">Default 6. Può essere cambiata in base al tuo istituto.</span></div>' +
        '<div class="mt-16"><span class="setting-group-label">Arrotondamento visuale</span><div class="rounding-options" role="group" aria-label="Arrotondamento visuale">' +
          '<button class="rounding-option" type="button" data-action="rounding-choice" data-value="dueDecimali" aria-pressed="' + (rounding === 'dueDecimali' ? 'true' : 'false') + '"><strong>2 decimali</strong><span>6,75</span></button>' +
          '<button class="rounding-option" type="button" data-action="rounding-choice" data-value="quarti" aria-pressed="' + (rounding === 'quarti' ? 'true' : 'false') + '"><strong>Quarti</strong><span>6,75</span></button>' +
          '<button class="rounding-option" type="button" data-action="rounding-choice" data-value="mezzi" aria-pressed="' + (rounding === 'mezzi' ? 'true' : 'false') + '"><strong>Mezzi</strong><span>6,50</span></button>' +
        '</div><p class="field-help" style="margin-top:5px">Solo visuale: i calcoli usano sempre il valore completo.</p></div>' +
        '<button class="button primary block mt-16" type="submit">Salva preferenze</button>' +
      '</form>' +
    '</section>';

    html += '<section class="card settings-section">' +
      '<div class="settings-section-head"><div><h2>Backup e ripristino</h2><p>Un file JSON contiene tutti i tuoi dati.</p></div></div>' +
      '<div class="settings-body">' +
        (state.importError ? '<div class="notice danger" role="alert" style="margin-bottom:12px">' + icon('alert', 18) + '<span>' + escapeHTML(state.importError) + '</span></div>' : '') +
        '<div class="data-actions">' +
          '<button class="button secondary" type="button" data-action="export">' + icon('download', 17) + ' Esporta JSON</button>' +
          '<button class="button ghost" type="button" data-action="import">' + icon('upload', 17) + ' Importa JSON</button>' +
        '</div>' +
        '<div class="backup-note">' + icon('info', 14) + '<span>Importare un backup sostituisce i dati attuali. Prima di confermare viene controllato il formato.</span></div>' +
        '<div class="settings-divider"></div>' +
        '<div class="settings-row" style="border-top:0"><div class="settings-row-copy"><strong>Ripristino completo</strong><span>Cancella voti, materie e impostazioni da questo browser.</span></div>' +
          '<button class="button small danger soft" type="button" data-action="reset-data">' + icon('trash', 15) + ' Reimposta</button></div>' +
      '</div>' +
    '</section>';

    html += '<section class="card settings-section privacy-card">' +
      '<div class="settings-body">' +
        '<div class="privacy-badge" style="margin-top:0"><span class="privacy-icon">' + icon('shield', 22) + '</span><div><strong>I dati restano sul tuo dispositivo</strong><p>I voti sono salvati solo nel browser di questo dispositivo. Svuotare i dati del sito li cancella definitivamente. Esporta un backup regolarmente.</p></div></div>' +
        '<div class="schema-row"><span>Versione schema dati</span><span>schemaVersion ' + SCHEMA_VERSION + '</span></div>' +
        (!hasIssues ? '<div class="schema-row" style="margin-top:7px;padding-top:7px"><span>Spazio di archiviazione</span><span>locale · 100% offline</span></div>' : '') +
      '</div>' +
    '</section>';

    html += '<p class="tiny muted" style="text-align:center;padding:22px 4px 6px">Registro voti · nessun account, nessuna connessione richiesta.</p>';
    return html + '</div>';
  }

  /* ---------- Bottom sheet ---------- */

  function setAppInert(value) {
    try {
      els.shell.inert = !!value;
    } catch (err) {
      /* inert non disponibile: la modale resta comunque sopra il contenuto */
    }
  }

  function openSheet(config) {
    const cfg = config || {};
    state.sheet.open = true;
    state.sheet.mode = cfg.mode || null;
    state.sheet.gradeId = cfg.gradeId || null;
    state.sheet.onSaved = cfg.onSaved || null;
    state.sheet.returnFocus = captureFocusTarget(null);
    els.sheetOverlay.hidden = false;
    els.sheetOverlay.classList.remove('closing');
    if (state.fabMenuOpen) closeFabMenu();
    requestAnimationFrame(() => els.sheetOverlay.classList.add('open'));
    setAppInert(true);
    window.setTimeout(focusSheet, 260);
  }

  function focusSheet() {
    if (!state.sheet.open) return;
    const target = els.sheetBody.querySelector('[data-autofocus]') || els.sheet;
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
  }

  // Il click su touch spesso non sposta il focus (body resta attivo): in quel
  // caso si usa un riferimento stabile legato all'elemento appena aperto.
  function captureFocusTarget(preferred) {
    const active = document.activeElement;
    // Il menu del FAB si chiude all'apertura del foglio: non è un buon ritorno.
    const inClosingMenu = active && active.closest && active.closest('#fabMenu');
    if (active && !inClosingMenu && active !== document.body && active !== document.documentElement && typeof active.focus === 'function') {
      return active;
    }
    if (preferred && typeof preferred.focus === 'function') return preferred;
    if (els.fab && !els.fab.hidden) return els.fab;
    return els.main;
  }

  // Dopo un re-render il nodo che aveva il focus può essere stato sostituito.
  // Si prova a ritrovare l'equivalente logico prima di ripiegare su FAB/main.
  function resolveReturnFocus(target) {
    if (target === document.body || target === document.documentElement) target = null;
    if (target && document.contains(target) && typeof target.focus === 'function') return target;
    const data = target && target.dataset ? target.dataset : {};
    if (data.gradeId) {
      const row = $$('.grade-row').find((el) => el.dataset.gradeId === data.gradeId);
      if (row) return row;
    }
    if (data.subjectId) {
      const subjectRow = $$('[data-action="edit-subject"]').find((el) => el.dataset.subjectId === data.subjectId);
      if (subjectRow) return subjectRow;
    }
    if (data.action) {
      const actionEl = $('[data-action="' + data.action + '"]');
      if (actionEl) return actionEl;
    }
    if (target && target.id) {
      const byId = document.getElementById(target.id);
      if (byId) return byId;
    }
    if (els.fab && !els.fab.hidden) return els.fab;
    return els.main;
  }

  function closeSheet() {
    if (!state.sheet.open) return;
    state.sheet.open = false;
    els.sheetOverlay.classList.add('closing');
    els.sheetOverlay.classList.remove('open');
    els.sheet.style.transition = '';
    els.sheet.style.transform = '';
    const backdrop = $('.sheet-backdrop', els.sheetOverlay);
    if (backdrop) backdrop.style.opacity = '';
    window.setTimeout(() => {
      if (state.sheet.open) return;
      els.sheetOverlay.hidden = true;
      els.sheetOverlay.classList.remove('closing');
      setAppInert(false);
      const focusTarget = resolveReturnFocus(state.sheet.returnFocus);
      if (focusTarget && typeof focusTarget.focus === 'function') {
        try { focusTarget.focus({ preventScroll: true }); } catch (err) { focusTarget.focus(); }
      }
      state.sheet.mode = null;
      state.sheet.gradeId = null;
      state.sheet.onSaved = null;
    }, 290);
  }

  function setSheetContent(config) {
    els.sheetEyebrow.textContent = config.eyebrow || '';
    els.sheetTitle.textContent = config.title || '';
    els.sheetBody.innerHTML = config.body || '';
    els.sheetFooter.innerHTML = config.footer || '';
    els.sheetFooter.hidden = !config.footer;
    els.sheetBody.classList.remove('swap-anim');
    void els.sheetBody.offsetWidth;
    els.sheetBody.classList.add('swap-anim');
    els.sheetBody.scrollTop = 0;
    if (config.focus !== false) window.setTimeout(focusSheet, 60);
  }

  function flashSuccess() {
    els.successOverlay.classList.remove('show');
    void els.successOverlay.offsetWidth;
    els.successOverlay.classList.add('show');
    window.setTimeout(() => els.successOverlay.classList.remove('show'), 620);
  }

  /* ---------- Picker voto ---------- */

  function gradePickerHTML(intValue, mod) {
    let integers = '';
    for (let i = 0; i <= 10; i += 1) {
      integers += '<button type="button" class="grade-choice" data-action="picker-int" data-value="' + i + '" aria-pressed="' + (intValue === i ? 'true' : 'false') + '" aria-label="Voto ' + i + '">' + i + '</button>';
    }
    const modifiers = [
      { value: '', label: 'Nessuno', symbol: '=' },
      { value: '-', label: 'Meno un quarto', symbol: '−' },
      { value: 'half', label: 'Più mezzo', symbol: '½' },
      { value: '+', label: 'Più un quarto', symbol: '+' }
    ];
    const modifierHTML = modifiers.map((modifier) => {
      const disabled = modifierDisabled(intValue, modifier.value);
      const pressed = (mod || '') === modifier.value;
      return '<button type="button" class="modifier-choice" data-action="picker-mod" data-value="' + modifier.value + '" aria-pressed="' + (pressed ? 'true' : 'false') + '" aria-label="' + escapeHTML(modifier.label) + '"' + (disabled ? ' disabled' : '') + '>' +
        (modifier.value === '' ? 'Nessuno' : '<span class="mod-symbol">' + modifier.symbol + '</span>') + '</button>';
    }).join('');
    const computed = computePickerValue(intValue, mod);
    const label = pickerLabel(intValue, mod);
    const preview = intValue == null
      ? '<span class="grade-preview-empty">Scegli prima un <strong>voto intero</strong>.</span>'
      : '<span class="grade-preview-copy"><span class="grade-preview-label">Voto</span><strong class="grade-preview-value" data-picker-value>' + escapeHTML(label) + '</strong></span>' +
        '<span class="grade-preview-equivalent">= ' + fmt2(computed) + '</span>';
    return '<div class="grade-picker" data-picker>' +
      '<div class="picker-block-label"><span>1 · Scegli il voto intero</span><span>tocca un numero</span></div>' +
      '<div class="grade-integers" role="group" aria-label="Voto intero da 0 a 10">' + integers + '</div>' +
      '<div class="picker-block-label" style="margin-top:12px"><span>2 · Aggiungi il modificatore</span><span>facoltativo</span></div>' +
      '<div class="modifiers" role="group" aria-label="Modificatore del voto">' + modifierHTML + '</div>' +
      '<div class="grade-preview" aria-live="polite">' + preview + '</div>' +
      '<p class="field-error" data-error-for="picker" hidden></p>' +
      '<p class="field-help" style="margin-top:7px">Il modificatore − non è possibile su 0. Su 10 è disponibile solo + (10+ = 10,25).</p>' +
    '</div>';
  }

  function refreshPickerPreview() {
    const picker = els.sheetBody.querySelector('[data-picker]');
    if (!picker) return;
    const intValue = state.sheet.pickerInt;
    const mod = state.sheet.pickerMod;
    $$('[data-action="picker-int"]', picker).forEach((button) => {
      button.setAttribute('aria-pressed', Number(button.dataset.value) === intValue ? 'true' : 'false');
    });
    $$('[data-action="picker-mod"]', picker).forEach((button) => {
      const value = button.dataset.value;
      button.disabled = modifierDisabled(intValue, value);
      button.setAttribute('aria-pressed', (mod || '') === value ? 'true' : 'false');
    });
    const preview = $('.grade-preview', picker);
    if (!preview) return;
    const computed = computePickerValue(intValue, mod);
    const label = pickerLabel(intValue, mod);
    if (intValue == null) {
      preview.innerHTML = '<span class="grade-preview-empty">Scegli prima un <strong>voto intero</strong>.</span>';
    } else {
      preview.innerHTML = '<span class="grade-preview-copy"><span class="grade-preview-label">Voto</span><strong class="grade-preview-value" data-picker-value>' + escapeHTML(label) + '</strong></span>' +
        '<span class="grade-preview-equivalent">= ' + fmt2(computed) + '</span>';
      const valueEl = $('[data-picker-value]', preview);
      if (valueEl && !prefersReducedMotion()) {
        valueEl.classList.remove('pop');
        void valueEl.offsetWidth;
        valueEl.classList.add('pop');
      }
    }
    updateGradeSaveButtons();
    updateScenarioSaveButton();
  }

  /* ---------- Form voto ---------- */

  function gradeDraftDefaults() {
    return {
      subjectId: state.subjects.length === 1 ? state.subjects[0].id : '',
      date: todayISO(),
      type: '',
      weight: '100',
      description: '',
      tags: ''
    };
  }

  function openGradeSheet(gradeId, options) {
    const opts = options || {};
    if (state.fabMenuOpen) closeFabMenu();
    if (!state.subjects.length) {
      openSubjectSheet(null, () => {
        refreshCurrentView(true);
        openGradeSheet(gradeId, opts);
      });
      return;
    }
    let draft = gradeDraftDefaults();
    let mode = 'new';
    let pickerInt = null;
    let pickerMod = '';
    if (gradeId) {
      const grade = state.grades.find((g) => g.id === gradeId);
      if (!grade) return;
      mode = 'edit';
      draft = {
        subjectId: grade.subjectId,
        date: grade.date,
        type: grade.type || '',
        weight: fmtWeight(grade.weight),
        description: grade.description || '',
        tags: (grade.tags || []).join(', ')
      };
      const picker = pickerFromValue(grade.value);
      pickerInt = picker.int;
      pickerMod = picker.mod;
    } else if (opts.duplicateOf) {
      const grade = state.grades.find((g) => g.id === opts.duplicateOf);
      if (grade) {
        mode = 'duplicate';
        draft = {
          subjectId: grade.subjectId,
          date: todayISO(),
          type: grade.type || '',
          weight: fmtWeight(grade.weight),
          description: grade.description || '',
          tags: (grade.tags || []).join(', ')
        };
        const picker = pickerFromValue(grade.value);
        pickerInt = picker.int;
        pickerMod = picker.mod;
      }
    }
    state.sheet.pickerInt = pickerInt;
    state.sheet.pickerMod = pickerMod;
    state.sheet.draft = draft;
    state.sheet.mode = mode;
    state.sheet.gradeId = gradeId || null;
    state.sheet.onSaved = opts.onSaved || null;
    if (!state.sheet.open) {
      const preferred = gradeId
        ? $$('.grade-row').find((el) => el.dataset.gradeId === gradeId)
        : $('[data-action="add-grade"]');
      state.sheet.returnFocus = captureFocusTarget(preferred || null);
    }
    state.sheet.open = true;
    renderGradeSheet();
    els.sheetOverlay.hidden = false;
    els.sheetOverlay.classList.remove('closing');
    requestAnimationFrame(() => els.sheetOverlay.classList.add('open'));
    setAppInert(true);
    window.setTimeout(focusSheet, 260);
  }

  function gradeSubjectFieldHTML(draft) {
    if (!state.subjects.length) {
      return '<div class="subject-inline-empty"><span>Non ci sono ancora materie.</span><button class="button small primary" type="button" data-action="add-subject-from-grade">' + icon('plus', 15) + ' Crea materia</button></div>';
    }
    return '<select class="select" id="gradeSubject" data-grade-field="subject" data-autofocus>' + subjectOptionsHTML(draft.subjectId, false) + '</select>';
  }

  function renderGradeSheet() {
    const mode = state.sheet.mode;
    const draft = state.sheet.draft || gradeDraftDefaults();
    const title = mode === 'edit' ? 'Modifica voto' : mode === 'duplicate' ? 'Duplica voto' : 'Aggiungi voto';
    const eyebrow = mode === 'edit' ? 'Dettaglio' : mode === 'duplicate' ? 'Copia' : 'Nuovo';
    const today = todayISO();
    const body = '<form id="gradeForm" data-form="grade" novalidate>' +
      '<div class="form-grid">' +
        '<div class="field full"><label for="gradeSubject">Materia</label>' + gradeSubjectFieldHTML(draft) +
          '<p class="field-error" data-error-for="subject" hidden></p></div>' +
        '<div class="field"><label for="gradeDate">Data</label><input class="input" id="gradeDate" type="date" max="' + today + '" value="' + escapeHTML(draft.date) + '" data-grade-field="date">' +
          '<p class="field-error" data-error-for="date" hidden></p></div>' +
        '<div class="field"><label for="gradeType">Tipo <span class="optional">facoltativo</span></label><select class="select" id="gradeType" data-grade-field="type">' + typeOptionsHTML(draft.type, true) + '</select></div>' +
      '</div>' +
      '<div class="form-section-title">Voto <span>notazione italiana</span></div>' +
      gradePickerHTML(state.sheet.pickerInt, state.sheet.pickerMod) +
      '<div class="form-section-title">Dettagli <span>facoltativi</span></div>' +
      '<div class="form-grid">' +
        '<div class="field"><label for="gradeWeight">Peso</label><input class="input" id="gradeWeight" type="text" inputmode="decimal" value="' + escapeHTML(draft.weight) + '" data-grade-field="weight">' +
          '<p class="field-error" data-error-for="weight" hidden></p></div>' +
        '<div class="field"><label for="gradeTags">Tag</label><input class="input" id="gradeTags" type="text" value="' + escapeHTML(draft.tags) + '" placeholder="es. ripasso, interrogazione" data-grade-field="tags"></div>' +
        '<div class="field full"><label for="gradeDescription">Descrizione</label><textarea class="textarea" id="gradeDescription" maxlength="400" placeholder="Cosa riguardava questo voto?" data-grade-field="description">' + escapeHTML(draft.description) + '</textarea></div>' +
      '</div>' +
    '</form>';
    const footer = mode === 'edit'
      ? '<button class="button secondary" type="button" data-action="delete-grade" data-grade-id="' + escapeHTML(state.sheet.gradeId) + '">' + icon('trash', 16) + ' Elimina</button>' +
        '<button class="button primary" type="button" data-action="save-grade" disabled>Salva modifiche</button>'
      : '<button class="button secondary" type="button" data-action="save-grade-add" disabled>Salva e aggiungi</button>' +
        '<button class="button primary" type="button" data-action="save-grade" disabled>Salva voto</button>';
    setSheetContent({ eyebrow, title, body, footer });
    updateGradeSaveButtons();
  }

  function updateGradeSaveButtons() {
    const form = $('#gradeForm', els.sheetBody);
    if (!form) return;
    const subject = form.querySelector('[data-grade-field="subject"]');
    const ready = !!subject && !!subject.value && state.sheet.pickerInt != null;
    $$('[data-action="save-grade"], [data-action="save-grade-add"]', els.sheetFooter).forEach((button) => {
      button.disabled = !ready;
    });
  }

  function setFieldError(form, name, message) {
    if (!form) return;
    const field = form.querySelector('[data-grade-field="' + name + '"]') || form.querySelector('[data-settings-field="' + name + '"]') || form.querySelector('[data-subject-field="' + name + '"]') || form.querySelector('[data-scenario-field="' + name + '"]');
    const error = form.querySelector('[data-error-for="' + name + '"]') || els.sheetBody.querySelector('[data-error-for="' + name + '"]');
    if (field) {
      field.classList.add('invalid');
      field.setAttribute('aria-invalid', 'true');
    }
    if (error) {
      error.innerHTML = escapeHTML(message);
      error.hidden = false;
    }
  }

  function clearFieldErrors(root) {
    $$('.invalid', root || els.sheetBody).forEach((field) => {
      field.classList.remove('invalid');
      field.removeAttribute('aria-invalid');
    });
    $$('[data-error-for]', root || els.sheetBody).forEach((error) => {
      error.hidden = true;
      error.textContent = '';
    });
  }

  function readGradeForm() {
    const form = $('#gradeForm', els.sheetBody);
    if (!form) return null;
    const field = (name) => form.querySelector('[data-grade-field="' + name + '"]');
    return {
      subjectId: field('subject') ? field('subject').value : '',
      date: field('date') ? field('date').value : '',
      type: field('type') ? field('type').value : '',
      weight: field('weight') ? field('weight').value : '',
      description: field('description') ? field('description').value.trim() : '',
      tags: field('tags') ? field('tags').value : '',
      form
    };
  }

  function parseTags(raw) {
    return String(raw || '')
      .split(/[,;\n]/)
      .map((tag) => tag.trim())
      .filter((tag, index, list) => tag && list.indexOf(tag) === index)
      .slice(0, 20);
  }

  function validateGradeForm(data) {
    clearFieldErrors();
    let valid = true;
    if (!data.subjectId || !getSubject(data.subjectId)) {
      setFieldError(data.form, 'subject', 'Scegli una materia.');
      valid = false;
    }
    if (state.sheet.pickerInt == null) {
      const error = els.sheetBody.querySelector('[data-error-for="picker"]');
      if (error) {
        error.textContent = 'Scegli un voto intero e, se vuoi, un modificatore.';
        error.hidden = false;
      }
      valid = false;
    }
    if (!data.date) {
      setFieldError(data.form, 'date', 'Inserisci una data.');
      valid = false;
    } else if (data.date > todayISO()) {
      setFieldError(data.form, 'date', 'La data non può essere nel futuro.');
      valid = false;
    }
    const weight = parseDecimalInput(data.weight);
    if (!Number.isFinite(weight) || weight <= 0) {
      setFieldError(data.form, 'weight', 'Il peso deve essere un numero maggiore di zero.');
      valid = false;
    }
    return valid;
  }

  function saveGrade(closeAfter, keepOpen) {
    const data = readGradeForm();
    if (!data) return;
    if (!validateGradeForm(data)) return;
    if (!canWrite()) return;
    const wasEdit = state.sheet.mode === 'edit';
    const weight = parseDecimalInput(data.weight);
    const value = computePickerValue(state.sheet.pickerInt, state.sheet.pickerMod);
    const label = pickerLabel(state.sheet.pickerInt, state.sheet.pickerMod);
    const now = new Date().toISOString();
    const grades = state.grades.slice();
    let savedId;
    if (state.sheet.mode === 'edit' && state.sheet.gradeId) {
      const index = grades.findIndex((g) => g.id === state.sheet.gradeId);
      if (index < 0) return;
      grades[index] = {
        ...grades[index],
        subjectId: data.subjectId,
        value,
        label,
        date: data.date,
        type: data.type || null,
        weight,
        description: data.description,
        tags: parseTags(data.tags),
        updatedAt: now
      };
      savedId = grades[index].id;
    } else {
      const grade = {
        id: uid('g'),
        subjectId: data.subjectId,
        value,
        label,
        date: data.date,
        type: data.type || null,
        weight,
        description: data.description,
        tags: parseTags(data.tags),
        createdAt: now,
        updatedAt: now
      };
      grades.push(grade);
      savedId = grade.id;
    }
    if (!commitData({ grades })) return;
    state.newGradeId = savedId;
    state.fabPulseStopped = true;
    refreshCurrentView(true);
    flashSuccess();
    if (closeAfter) {
      closeSheet();
      window.setTimeout(() => showToast(wasEdit ? 'Voto aggiornato.' : 'Voto salvato.', 'success'), 120);
    } else {
      // Salva e aggiungi un altro: si conservano materia, data, tipo e peso,
      // mentre voto, descrizione e tag tornano vuoti.
      state.sheet.draft = {
        subjectId: data.subjectId,
        date: data.date,
        type: data.type,
        weight: data.weight,
        description: '',
        tags: ''
      };
      state.sheet.mode = 'new';
      state.sheet.gradeId = null;
      state.sheet.pickerInt = null;
      state.sheet.pickerMod = '';
      renderGradeSheet();
      window.setTimeout(() => showToast('Salvato. Aggiungi il prossimo voto.', 'success'), 120);
    }
  }

  /* ---------- Dettaglio voto ---------- */

  function openGradeDetail(gradeId) {
    const grade = state.grades.find((g) => g.id === gradeId);
    if (!grade) return;
    if (state.fabMenuOpen) closeFabMenu();
    const subject = getSubject(grade.subjectId);
    const chips = [];
    if (grade.type && TYPE_LABELS[grade.type]) chips.push('<span class="pill blue">' + escapeHTML(TYPE_LABELS[grade.type]) + '</span>');
    if (Number(grade.weight) !== 100) chips.push('<span class="pill">Peso ' + escapeHTML(fmtWeight(grade.weight)) + '</span>');
    chips.push('<span class="pill">' + escapeHTML(formatDateLong(grade.date)) + '</span>');
    const tags = grade.tags && grade.tags.length
      ? '<div class="tag-list">' + grade.tags.map((tag) => '<span class="tag">' + escapeHTML(tag) + '</span>').join('') + '</div>'
      : '<span class="muted small">Nessun tag</span>';
    const body = '<div class="detail-hero" data-detail-hero>' +
        '<span class="detail-value">' + escapeHTML(grade.label) + '</span>' +
        '<div class="detail-main">' +
          '<div class="detail-subject"><span class="subject-dot" style="background:' + escapeHTML(subject ? subject.colore : '#0B5ED7') + '"></span><span>' + escapeHTML(subject ? subject.nome : 'Materia eliminata') + '</span></div>' +
          '<div class="detail-value-num">Vale ' + fmt2(grade.value) + '</div>' +
          '<div class="detail-chips">' + chips.join('') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="detail-grid">' +
        (grade.description ? '<div class="detail-field full"><div class="detail-field-label">Descrizione</div><div class="detail-field-value">' + escapeHTML(grade.description) + '</div></div>' : '') +
        '<div class="detail-field"><div class="detail-field-label">Tag</div><div class="detail-field-value">' + tags + '</div></div>' +
        '<div class="detail-field"><div class="detail-field-label">Registrato il</div><div class="detail-field-value">' + escapeHTML(formatDateLong((grade.createdAt || '').slice(0, 10))) + '</div></div>' +
      '</div>' +
      '<div class="detail-actions">' +
        '<button class="button primary" type="button" data-action="edit-grade" data-grade-id="' + escapeHTML(grade.id) + '">' + icon('edit', 16) + ' Modifica</button>' +
        '<button class="button secondary" type="button" data-action="duplicate-grade" data-grade-id="' + escapeHTML(grade.id) + '">' + icon('copy', 16) + ' Duplica</button>' +
        '<button class="button danger soft full" type="button" data-action="delete-grade" data-grade-id="' + escapeHTML(grade.id) + '">' + icon('trash', 16) + ' Elimina voto</button>' +
      '</div>';
    state.sheet.mode = 'detail';
    state.sheet.gradeId = grade.id;
    if (!state.sheet.open) {
      const row = $$('.grade-row').find((el) => el.dataset.gradeId === grade.id);
      state.sheet.returnFocus = captureFocusTarget(row || null);
    }
    state.sheet.open = true;
    setSheetContent({ eyebrow: 'Voto', title: subject ? subject.nome : 'Dettaglio', body, footer: '' });
    els.sheetOverlay.hidden = false;
    els.sheetOverlay.classList.remove('closing');
    requestAnimationFrame(() => els.sheetOverlay.classList.add('open'));
    setAppInert(true);
  }

  async function confirmDeleteGrade(gradeId) {
    const grade = state.grades.find((g) => g.id === gradeId);
    if (!grade) return;
    // La riga fa un breve shake prima di mostrare la conferma.
    const row = document.querySelector('.grade-row[data-grade-id="' + (window.CSS && CSS.escape ? CSS.escape(gradeId) : gradeId) + '"]');
    const hero = els.sheetBody.querySelector('[data-detail-hero]');
    if (hero) hero.classList.add('is-shaking');
    closeSheet();
    if (row) {
      row.classList.add('is-shaking');
      window.setTimeout(() => row.classList.remove('is-shaking'), 220);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 210));
    const ok = await showConfirm({
      title: 'Eliminare questo voto?',
      message: 'Il voto del ' + formatDateLong(grade.date) + ' (' + grade.label + ') verrà rimosso. L\'operazione non può essere annullata.',
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;
    if (row) row.classList.add('is-removing');
    window.setTimeout(() => {
      const grades = state.grades.filter((g) => g.id !== gradeId);
      if (commitData({ grades })) {
        refreshCurrentView(true);
        const focusTarget = resolveReturnFocus(state.sheet.returnFocus);
        if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
        showToast('Voto eliminato.', 'success');
      } else if (row) {
        row.classList.remove('is-removing');
      }
    }, row ? 260 : 0);
  }

  /* ---------- Form materia ---------- */

  function openSubjectSheet(subjectId, onSaved) {
    const subject = subjectId ? state.subjects.find((s) => s.id === subjectId) : null;
    if (state.fabMenuOpen) closeFabMenu();
    state.sheet.mode = subject ? 'subject-edit' : 'subject-new';
    state.sheet.subjectId = subject ? subject.id : null;
    state.sheet.subjectColor = subject ? subject.colore : SUBJECT_COLORS[state.subjects.length % SUBJECT_COLORS.length];
    state.sheet.onSaved = onSaved || null;
    if (!state.sheet.open) {
      const preferred = subject
        ? $$('[data-action="edit-subject"]').find((el) => el.dataset.subjectId === subject.id)
        : $('[data-action="add-subject"]');
      state.sheet.returnFocus = captureFocusTarget(preferred || null);
    }
    state.sheet.open = true;
    renderSubjectSheet(subject);
    els.sheetOverlay.hidden = false;
    els.sheetOverlay.classList.remove('closing');
    requestAnimationFrame(() => els.sheetOverlay.classList.add('open'));
    setAppInert(true);
    window.setTimeout(focusSheet, 260);
  }

  function renderSubjectSheet(subject) {
    const gradeCount = subject ? gradesForSubject(subject.id, state.grades).length : 0;
    const body = '<form id="subjectForm" data-form="subject" novalidate>' +
      '<div class="field"><label for="subjectName">Nome materia</label><input class="input" id="subjectName" type="text" maxlength="60" value="' + escapeHTML(subject ? subject.nome : '') + '" placeholder="es. Filosofia" data-subject-field="name" data-autofocus>' +
        '<p class="field-error" data-error-for="name" hidden></p></div>' +
      '<div class="field mt-12"><span class="field-label">Colore</span><div class="color-grid" role="group" aria-label="Colore della materia">' +
        SUBJECT_COLORS.map((color) => '<button class="color-choice" type="button" data-action="subject-color" data-color="' + color + '" aria-pressed="' + (state.sheet.subjectColor === color ? 'true' : 'false') + '" aria-label="Colore ' + color + '"><span style="--swatch:' + color + '"></span></button>').join('') +
      '</div></div>' +
      '<div class="form-grid mt-12">' +
        '<div class="field"><label for="subjectGoal">Obiettivo <span class="optional">facoltativo</span></label><input class="input" id="subjectGoal" type="text" inputmode="decimal" value="' + (subject && subject.obiettivo != null ? fmt2(subject.obiettivo) : '') + '" placeholder="es. 7,50" data-subject-field="goal">' +
          '<p class="field-error" data-error-for="goal" hidden></p></div>' +
      '</div>' +
      '<div class="field mt-12"><label for="subjectNote">Note <span class="optional">facoltative</span></label><textarea class="textarea" id="subjectNote" maxlength="400" placeholder="Professore, orario, obiettivi personali…" data-subject-field="note">' + escapeHTML(subject ? subject.note : '') + '</textarea></div>' +
      (subject && gradeCount
        ? '<div class="subject-note">Questa materia ha ' + gradeCount + (gradeCount === 1 ? ' voto collegato' : ' voti collegati') + '. Se la elimini, verranno eliminati anche i relativi voti.</div>'
        : '') +
      '</form>';
    const footer = (subject
      ? '<button class="button danger soft" type="button" data-action="delete-subject" data-subject-id="' + escapeHTML(subject.id) + '">' + icon('trash', 16) + ' Elimina</button>'
      : '') +
      '<button class="button primary" type="button" data-action="save-subject">' + (subject ? 'Salva modifiche' : 'Crea materia') + '</button>';
    setSheetContent({
      eyebrow: subject ? 'Materia' : 'Nuova',
      title: subject ? subject.nome : 'Aggiungi materia',
      body,
      footer
    });
  }

  function saveSubject() {
    const form = $('#subjectForm', els.sheetBody);
    if (!form) return;
    clearFieldErrors();
    const nameField = form.querySelector('[data-subject-field="name"]');
    const goalField = form.querySelector('[data-subject-field="goal"]');
    const noteField = form.querySelector('[data-subject-field="note"]');
    const name = nameField ? nameField.value.trim() : '';
    if (!name) {
      setFieldError(form, 'name', 'Il nome è obbligatorio.');
      return;
    }
    const goalRaw = goalField ? goalField.value.trim() : '';
    let goal = null;
    if (goalRaw) {
      goal = parseDecimalInput(goalRaw);
      if (!Number.isFinite(goal) || goal < 0 || goal > 10.25) {
        setFieldError(form, 'goal', 'L\'obiettivo deve essere tra 0 e 10,25.');
        return;
      }
    }
    if (!canWrite()) return;
    const note = noteField ? noteField.value.trim().slice(0, 400) : '';
    const editing = state.sheet.mode === 'subject-edit';
    const subjects = state.subjects.slice();
    if (state.sheet.mode === 'subject-edit' && state.sheet.subjectId) {
      const index = subjects.findIndex((s) => s.id === state.sheet.subjectId);
      if (index < 0) return;
      subjects[index] = { ...subjects[index], nome: name, colore: state.sheet.subjectColor, obiettivo: goal, note };
    } else {
      subjects.push({ id: uid('s'), nome: name, colore: state.sheet.subjectColor, obiettivo: goal, note });
    }
    if (!commitData({ subjects })) return;
    const callback = state.sheet.onSaved;
    flashSuccess();
    closeSheet();
    window.setTimeout(() => {
      if (callback) callback();
      else {
        refreshCurrentView(true);
        showToast(editing ? 'Materia aggiornata.' : 'Materia creata.', 'success');
      }
    }, 300);
  }

  async function confirmDeleteSubject(subjectId) {
    const subject = state.subjects.find((s) => s.id === subjectId);
    if (!subject) return;
    const count = gradesForSubject(subjectId, state.grades).length;
    closeSheet();
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    const ok = await showConfirm({
      title: 'Eliminare ' + subject.nome + '?',
      message: count
        ? 'Verranno eliminati anche ' + count + (count === 1 ? ' voto collegato' : ' voti collegati') + '. L\'operazione non può essere annullata.'
        : 'La materia verrà rimossa. L\'operazione non può essere annullata.',
      confirmLabel: 'Elimina',
      danger: true
    });
    if (!ok) return;
    const subjects = state.subjects.filter((s) => s.id !== subjectId);
    const grades = state.grades.filter((g) => g.subjectId !== subjectId);
    if (commitData({ subjects, grades })) {
      if (state.simScope === subjectId) state.simScope = 'all';
      if (state.gradesFilters.subject === subjectId) state.gradesFilters.subject = '';
      if (state.analysisFilters.subject === subjectId) state.analysisFilters.subject = '';
      state.scenarios = state.scenarios.filter((item) => item.subjectId !== subjectId);
      refreshCurrentView(true);
      const focusTarget = resolveReturnFocus(state.sheet.returnFocus);
      if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
      showToast('Materia eliminata.', 'success');
    }
  }

  /* ---------- Scenario ipotetico ---------- */

  function scenarioDraftDefaults() {
    const scope = state.simScope !== 'all' && getSubject(state.simScope) ? state.simScope : (state.subjects[0] ? state.subjects[0].id : '');
    return { subjectId: scope, weight: '100' };
  }

  function openScenarioSheet() {
    if (state.fabMenuOpen) closeFabMenu();
    if (!state.subjects.length) {
      openSubjectSheet(null, () => {
        refreshCurrentView(true);
        openScenarioSheet();
      });
      return;
    }
    state.sheet.mode = 'scenario';
    state.sheet.scenarioDraft = scenarioDraftDefaults();
    state.sheet.pickerInt = null;
    state.sheet.pickerMod = '';
    if (!state.sheet.open) {
      const preferred = $('[data-action="add-scenario"]');
      state.sheet.returnFocus = captureFocusTarget(preferred || null);
    }
    state.sheet.open = true;
    renderScenarioSheet();
    els.sheetOverlay.hidden = false;
    els.sheetOverlay.classList.remove('closing');
    requestAnimationFrame(() => els.sheetOverlay.classList.add('open'));
    setAppInert(true);
    window.setTimeout(focusSheet, 260);
  }

  function renderScenarioSheet() {
    const draft = state.sheet.scenarioDraft || scenarioDraftDefaults();
    const body = '<form id="scenarioForm" data-form="scenario" novalidate>' +
      '<p class="hint form-notice">' + icon('spark', 16) + '<span>Il voto ipotetico esiste solo in questa simulazione: non verrà salvato nel registro.</span></p>' +
      '<div class="field"><label for="scenarioSubject">Materia</label><select class="select" id="scenarioSubject" data-scenario-field="subject" data-autofocus>' + subjectOptionsHTML(draft.subjectId, false) + '</select></div>' +
      '<div class="form-section-title">Voto <span>notazione italiana</span></div>' +
      gradePickerHTML(state.sheet.pickerInt, state.sheet.pickerMod) +
      '<div class="field mt-12"><label for="scenarioWeight">Peso</label><input class="input" id="scenarioWeight" type="text" inputmode="decimal" value="' + escapeHTML(draft.weight) + '" data-scenario-field="weight">' +
        '<p class="field-error" data-error-for="weight" hidden></p></div>' +
    '</form>';
    setSheetContent({
      eyebrow: 'Simulazione',
      title: 'Aggiungi voto ipotetico',
      body,
      footer: '<button class="button primary block" type="button" data-action="save-scenario">' + icon('plus', 17) + ' Aggiungi ipotesi</button>'
    });
    updateScenarioSaveButton();
  }

  function updateScenarioSaveButton() {
    const form = $('#scenarioForm', els.sheetBody);
    if (!form) return;
    const subject = form.querySelector('[data-scenario-field="subject"]');
    const ready = !!subject && !!subject.value && state.sheet.pickerInt != null;
    const button = els.sheetFooter.querySelector('[data-action="save-scenario"]');
    if (button) button.disabled = !ready;
  }

  function saveScenario() {
    const form = $('#scenarioForm', els.sheetBody);
    if (!form) return;
    const subjectField = form.querySelector('[data-scenario-field="subject"]');
    const weightField = form.querySelector('[data-scenario-field="weight"]');
    const subjectId = subjectField ? subjectField.value : '';
    const weight = parseDecimalInput(weightField ? weightField.value : '');
    clearFieldErrors(els.sheetBody);
    let valid = true;
    if (!subjectId || !getSubject(subjectId)) valid = false;
    if (state.sheet.pickerInt == null) {
      const error = els.sheetBody.querySelector('[data-error-for="picker"]');
      if (error) { error.textContent = 'Scegli un voto per l\'ipotesi.'; error.hidden = false; }
      valid = false;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      setFieldError(form, 'weight', 'Il peso deve essere maggiore di zero.');
      valid = false;
    }
    if (!valid) return;
    state.scenarios.push({
      id: uid('sc'),
      subjectId,
      value: computePickerValue(state.sheet.pickerInt, state.sheet.pickerMod),
      label: pickerLabel(state.sheet.pickerInt, state.sheet.pickerMod),
      weight
    });
    closeSheet();
    window.setTimeout(() => {
      refreshCurrentView(true);
      showToast('Ipotesi aggiunta alla simulazione.', 'success');
    }, 220);
  }

  /* ---------- Dialogo di conferma ---------- */

  function showConfirm(options) {
    const opts = options || {};
    if (!els.confirmDialog || typeof els.confirmDialog.showModal !== 'function') {
      return Promise.resolve(window.confirm(opts.title + '\n\n' + opts.message));
    }
    return new Promise((resolve) => {
      els.confirmTitle.textContent = opts.title || 'Conferma';
      els.confirmMessage.textContent = opts.message || '';
      els.confirmOk.textContent = opts.confirmLabel || 'Conferma';
      els.confirmIcon.innerHTML = icon(opts.danger ? 'alert' : 'info', 22);
      els.confirmIcon.classList.toggle('danger', !!opts.danger);
      els.confirmOk.classList.toggle('danger', opts.danger !== false);
      els.confirmOk.classList.toggle('primary', opts.danger === false);
      state.dialogResolver = resolve;
      els.confirmDialog.showModal();
      window.setTimeout(() => els.confirmOk.focus(), 40);
    });
  }

  /* ---------- Onboarding ---------- */

  function colorFromName(name) {
    let hash = 0;
    String(name).split('').forEach((char) => { hash = (hash * 31 + char.charCodeAt(0)) % 997; });
    return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
  }

  function startOnboarding() {
    if (state.onboardingOpen) return;
    state.onboardingOpen = true;
    state.onboardStep = 0;
    state.onboardCustom = [];
    state.onboardSelected = ['Italiano', 'Latino', 'Matematica', 'Inglese', 'Storia', 'Filosofia', 'Scienze', 'Scienze motorie'];
    state.onboardFocus = 'heading';
    els.onboarding.hidden = false;
    setAppInert(true);
    renderChrome(true);
    renderOnboarding();
  }

  function onboardingNames() {
    return SUGGESTED_SUBJECTS.concat(state.onboardCustom.filter((name) => !SUGGESTED_SUBJECTS.includes(name)));
  }

  function selectedOnboardingNames() {
    return onboardingNames().filter((name) => state.onboardSelected.includes(name));
  }

  function onboardingStepOne() {
    return '<div class="onboarding-panel">' +
      '<span class="onboarding-kicker" style="--i:0">' + icon('spark', 13) + ' Il tuo spazio</span>' +
      '<h1 id="onboardingHeading" tabindex="-1" style="--i:1">I voti, senza il caos.</h1>' +
      '<p class="onboarding-lead" style="--i:2">Un registro semplice per seguire medie, andamento e obiettivi del tuo anno scolastico. Pensato per il telefono, senza distrazioni.</p>' +
      '<div class="privacy-badge" style="--i:3">' + icon('shield', 25) + '<div><strong>I dati restano qui</strong><p>Nessun account, nessun cloud. I voti sono salvati solo nel browser di questo dispositivo. Potrai esportare un backup JSON quando vuoi.</p></div></div>' +
      '<div class="onboarding-feature-list">' +
        '<div class="onboarding-feature" style="--i:4"><span class="onboarding-feature-icon">' + icon('book', 18) + '</span><div><strong>Le tue materie</strong><p>Scegli quelle che segui davvero. Potrai aggiungerle, modificarle o cambiarne il colore.</p></div></div>' +
        '<div class="onboarding-feature" style="--i:5"><span class="onboarding-feature-icon">' + icon('chart', 18) + '</span><div><strong>Medie e grafici</strong><p>Media ponderata, distribuzione, trend e confronto tra materie. Tutto calcolato sul telefono.</p></div></div>' +
        '<div class="onboarding-feature" style="--i:6"><span class="onboarding-feature-icon">' + icon('calc', 18) + '</span><div><strong>Simulazioni</strong><p>Prova un voto ipotetico o scopri quanto ti serve per arrivare all\'obiettivo.</p></div></div>' +
      '</div>' +
    '</div>';
  }

  function onboardingStepTwo() {
    return '<div class="onboarding-panel">' +
      '<span class="onboarding-kicker" style="--i:0">' + icon('graduation', 13) + ' Notazione italiana</span>' +
      '<h1 id="onboardingHeading" tabindex="-1" style="--i:1">Un voto si <span>scrive così.</span></h1>' +
      '<p class="onboarding-lead" style="--i:2">Non dovrai digitare numeri strani: scegli il voto intero e un modificatore. Il registro fa il resto.</p>' +
      '<div class="notation-demo" style="--i:3">' +
        '<div class="notation-chip"><span class="notation-label">8-</span><span class="notation-equal">=</span><span class="notation-value">7,75</span></div>' +
        '<div class="notation-chip"><span class="notation-label">6½</span><span class="notation-equal">=</span><span class="notation-value">6,50</span></div>' +
        '<div class="notation-chip"><span class="notation-label">5+</span><span class="notation-equal">=</span><span class="notation-value">5,25</span></div>' +
        '<div class="notation-chip"><span class="notation-label">10+</span><span class="notation-equal">=</span><span class="notation-value">10,25</span></div>' +
      '</div>' +
      '<div class="notation-note" style="--i:4">' + icon('info', 15) + ' Il segno − abbassa di un quarto, <strong>½</strong> alza di mezzo, <strong>+</strong> di un quarto. Il modificatore − non è disponibile su 0.</div>' +
      '<div class="onboarding-notation-explain" style="--i:5">' +
        '<div class="explain-mini"><strong>La label è quella che vedi</strong><span>Nel registro i voti appaiono come 8-, 6½, 5+.</span></div>' +
        '<div class="explain-mini"><strong>La media usa il valore</strong><span>I calcoli usano sempre 7,75 · 6,50 · 5,25.</span></div>' +
      '</div>' +
    '</div>';
  }

  function onboardingStepThree() {
    const all = onboardingNames();
    const selected = state.onboardSelected;
    const chips = all.map((name, index) => {
      const isSelected = selected.includes(name);
      return '<button type="button" class="suggestion-chip" data-action="toggle-onboard-subject" data-name="' + escapeHTML(name) + '" aria-pressed="' + (isSelected ? 'true' : 'false') + '" style="--i:' + Math.min(index, 8) + '">' +
        '<span class="suggestion-dot" style="background:' + colorFromName(name) + '"></span>' + escapeHTML(name) +
        (isSelected ? icon('check', 13) : '') +
      '</button>';
    }).join('');
    return '<div class="onboarding-panel">' +
      '<span class="onboarding-kicker" style="--i:0">' + icon('book', 13) + ' Ultimo passo</span>' +
      '<h1 id="onboardingHeading" tabindex="-1" style="--i:1">Da dove <span>parti?</span></h1>' +
      '<p class="onboarding-lead" style="--i:2">Queste sono materie tipiche del liceo. Seleziona le tue: potrai modificarle in qualsiasi momento dalle impostazioni.</p>' +
      '<div class="subject-suggestions" style="--i:3">' + chips + '</div>' +
      '<div class="suggestion-actions">' +
        '<button type="button" class="text-button" data-action="onboard-select-all">Seleziona tutte</button>' +
        '<button type="button" class="text-button" data-action="onboard-deselect-all">Deseleziona</button>' +
      '</div>' +
      '<form class="custom-subject-form" data-form="onboard-custom">' +
        '<label class="sr-only" for="onboardCustomInput">Aggiungi una materia personalizzata</label>' +
        '<input class="input" id="onboardCustomInput" type="text" maxlength="60" placeholder="Aggiungi un\'altra materia…" autocomplete="off">' +
        '<button class="button secondary" type="submit" aria-label="Aggiungi materia personalizzata">' + icon('plus', 18) + '</button>' +
      '</form>' +
      '<p class="onboarding-count" style="--i:4"><strong>' + selected.length + '</strong> ' + (selected.length === 1 ? 'materia selezionata' : 'materie selezionate') + '. Puoi anche iniziare dal foglio bianco.</p>' +
    '</div>';
  }

  function renderOnboarding(options) {
    const opts = options || {};
    const previousScroll = els.onboardingContent.scrollTop;
    const step = state.onboardStep;
    const content = step === 0 ? onboardingStepOne() : step === 1 ? onboardingStepTwo() : onboardingStepThree();
    els.onboardingContent.innerHTML = content;
    // Quando si ri-renderizza solo per un tap su chip o un'azione, mantenere
    // la posizione evita che il contenuto salti in cima.
    els.onboardingContent.scrollTop = opts.preserveScroll ? previousScroll : 0;
    els.onboardingDots.innerHTML = [0, 1, 2].map((index) => '<span class="onboarding-dot' + (index === step ? ' active' : '') + '"></span>').join('');

    els.onboardingActions.innerHTML = step === 0
      ? '<button class="button primary" type="button" data-action="onboard-next">Inizia ' + icon('arrowRight', 17) + '</button>'
      : step === 1
        ? '<button class="button secondary" type="button" data-action="onboard-back">Indietro</button><button class="button primary" type="button" data-action="onboard-next">Avanti ' + icon('arrowRight', 17) + '</button>'
        : (function () {
          const selectedCount = selectedOnboardingNames().length;
          return '<button class="button secondary" type="button" data-action="onboard-back">Indietro</button><button class="button primary" type="button" data-action="onboard-finish">' + (selectedCount ? 'Crea ' + selectedCount + (selectedCount === 1 ? ' materia' : ' materie') : 'Inizia dal foglio bianco') + '</button>';
        })();
    // Il focus viene spostato solo quando lo decide un'azione esplicita,
    // così resta sul chip o sul campo appena usato.
    const focusMode = state.onboardFocus;
    state.onboardFocus = null;
    window.setTimeout(() => {
      if (!state.onboardingOpen) return;
      if (focusMode === 'heading') {
        const heading = $('#onboardingHeading');
        if (heading) heading.focus({ preventScroll: true });
        return;
      }
      if (focusMode === 'input') {
        const input = $('#onboardCustomInput');
        if (input) input.focus({ preventScroll: true });
        return;
      }
      if (focusMode && focusMode.indexOf('chip:') === 0) {
        const name = focusMode.slice(5);
        const chip = $$('[data-action="toggle-onboard-subject"]', els.onboardingContent)
          .find((button) => button.dataset.name === name);
        if (chip) chip.focus({ preventScroll: true });
        return;
      }
      if (focusMode && focusMode.indexOf('action:') === 0) {
        const button = $('[data-action="' + focusMode.slice(7) + '"]', els.onboarding);
        if (button) button.focus({ preventScroll: true });
        return;
      }
      const primary = $('.onboarding-actions .button.primary', els.onboarding);
      if (primary) primary.focus({ preventScroll: true });
    }, 60);
  }

  function toggleOnboardSubject(name) {
    if (!name) return;
    if (state.onboardSelected.includes(name)) state.onboardSelected = state.onboardSelected.filter((item) => item !== name);
    else state.onboardSelected.push(name);
    state.onboardFocus = 'chip:' + name;
    renderOnboarding({ preserveScroll: true });
  }

  function addOnboardCustom() {
    const input = $('#onboardCustomInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    const exists = onboardingNames().some((item) => item.toLowerCase() === name.toLowerCase());
    if (!exists) {
      state.onboardCustom.push(name);
      state.onboardSelected.push(name);
    } else {
      const existing = onboardingNames().find((item) => item.toLowerCase() === name.toLowerCase());
      if (!state.onboardSelected.includes(existing)) state.onboardSelected.push(existing);
    }
    state.onboardFocus = 'input';
    renderOnboarding({ preserveScroll: true });
  }

  function finishOnboarding() {
    const names = selectedOnboardingNames();
    if (names.length) {
      const subjects = names.map((name) => ({
        id: uid('s'),
        nome: name,
        colore: colorFromName(name),
        obiettivo: null,
        note: ''
      }));
      if (state.storageAvailable && !state.writeBlocked) {
        if (!commitData({ subjects })) return;
      } else {
        state.subjects = subjects;
      }
    }
    markOnboardingSeen();
    closeOnboarding();
    refreshCurrentView(false);
    if (names.length) showToast('Registro pronto: buono studio!', 'success');
  }

  function skipOnboarding() {
    markOnboardingSeen();
    closeOnboarding();
    refreshCurrentView(false);
    showToast('Puoi aggiungere le materie quando vuoi.', 'success');
  }

  function closeOnboarding() {
    state.onboardingOpen = false;
    els.onboarding.hidden = true;
    setAppInert(false);
    renderChrome(false);
    els.main.focus({ preventScroll: true });
  }

  /* ---------- Backup JSON ---------- */

  function buildExportPayload() {
    return {
      app: 'Registro voti',
      version: SCHEMA_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        settings: clone(state.settings),
        subjects: clone(state.subjects),
        grades: clone(state.grades)
      }
    };
  }

  function exportBackup() {
    try {
      const payload = buildExportPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'voti-backup-' + todayISO() + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
      showToast('Backup esportato.', 'success');
    } catch (err) {
      showToast('Non è stato possibile creare il file di backup.', 'error');
    }
  }

  function readFileAsText(file) {
    if (file && typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Lettura del file non riuscita.'));
      reader.readAsText(file);
    });
  }

  function validateImportPayload(payload) {
    if (!isPlainObject(payload)) throw new Error('Il file non contiene un oggetto JSON valido.');
    if (Number(payload.schemaVersion) !== SCHEMA_VERSION) {
      throw new Error('Versione schema non compatibile: trovata ' + (payload.schemaVersion == null ? 'assente' : payload.schemaVersion) + ', attesa ' + SCHEMA_VERSION + '.');
    }
    if (!isPlainObject(payload.data)) throw new Error('Il file non contiene la sezione "data" prevista dal backup.');
    if (!Array.isArray(payload.data.subjects)) throw new Error('L\'elenco delle materie non è valido.');
    if (!Array.isArray(payload.data.grades)) throw new Error('L\'elenco dei voti non è valido.');
    const settings = validateSettings(payload.data.settings);
    if (!settings) throw new Error('Le impostazioni nel backup non sono valide.');
    const subjects = [];
    const subjectIds = new Set();
    payload.data.subjects.forEach((raw, index) => {
      const subject = validateSubject(raw);
      if (!subject) throw new Error('La materia n. ' + (index + 1) + ' non è valida.');
      if (subjectIds.has(subject.id)) throw new Error('Ci sono materie con lo stesso ID nel backup.');
      subjectIds.add(subject.id);
      subjects.push(subject);
    });
    const grades = [];
    const gradeIds = new Set();
    payload.data.grades.forEach((raw, index) => {
      const grade = validateGrade(raw, subjectIds);
      if (!grade) throw new Error('Il voto n. ' + (index + 1) + ' non è valido o fa riferimento a una materia assente.');
      if (grade.date > todayISO()) throw new Error('Il voto n. ' + (index + 1) + ' ha una data futura (' + grade.date + ').');
      if (gradeIds.has(grade.id)) throw new Error('Ci sono voti con lo stesso ID nel backup.');
      gradeIds.add(grade.id);
      grades.push(grade);
    });
    return { settings, subjects, grades };
  }

  async function importFile(file) {
    state.importError = null;
    let imported;
    try {
      const text = await readFileAsText(file);
      const payload = JSON.parse(text);
      imported = validateImportPayload(payload);
    } catch (err) {
      state.importError = err instanceof SyntaxError
        ? 'Il file non è un JSON valido.'
        : (err && err.message ? err.message : 'Backup non valido.');
      showToast('Import rifiutato: backup non valido.', 'error');
      if (state.settingsOpen) refreshCurrentView(true);
      return;
    }
    const ok = await showConfirm({
      title: 'Importare questo backup?',
      message: 'Verranno sostituiti i dati attuali con ' + imported.grades.length + (imported.grades.length === 1 ? ' voto' : ' voti') + ' e ' + imported.subjects.length + (imported.subjects.length === 1 ? ' materia' : ' materie') + '. L\'operazione sovrascrive il registro esistente.',
      confirmLabel: 'Importa e sostituisci',
      danger: true
    });
    if (!ok) return;
    const previous = {
      settings: state.settings,
      subjects: state.subjects,
      grades: state.grades
    };
    state.settings = imported.settings;
    state.subjects = imported.subjects;
    state.grades = imported.grades;
    if (state.storageAvailable) {
      if (!writeSnapshot()) {
        state.settings = previous.settings;
        state.subjects = previous.subjects;
        state.grades = previous.grades;
        showToast('Import non completato: impossibile scrivere nei dati locali.', 'error');
        return;
      }
    }
    state.writeBlocked = false;
    state.storageIssue = null;
    state.importError = null;
    state.scenarios = [];
    state.simScope = 'all';
    state.simTarget = '';
    state.simCount = '1';
    state.simWeight = '100';
    state.gradesFiltersOpen = false;
    state.gradesFilters = { search: '', subject: '', period: 'tutti', from: '', to: '', type: '', min: '', max: '' };
    state.analysisFilters = { subject: '', period: 'anno', from: '', to: '' };
    state.groupBy = 'date';
    markOnboardingSeen();
    refreshCurrentView(true);
    showToast('Backup importato correttamente.', 'success');
  }

  async function resetAllData() {
    const first = await showConfirm({
      title: 'Reimpostare tutti i dati?',
      message: 'Verranno cancellati voti, materie e impostazioni da questo browser. Prima dell\'azione definitiva ti verrà chiesta un\'ulteriore conferma.',
      confirmLabel: 'Continua',
      danger: true
    });
    if (!first) return;
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    const second = await showConfirm({
      title: 'Ultima conferma',
      message: 'Sei davvero sicuro? L\'operazione è irreversibile. Se non hai un backup, i dati non potranno essere recuperati.',
      confirmLabel: 'Cancella tutto',
      danger: true
    });
    if (!second) return;
    if (state.storageAvailable) {
      try {
        const keys = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const key = window.localStorage.key(i);
          if (key && key.indexOf('gradeTracker.') === 0) keys.push(key);
        }
        keys.forEach((key) => window.localStorage.removeItem(key));
      } catch (err) {
        showToast('Impossibile cancellare i dati locali.', 'error');
        return;
      }
    }
    state.settings = defaultSettings();
    state.subjects = [];
    state.grades = [];
    state.storageIssue = null;
    state.writeBlocked = false;
    state.onboardingSeen = false;
    state.onboardStep = 0;
    state.importError = null;
    state.scenarios = [];
    state.simScope = 'all';
    state.simMode = 'whatif';
    state.simTarget = '';
    state.simCount = '1';
    state.simWeight = '100';
    state.lineMode = 'single';
    state.groupBy = 'date';
    state.settingsRoundingDraft = null;
    state.fabPulseStopped = false;
    state.newGradeId = null;
    state.previousHeroAverage = null;
    state.previousSimAverage = null;
    state.gradesFilters = { search: '', subject: '', period: 'tutti', from: '', to: '', type: '', min: '', max: '' };
    state.analysisFilters = { subject: '', period: 'anno', from: '', to: '' };
    state.settingsOpen = false;
    state.tab = 'home';
    state.homeAnimated = false;
    els.headerAverage.dataset.value = '';
    refreshCurrentView(false);
    showToast('Dati cancellati.', 'success');
    window.setTimeout(startOnboarding, 380);
  }

  /* ---------- Preferenze: salvataggio ---------- */

  function saveSettingsForm(form) {
    if (!form) return;
    clearFieldErrors(form);
    const goalField = form.querySelector('[data-settings-field="goal"]');
    const thresholdField = form.querySelector('[data-settings-field="threshold"]');
    const goalRaw = goalField ? goalField.value.trim() : '';
    const thresholdRaw = thresholdField ? thresholdField.value.trim() : '';
    let goal = null;
    let valid = true;
    if (goalRaw) {
      goal = parseDecimalInput(goalRaw);
      if (!Number.isFinite(goal) || goal < 0 || goal > 10.25) {
        setFieldError(form, 'goal', 'L\'obiettivo deve essere un numero tra 0 e 10,25.');
        valid = false;
      }
    }
    const threshold = parseDecimalInput(thresholdRaw);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 10.25) {
      setFieldError(form, 'threshold', 'La soglia deve essere un numero tra 0 e 10,25.');
      valid = false;
    }
    if (!valid) return;
    if (!canWrite()) return;
    const settings = {
      sogliaSufficienza: threshold,
      obiettivoGenerale: goal,
      arrotondamentoVisuale: state.settingsRoundingDraft || state.settings.arrotondamentoVisuale,
      schemaVersion: SCHEMA_VERSION
    };
    if (!commitData({ settings })) return;
    state.settingsRoundingDraft = null;
    refreshCurrentView(true);
    showToast('Preferenze salvate.', 'success');
  }

  /* ---------- Navigazione e impostazioni ---------- */

  function navigateTo(tab) {
    if (['home', 'grades', 'analysis', 'simulate'].indexOf(tab) < 0) return;
    if (state.fabMenuOpen) closeFabMenu();
    if (state.sheet.open) closeSheet();
    const sameView = !state.settingsOpen && state.tab === tab;
    if (sameView) {
      els.main.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    state.settingsRoundingDraft = null;
    state.settingsOpen = false;
    state.tab = tab;
    renderView({ animate: true });
  }

  function openSettings() {
    if (state.settingsOpen) return;
    if (state.fabMenuOpen) closeFabMenu();
    if (state.sheet.open) closeSheet();
    state.previousTab = state.tab;
    state.settingsRoundingDraft = null;
    state.settingsOpen = true;
    renderView({ animate: true });
  }

  function closeSettings() {
    if (!state.settingsOpen) return;
    state.settingsRoundingDraft = null;
    state.settingsOpen = false;
    state.tab = state.previousTab || 'home';
    renderView({ animate: true });
  }

  /* ---------- FAB e menu a ventaglio ---------- */

  function stopFabPulse() {
    state.fabPulseStopped = true;
    if (els.fab) els.fab.classList.remove('is-pulsing');
  }

  function openFabMenu() {
    if (state.fabMenuOpen) return;
    state.fabMenuOpen = true;
    stopFabPulse();
    els.fabMenu.hidden = false;
    els.fab.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      if (state.fabMenuOpen) els.fabMenu.classList.add('open');
    });
  }

  function closeFabMenu() {
    if (!state.fabMenuOpen) return;
    state.fabMenuOpen = false;
    els.fab.setAttribute('aria-expanded', 'false');
    els.fabMenu.classList.remove('open');
    window.setTimeout(() => {
      if (!state.fabMenuOpen) els.fabMenu.hidden = true;
    }, 220);
  }

  function setupFab() {
    let pressTimer = null;
    let suppressUntil = 0;
    const clearPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    const addRipple = (x, y) => {
      const rect = els.fab.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.left = (x - rect.left) + 'px';
      ripple.style.top = (y - rect.top) + 'px';
      els.fab.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 540);
    };

    els.fab.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (state.fabMenuOpen) return;
      stopFabPulse();
      addRipple(event.clientX, event.clientY);
      clearPress();
      pressTimer = window.setTimeout(() => {
        pressTimer = null;
        suppressUntil = performance.now() + 1600;
        openFabMenu();
      }, 480);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((name) => {
      els.fab.addEventListener(name, clearPress);
    });
    els.fab.addEventListener('click', (event) => {
      if (performance.now() < suppressUntil) {
        event.preventDefault();
        return;
      }
      if (state.fabMenuOpen) {
        closeFabMenu();
        return;
      }
      stopFabPulse();
      openGradeSheet();
    });
    els.fab.addEventListener('contextmenu', (event) => event.preventDefault());

    document.addEventListener('pointerdown', (event) => {
      if (!state.fabMenuOpen) return;
      if (event.target.closest('#fab') || event.target.closest('#fabMenu')) return;
      closeFabMenu();
    }, true);
  }

  /* ---------- Bottom sheet: trascinamento e focus ---------- */

  function setupSheetDrag() {
    let drag = null;
    const backdrop = () => $('.sheet-backdrop', els.sheetOverlay);

    els.dragZone.addEventListener('pointerdown', (event) => {
      if (!state.sheet.open || event.button !== 0) return;
      drag = {
        id: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        startTime: performance.now(),
        lastTime: performance.now()
      };
      try { els.dragZone.setPointerCapture(event.pointerId); } catch (err) { /* non critico */ }
      els.sheet.style.transition = 'none';
      const layer = backdrop();
      if (layer) layer.style.transition = 'none';
    });

    els.dragZone.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dy = Math.max(0, event.clientY - drag.startY);
      drag.lastY = event.clientY;
      drag.lastTime = performance.now();
      els.sheet.style.transform = 'translate3d(0, ' + dy.toFixed(1) + 'px, 0)';
      const layer = backdrop();
      if (layer) {
        const ratio = clamp(dy / (els.sheet.offsetHeight || 1), 0, 1);
        layer.style.opacity = String(1 - ratio * 0.85);
      }
    });

    const finishDrag = (event) => {
      if (!drag || (event && event.pointerId !== drag.id)) return;
      const dy = Math.max(0, (event ? event.clientY : drag.lastY) - drag.startY);
      const elapsed = Math.max(1, drag.lastTime - drag.startTime);
      const velocity = dy / elapsed;
      drag = null;
      els.sheet.style.transition = '';
      const layer = backdrop();
      if (layer) layer.style.transition = '';
      if (dy > 110 || velocity > 0.65) {
        closeSheet();
      } else {
        els.sheet.style.transform = '';
        if (layer) layer.style.opacity = '';
      }
    };
    els.dragZone.addEventListener('pointerup', finishDrag);
    els.dragZone.addEventListener('pointercancel', finishDrag);
  }

  function trapFocus(container, event) {
    const nodes = $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', container)
      .filter((el) => !el.closest('[hidden]') && el.getClientRects().length > 0);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !container.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !container.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ---------- Tooltip dei grafici ---------- */

  function hideChartTooltip() {
    $$('.chart-tooltip.visible').forEach((tooltip) => {
      tooltip.classList.remove('visible');
      tooltip.textContent = '';
    });
  }

  function showChartTooltip(target, pointerEvent) {
    const area = target.closest('.chart-area');
    if (!area) return;
    // Un solo tooltip alla volta, anche passando da un grafico all'altro.
    hideChartTooltip();
    const tooltip = $('.chart-tooltip', area);
    if (!tooltip) return;
    tooltip.textContent = '';
    const title = document.createElement('strong');
    title.textContent = target.dataset.tipTitle || '';
    const body = document.createElement('span');
    body.className = 'tt-muted';
    body.textContent = target.dataset.tipBody || '';
    if (title.textContent) tooltip.appendChild(title);
    if (body.textContent) tooltip.appendChild(body);
    tooltip.classList.add('visible');

    const areaRect = area.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const tipWidth = tooltip.offsetWidth;
    const tipHeight = tooltip.offsetHeight;
    const pointerX = pointerEvent && Number.isFinite(pointerEvent.clientX) ? pointerEvent.clientX : null;
    const anchorX = pointerX != null ? pointerX - areaRect.left : targetRect.left - areaRect.left + targetRect.width / 2;
    const anchorY = pointerX != null
      ? (pointerEvent.clientY - areaRect.top)
      : (targetRect.top - areaRect.top + targetRect.height / 2);
    const left = clamp(anchorX, tipWidth / 2 + 4, Math.max(tipWidth / 2 + 4, areaRect.width - tipWidth / 2 - 4));
    let top = anchorY - tipHeight - 8;
    if (top < 2) top = anchorY + 10;
    tooltip.style.left = left.toFixed(1) + 'px';
    tooltip.style.top = Math.max(2, top).toFixed(1) + 'px';
  }

  /* ---------- Azioni delegate ---------- */

  function resetGradesFilters() {
    state.gradesFilters = { search: '', subject: '', period: 'tutti', from: '', to: '', type: '', min: '', max: '' };
  }

  function updateSearchClearButton() {
    const box = $('.search-box', els.stage);
    const input = box ? $('[data-search-input="grades"]', box) : null;
    if (!box || !input) return;
    const existing = $('.search-clear', box);
    const hasText = !!input.value;
    if (hasText && !existing) {
      box.insertAdjacentHTML('beforeend', '<button class="search-clear" type="button" data-action="clear-search" aria-label="Cancella ricerca">' + icon('close', 18) + '</button>');
    } else if (!hasText && existing) {
      existing.remove();
    }
  }

  function handleAction(actionEl, event) {
    const action = actionEl.dataset.action;
    if (!action) return;
    switch (action) {
      case 'close-sheet':
        closeSheet();
        break;
      case 'add-grade':
        openGradeSheet();
        break;
      case 'add-subject':
        openSubjectSheet();
        break;
      case 'add-subject-from-grade':
        // Il form voto non può restare aperto senza materie: si passa alla
        // creazione della materia e poi si riapre il voto.
        closeSheet();
        window.setTimeout(() => {
          openSubjectSheet(null, () => {
            refreshCurrentView(true);
            openGradeSheet();
          });
        }, 320);
        break;
      case 'open-grade':
        openGradeDetail(actionEl.dataset.gradeId);
        break;
      case 'edit-grade':
        openGradeSheet(actionEl.dataset.gradeId);
        break;
      case 'edit-subject':
        openSubjectSheet(actionEl.dataset.subjectId);
        break;
      case 'duplicate-grade':
        openGradeSheet(null, { duplicateOf: actionEl.dataset.gradeId });
        break;
      case 'delete-grade':
        confirmDeleteGrade(actionEl.dataset.gradeId);
        break;
      case 'save-grade':
        saveGrade(true);
        break;
      case 'save-grade-add':
        saveGrade(false);
        break;
      case 'save-subject':
        saveSubject();
        break;
      case 'delete-subject':
        confirmDeleteSubject(actionEl.dataset.subjectId);
        break;
      case 'subject-color': {
        const color = actionEl.dataset.color;
        state.sheet.subjectColor = color;
        $$('[data-action="subject-color"]', els.sheetBody).forEach((button) => {
          button.setAttribute('aria-pressed', button.dataset.color === color ? 'true' : 'false');
        });
        break;
      }
      case 'add-scenario':
        openScenarioSheet();
        break;
      case 'save-scenario':
        saveScenario();
        break;
      case 'remove-scenario': {
        const id = actionEl.dataset.scenarioId;
        state.scenarios = state.scenarios.filter((item) => item.id !== id);
        refreshCurrentView(true);
        showToast('Ipotesi rimossa.', 'success');
        break;
      }
      case 'clear-scenarios':
        state.scenarios = [];
        refreshCurrentView(true);
        showToast('Ipotesi azzerate.', 'success');
        break;
      case 'picker-int': {
        const value = Number(actionEl.dataset.value);
        state.sheet.pickerInt = Number.isFinite(value) ? value : null;
        if (modifierDisabled(state.sheet.pickerInt, state.sheet.pickerMod)) state.sheet.pickerMod = '';
        refreshPickerPreview();
        break;
      }
      case 'picker-mod':
        if (actionEl.disabled) break;
        state.sheet.pickerMod = actionEl.dataset.value || '';
        refreshPickerPreview();
        break;
      case 'sim-mode':
        if (state.simMode === actionEl.dataset.value) break;
        state.simMode = actionEl.dataset.value;
        refreshCurrentView(true);
        break;
      case 'line-mode':
        if (state.lineMode === actionEl.dataset.value) break;
        state.lineMode = actionEl.dataset.value;
        refreshCurrentView(true);
        break;
      case 'group-by':
        if (state.groupBy === actionEl.dataset.value) break;
        state.groupBy = actionEl.dataset.value;
        refreshCurrentView(true);
        break;
      case 'filter-toggle': {
        state.gradesFiltersOpen = !state.gradesFiltersOpen;
        const panel = $('#gradesFilters', els.stage);
        const toggle = $('#filterToggle', els.stage);
        if (panel) panel.classList.toggle('open', state.gradesFiltersOpen);
        if (toggle) toggle.setAttribute('aria-expanded', state.gradesFiltersOpen ? 'true' : 'false');
        break;
      }
      case 'clear-search': {
        state.gradesFilters.search = '';
        const input = $('#gradesSearch', els.stage);
        if (input) {
          input.value = '';
          input.focus({ preventScroll: true });
        }
        updateGradesResults();
        updateSearchClearButton();
        break;
      }
      case 'clear-filter': {
        const name = actionEl.dataset.filterName;
        if (name === 'subject') state.gradesFilters.subject = '';
        else if (name === 'period') {
          state.gradesFilters.period = 'tutti';
          state.gradesFilters.from = '';
          state.gradesFilters.to = '';
        } else if (name === 'type') state.gradesFilters.type = '';
        else if (name === 'min') state.gradesFilters.min = '';
        else if (name === 'max') state.gradesFilters.max = '';
        state.gradesFiltersOpen = true;
        refreshCurrentView(true);
        break;
      }
      case 'clear-filters':
        resetGradesFilters();
        state.gradesFiltersOpen = false;
        refreshCurrentView(true);
        break;
      case 'reset-analysis-filters':
        state.analysisFilters = { subject: '', period: 'anno', from: '', to: '' };
        refreshCurrentView(true);
        break;
      case 'rounding-choice':
        state.settingsRoundingDraft = actionEl.dataset.value;
        $$('[data-action="rounding-choice"]', els.stage).forEach((button) => {
          button.setAttribute('aria-pressed', button.dataset.value === state.settingsRoundingDraft ? 'true' : 'false');
        });
        break;
      case 'export':
        exportBackup();
        break;
      case 'import':
        if (state.importError) {
          state.importError = null;
          if (state.settingsOpen) refreshCurrentView(true);
        }
        els.importInput.click();
        break;
      case 'reset-data':
        resetAllData();
        break;
      case 'go-settings':
        openSettings();
        break;
      case 'go-grades':
        navigateTo('grades');
        break;
      case 'go-analysis':
        navigateTo('analysis');
        break;
      case 'onboard-back':
        if (state.onboardStep > 0) {
          state.onboardStep -= 1;
          state.onboardFocus = 'heading';
          renderOnboarding();
        }
        break;
      case 'onboard-next':
        if (state.onboardStep < 2) {
          state.onboardStep += 1;
          state.onboardFocus = 'heading';
          renderOnboarding();
        }
        break;
      case 'onboard-select-all':
        state.onboardSelected = onboardingNames().slice();
        state.onboardFocus = 'action:onboard-select-all';
        renderOnboarding({ preserveScroll: true });
        break;
      case 'onboard-deselect-all':
        state.onboardSelected = [];
        state.onboardFocus = 'action:onboard-deselect-all';
        renderOnboarding({ preserveScroll: true });
        break;
      case 'toggle-onboard-subject':
        toggleOnboardSubject(actionEl.dataset.name);
        break;
      case 'onboard-finish':
        finishOnboarding();
        break;
      default:
        break;
    }
  }

  /* ---------- Eventi globali ---------- */

  function onDocumentClick(event) {
    const actionEl = event.target.closest('[data-action]');
    if (actionEl && !actionEl.disabled) {
      handleAction(actionEl, event);
      return;
    }
    const chartEl = event.target.closest('.chart-interactive');
    if (chartEl) {
      showChartTooltip(chartEl, event);
      return;
    }
    if (!event.target.closest('.chart-area')) hideChartTooltip();
  }

  function onDocumentInput(event) {
    const target = event.target;
    if (target.matches('[data-search-input="grades"]')) {
      state.gradesFilters.search = target.value;
      updateGradesResults();
      updateSearchClearButton();
      return;
    }
    if (target.matches('[data-grade-field="subject"]')) {
      updateGradeSaveButtons();
      return;
    }
    if (target.matches('[data-scenario-field="subject"]')) {
      updateScenarioSaveButton();
      return;
    }
    if (target.matches('[data-calc-field="target"]')) {
      state.simTarget = target.value;
      updateNeededResult();
      return;
    }
    if (target.matches('[data-calc-field="count"]')) {
      state.simCount = target.value;
      updateNeededResult();
      return;
    }
    if (target.matches('[data-calc-field="weight"]')) {
      state.simWeight = target.value;
      updateNeededResult();
    }
  }

  function refocusAfterRender(target) {
    if (!target) return;
    let next = null;
    if (target.id) next = document.getElementById(target.id);
    if (!next && target.dataset && target.dataset.filterField) {
      next = $('[data-filter-field="' + target.dataset.filterField + '"]', els.stage);
    }
    if (!next && target.dataset && target.dataset.analysisField) {
      next = $('[data-analysis-field="' + target.dataset.analysisField + '"]', els.stage);
    }
    if (!next && target.hasAttribute('data-sim-scope')) next = $('[data-sim-scope]', els.stage);
    if (next && typeof next.focus === 'function') next.focus({ preventScroll: true });
  }

  function onDocumentChange(event) {
    const target = event.target;
    if (target.matches('[data-filter-field]')) {
      const field = target.dataset.filterField;
      state.gradesFilters[field] = target.value;
      state.gradesFiltersOpen = true;
      refreshCurrentView(true);
      refocusAfterRender(target);
      return;
    }
    if (target.matches('[data-analysis-field]')) {
      const field = target.dataset.analysisField;
      state.analysisFilters[field] = target.value;
      refreshCurrentView(true);
      refocusAfterRender(target);
      return;
    }
    if (target.matches('[data-grade-field="subject"]')) {
      updateGradeSaveButtons();
      return;
    }
    if (target.matches('[data-scenario-field="subject"]')) {
      updateScenarioSaveButton();
      return;
    }
    if (target.matches('[data-sim-scope]') || target.matches('[data-calc-field="scope"]')) {
      state.simScope = target.value || 'all';
      refreshCurrentView(true);
      refocusAfterRender(target);
    }
  }

  function onDocumentSubmit(event) {
    const form = event.target;
    if (!form || !form.matches || !form.matches('form')) return;
    const kind = form.dataset.form;
    if (!kind) return;
    if (kind === 'grade') {
      event.preventDefault();
      saveGrade(true);
    } else if (kind === 'subject') {
      event.preventDefault();
      saveSubject();
    } else if (kind === 'scenario') {
      event.preventDefault();
      saveScenario();
    } else if (kind === 'needed') {
      event.preventDefault();
      updateNeededResult();
    } else if (kind === 'settings') {
      event.preventDefault();
      saveSettingsForm(form);
    } else if (kind === 'onboard-custom') {
      event.preventDefault();
      addOnboardCustom();
    }
  }

  function onDocumentKeydown(event) {
    if (event.key === 'Escape') {
      if (els.confirmDialog && els.confirmDialog.open) return;
      if (state.sheet.open) {
        event.preventDefault();
        closeSheet();
        return;
      }
      if (state.fabMenuOpen) {
        closeFabMenu();
        return;
      }
      hideChartTooltip();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') &&
        event.target && event.target.closest && event.target.closest('.chart-interactive')) {
      event.preventDefault();
      showChartTooltip(event.target);
      return;
    }
    if (event.key === 'Tab') {
      if (state.sheet.open) trapFocus(els.sheet, event);
      else if (state.onboardingOpen) trapFocus(els.onboarding, event);
    }
  }

  function onDocumentFocusIn(event) {
    const chartEl = event.target.closest('.chart-interactive');
    if (chartEl) showChartTooltip(chartEl);
  }

  function onDocumentFocusOut(event) {
    const chartEl = event.target.closest('.chart-interactive');
    if (!chartEl) return;
    window.setTimeout(() => {
      const active = document.activeElement;
      if (!active || !active.closest || !active.closest('.chart-interactive')) hideChartTooltip();
    }, 60);
  }

  function onConfirmClosed() {
    const resolve = state.dialogResolver;
    state.dialogResolver = null;
    if (resolve) resolve(els.confirmDialog.returnValue === 'confirm');
  }

  function onImportSelected() {
    const file = els.importInput.files && els.importInput.files[0];
    els.importInput.value = '';
    if (file) importFile(file);
  }

  let resizeFrame = null;
  function onWindowResize() {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      updateNavPill(false);
      hideChartTooltip();
    });
  }

  function bindEvents() {
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('input', onDocumentInput);
    document.addEventListener('change', onDocumentChange);
    document.addEventListener('submit', onDocumentSubmit);
    document.addEventListener('keydown', onDocumentKeydown);
    document.addEventListener('focusin', onDocumentFocusIn);
    document.addEventListener('focusout', onDocumentFocusOut);
    window.addEventListener('resize', onWindowResize);

    els.settingsButton.addEventListener('click', () => {
      if (state.settingsOpen) closeSettings();
      else openSettings();
    });
    $$('.nav-item', els.bottomNav).forEach((button) => {
      button.addEventListener('click', () => navigateTo(button.dataset.nav));
    });
    els.onboardingSkip.addEventListener('click', skipOnboarding);
    els.importInput.addEventListener('change', onImportSelected);

    els.confirmOk.addEventListener('click', () => els.confirmDialog.close('confirm'));
    els.confirmCancel.addEventListener('click', () => els.confirmDialog.close('cancel'));
    els.confirmDialog.addEventListener('close', onConfirmClosed);
    els.confirmDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      els.confirmDialog.close('cancel');
    });
    els.confirmDialog.addEventListener('click', (event) => {
      if (event.target === els.confirmDialog) els.confirmDialog.close('cancel');
    });

    setupFab();
    setupSheetDrag();
    els.main.addEventListener('scroll', () => {
      if (state.fabMenuOpen) closeFabMenu();
    }, { passive: true });
  }

  /* ---------- Avvio ---------- */

  function init() {
    bootStorage();
    state.onboardingSeen = state.storageAvailable && safeGet(KEYS.onboarding) === '1';
    const hasData = state.subjects.length > 0 || state.grades.length > 0;
    // Un registro già popolato non deve mostrare l'onboarding solo perché
    // manca il marker: lo si considera visto e si evita di sovrascrivere.
    if (!state.onboardingSeen && hasData) markOnboardingSeen();

    bindEvents();
    els.navPill.classList.add('no-transition');
    renderView({ animate: false });
    requestAnimationFrame(() => {
      updateNavPill(true);
    });

    if (!state.onboardingSeen && !hasData && !state.writeBlocked) {
      window.setTimeout(startOnboarding, 430);
    }
  }

  init();
})();