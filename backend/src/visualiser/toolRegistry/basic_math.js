import { SchemaType } from '@google/generative-ai';
import {
  FILTERS_PARAM_SCHEMA,
  GROUP_BY_GRANULARITY_PARAM,
  DATASET_PARAM,
  applyFilters,
  groupRows,
  numericValues,
  REDUCERS,
} from './shared/aggregationHelpers.js';

// ─── shared param schema ────────────────────────────────────────────────────
// Every basic-math tool takes the same arguments: the numeric column to
// aggregate, an optional column (and date granularity) to group by, and an
// optional set of AND-combined filter conditions.
function paramsSchema() {
  return {
    type: SchemaType.OBJECT,
    properties: {
      dataset: DATASET_PARAM,
      agg_column: {
        type: SchemaType.STRING,
        description: 'The numeric column to aggregate (e.g. "sales", "age", "revenue")',
      },
      group_by_column: {
        type: SchemaType.STRING,
        description: 'Optional column to group results by (e.g. "region", "category"). If omitted, returns a single aggregated value.',
      },
      group_by_granularity: GROUP_BY_GRANULARITY_PARAM,
      filters: FILTERS_PARAM_SCHEMA,
    },
    required: ['agg_column'],
  };
}

// ─── tool factory ────────────────────────────────────────────────────────────
// Builds one tool from a name/description/reducer. `reduce` turns a group's
// filtered numeric values into the single result value for that group (or,
// ungrouped, for the whole dataset).
function makeTool(name, description, reduce) {
  return {
    name,
    description,
    parameters: paramsSchema(),
    execute(rows, { agg_column, group_by_column, group_by_granularity, filters }) {
      const filtered = applyFilters(rows, filters);

      if (!group_by_column) {
        return { [name]: reduce(numericValues(filtered, agg_column)) };
      }

      const groups = groupRows(filtered, group_by_column, group_by_granularity);
      return Array.from(groups.entries()).map(([key, groupRows]) => ({
        [group_by_column]: key,
        [name]: reduce(numericValues(groupRows, agg_column)),
      }));
    },
  };
}

export const sum = makeTool('sum', 'Sum a numeric column across the full dataset, optionally filtered and/or grouped by another column (optionally bucketed by date granularity).',
  REDUCERS.sum);
export const average = makeTool('average', 'Average (mean) of a numeric column across the full dataset, optionally filtered and/or grouped by another column (optionally bucketed by date granularity).',
  REDUCERS.average);
export const median = makeTool('median', 'Median of a numeric column across the full dataset, optionally filtered and/or grouped by another column (optionally bucketed by date granularity).',
  REDUCERS.median);
export const count = makeTool('count', 'Count of non-empty numeric values in a column across the full dataset, optionally filtered and/or grouped by another column (optionally bucketed by date granularity).',
  REDUCERS.count);
export const min = makeTool('min', 'Minimum value of a numeric column across the full dataset, optionally filtered and/or grouped by another column (optionally bucketed by date granularity).',
  REDUCERS.min);
export const max = makeTool('max', 'Maximum value of a numeric column across the full dataset, optionally filtered and/or grouped by another column (optionally bucketed by date granularity).',
  REDUCERS.max);

// Required export name — registry.js's auto-discovery reads `toolList` from
// every file in this directory by this exact name. Rename here only if you
// also update the corresponding lookup in registry.js.
export const toolList = [sum, average, median, count, min, max];
