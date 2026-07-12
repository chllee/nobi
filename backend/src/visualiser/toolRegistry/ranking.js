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

// v1 scope: only sum/average/count get ranking tools. median/min/max ranking
// is deliberately deferred (rarer asks — "top regions by minimum order value"
// is an unusual question) but trivial to add later via the same factories.

function baseProperties() {
  return {
    dataset: DATASET_PARAM,
    agg_column: { type: SchemaType.STRING, description: 'The numeric column to aggregate (e.g. "sales")' },
    group_by_column: { type: SchemaType.STRING, description: 'Column to group by before ranking (e.g. "region", "product")' },
    group_by_granularity: GROUP_BY_GRANULARITY_PARAM,
    filters: FILTERS_PARAM_SCHEMA,
  };
}

function topBottomParamsSchema() {
  return {
    type: SchemaType.OBJECT,
    properties: {
      ...baseProperties(),
      n: { type: SchemaType.NUMBER, description: 'How many groups to return (default 5)' },
    },
    required: ['agg_column', 'group_by_column'],
  };
}

function percentageParamsSchema() {
  return {
    type: SchemaType.OBJECT,
    properties: baseProperties(),
    required: ['agg_column', 'group_by_column'],
  };
}

// Groups, filters, and reduces each group down to a single {key, value} pair
// — shared by both the top/bottom-N tools and the percentage-of-total tools.
function reduceGroups(rows, args, reduce) {
  const { agg_column, group_by_column, group_by_granularity, filters } = args;
  const filtered = applyFilters(rows, filters);
  const groups = groupRows(filtered, group_by_column, group_by_granularity);
  return Array.from(groups.entries()).map(([key, groupRows]) => ({
    key,
    value: reduce(numericValues(groupRows, agg_column)),
  }));
}

function makeRankTool(name, description, operation, direction) {
  const reduce = REDUCERS[operation];
  return {
    name,
    description,
    parameters: topBottomParamsSchema(),
    execute(rows, args) {
      const results = reduceGroups(rows, args, reduce);
      results.sort((a, b) => direction === 'top' ? b.value - a.value : a.value - b.value);
      const n = args.n && args.n > 0 ? Math.floor(args.n) : 5;
      return results.slice(0, n).map(r => ({ [args.group_by_column]: r.key, [operation]: r.value }));
    },
  };
}

function makePercentageTool(name, description, operation) {
  const reduce = REDUCERS[operation];
  return {
    name,
    description,
    parameters: percentageParamsSchema(),
    execute(rows, args) {
      const results = reduceGroups(rows, args, reduce);
      const grandTotal = results.reduce((acc, r) => acc + r.value, 0);
      return results
        .map(r => ({
          [args.group_by_column]: r.key,
          [operation]: r.value,
          percentage: grandTotal ? Math.round((r.value / grandTotal) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.percentage - a.percentage);
    },
  };
}

export const top_n_sum = makeRankTool('top_n_sum', 'Return the top N groups by total (sum) of a numeric column, grouped by another column.', 'sum', 'top');
export const bottom_n_sum = makeRankTool('bottom_n_sum', 'Return the bottom N groups by total (sum) of a numeric column, grouped by another column.', 'sum', 'bottom');
export const top_n_average = makeRankTool('top_n_average', 'Return the top N groups by average of a numeric column, grouped by another column.', 'average', 'top');
export const bottom_n_average = makeRankTool('bottom_n_average', 'Return the bottom N groups by average of a numeric column, grouped by another column.', 'average', 'bottom');
export const top_n_count = makeRankTool('top_n_count', 'Return the top N groups by row count, grouped by another column.', 'count', 'top');
export const bottom_n_count = makeRankTool('bottom_n_count', 'Return the bottom N groups by row count, grouped by another column.', 'count', 'bottom');

// Not offered for average/median/min/max — those don't sum to a meaningful
// "total" to take a share of, so "% of total average" isn't a coherent stat.
export const percentage_of_total_sum = makePercentageTool('percentage_of_total_sum', "Return every group's share of the total (sum) as a percentage, grouped by a column.", 'sum');
export const percentage_of_total_count = makePercentageTool('percentage_of_total_count', "Return every group's share of the total row count as a percentage, grouped by a column.", 'count');

export const toolList = [
  top_n_sum, bottom_n_sum,
  top_n_average, bottom_n_average,
  top_n_count, bottom_n_count,
  percentage_of_total_sum, percentage_of_total_count,
];
