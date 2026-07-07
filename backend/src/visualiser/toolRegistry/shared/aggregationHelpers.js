import { SchemaType } from '@google/generative-ai';

// Not a tool file itself (no `toolList` export) — lives in a subdirectory so
// registry.js's top-level-only auto-discovery never treats it as one.

// ─── filters ─────────────────────────────────────────────────────────────────

export const FILTERS_PARAM_SCHEMA = {
  type: SchemaType.ARRAY,
  description: 'Optional list of AND-combined conditions to filter rows before aggregating (e.g. region = "North" AND date >= "2024-01-01").',
  items: {
    type: SchemaType.OBJECT,
    properties: {
      column: { type: SchemaType.STRING, description: 'Column name to filter on' },
      operator: {
        type: SchemaType.STRING,
        enum: ['=', '!=', '>', '<', '>=', '<=', 'contains'],
        description: 'Comparison operator',
      },
      value: { type: SchemaType.STRING, description: 'Value to compare against (numbers and dates given as strings)' },
    },
    required: ['column', 'operator', 'value'],
  },
};

// Converts a raw value to whatever form makes ordering comparisons meaningful:
// a number if it parses as one, else a timestamp if it parses as a date, else
// the raw string (lexicographic fallback).
function toComparable(value) {
  const num = Number(value);
  if (value !== '' && value != null && !isNaN(num)) return num;
  const date = Date.parse(value);
  if (!isNaN(date)) return date;
  return String(value ?? '');
}

function matchesCondition(rowValue, operator, filterValue) {
  if (operator === 'contains') return String(rowValue ?? '').toLowerCase().includes(String(filterValue).toLowerCase());
  if (operator === '=') return String(rowValue ?? '') === String(filterValue);
  if (operator === '!=') return String(rowValue ?? '') !== String(filterValue);

  const a = toComparable(rowValue);
  const b = toComparable(filterValue);
  switch (operator) {
    case '>':  return a > b;
    case '<':  return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    default:   return true;
  }
}

export function applyFilters(rows, filters) {
  if (!filters || filters.length === 0) return rows;
  return rows.filter(row => filters.every(f => matchesCondition(row[f.column], f.operator, f.value)));
}

// ─── date bucketing ──────────────────────────────────────────────────────────

const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'];

export const GROUP_BY_GRANULARITY_PARAM = {
  type: SchemaType.STRING,
  enum: GRANULARITIES,
  description: 'Optional granularity to bucket a date-like group_by_column into (e.g. "month" turns daily dates into monthly buckets). Only applies if group_by_column is set.',
};

// Returns the raw value unchanged if it isn't a parseable date, or no
// granularity was requested — callers fall back to the current "group by
// raw string value" behaviour.
export function bucketDateValue(value, granularity) {
  if (!granularity) return value;
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  switch (granularity) {
    case 'year':
      return String(year);
    case 'quarter':
      return `${year}-Q${Math.floor(month / 3) + 1}`;
    case 'month':
      return `${year}-${String(month + 1).padStart(2, '0')}`;
    case 'week': {
      const d = new Date(Date.UTC(year, month, date.getUTCDate()));
      const isoDay = (d.getUTCDay() + 6) % 7; // 0 = Monday
      d.setUTCDate(d.getUTCDate() - isoDay);
      return d.toISOString().slice(0, 10);
    }
    case 'day':
    default:
      return date.toISOString().slice(0, 10);
  }
}

// ─── grouping ────────────────────────────────────────────────────────────────

// Splits rows into groups keyed by group_by_column (optionally bucketed by
// granularity). Groups hold raw rows, not pre-reduced values — each tool
// extracts/converts values from those rows itself (numeric vs raw), same as
// today, which is what lets `mode` work on categorical columns too.
export function groupRows(rows, groupByColumn, granularity) {
  const groups = new Map();
  for (const row of rows) {
    const rawKey = row[groupByColumn];
    const key = granularity ? bucketDateValue(rawKey, granularity) : String(rawKey ?? '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

export function numericValues(rows, column) {
  return rows.map(r => Number(r[column])).filter(v => !isNaN(v));
}

// ─── shared reducers ─────────────────────────────────────────────────────────

function computeMedian(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export const REDUCERS = {
  sum:     values => values.reduce((a, b) => a + b, 0),
  average: values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
  median:  computeMedian,
  count:   values => values.length,
  min:     values => values.length ? Math.min(...values) : 0,
  max:     values => values.length ? Math.max(...values) : 0,
};
