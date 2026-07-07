import { SchemaType } from '@google/generative-ai';
import {
  FILTERS_PARAM_SCHEMA,
  GROUP_BY_GRANULARITY_PARAM,
  applyFilters,
  groupRows,
  numericValues,
} from './shared/aggregationHelpers.js';

function commonProperties() {
  return {
    agg_column: {
      type: SchemaType.STRING,
      description: 'The column to analyse (e.g. "sales", "age")',
    },
    group_by_column: {
      type: SchemaType.STRING,
      description: 'Optional column to group results by (e.g. "region", "category"). If omitted, returns a single value.',
    },
    group_by_granularity: GROUP_BY_GRANULARITY_PARAM,
    filters: FILTERS_PARAM_SCHEMA,
  };
}

// Shared grouped/ungrouped execution shape for all three tools below —
// `valueExtractor` decides how raw rows become the values `reduce` runs on
// (numeric for stddev/percentile, raw values for mode's categorical support).
function executeGrouped(rows, args, valueExtractor, reduce, name) {
  const { agg_column, group_by_column, group_by_granularity, filters } = args;
  const filtered = applyFilters(rows, filters);

  if (!group_by_column) {
    return { [name]: reduce(valueExtractor(filtered, agg_column)) };
  }

  const groups = groupRows(filtered, group_by_column, group_by_granularity);
  return Array.from(groups.entries()).map(([key, groupRows]) => ({
    [group_by_column]: key,
    [name]: reduce(valueExtractor(groupRows, agg_column)),
  }));
}

function rawValues(rows, column) {
  return rows.map(r => r[column]).filter(v => v !== undefined && v !== null && v !== '');
}

function computeStddev(values) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computePercentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeMode(values) {
  if (!values.length) return null;
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [value, c] of counts) {
    if (c > bestCount) { best = value; bestCount = c; }
  }
  return best;
}

export const stddev = {
  name: 'stddev',
  description: 'Standard deviation of a numeric column across the full dataset, optionally filtered and/or grouped by another column.',
  parameters: { type: SchemaType.OBJECT, properties: commonProperties(), required: ['agg_column'] },
  execute: (rows, args) => executeGrouped(rows, args, numericValues, computeStddev, 'stddev'),
};

export const percentile = {
  name: 'percentile',
  description: 'The Nth percentile of a numeric column across the full dataset, optionally filtered and/or grouped by another column.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      ...commonProperties(),
      percentile_value: {
        type: SchemaType.NUMBER,
        description: 'Which percentile to compute, 0-100 (e.g. 50 for median, 90 for the 90th percentile).',
      },
    },
    required: ['agg_column', 'percentile_value'],
  },
  execute: (rows, args) => executeGrouped(rows, args, numericValues, values => computePercentile(values, args.percentile_value), 'percentile'),
};

// Unlike stddev/percentile, mode uses raw (non-numeric-filtered) values since
// it's meaningful for categorical columns too (e.g. most common "region").
export const mode = {
  name: 'mode',
  description: 'The most frequently occurring value in a column (numeric or categorical) across the full dataset, optionally filtered and/or grouped by another column.',
  parameters: { type: SchemaType.OBJECT, properties: commonProperties(), required: ['agg_column'] },
  execute: (rows, args) => executeGrouped(rows, args, rawValues, computeMode, 'mode'),
};

export const toolList = [stddev, percentile, mode];
