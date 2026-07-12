import { SchemaType } from '@google/generative-ai';
import {
  FILTERS_PARAM_SCHEMA,
  GROUP_BY_GRANULARITY_PARAM,
  DATASET_PARAM,
  applyFilters,
  bucketDateValue,
  numericValues,
  REDUCERS,
} from './shared/aggregationHelpers.js';

// Reshapes data for a multi-series chart in one call: groups rows by an
// x-axis column and splits them into separate series by a second column,
// aggregating agg_column within each (x, series) cell. This is what "one
// line per gender/region/..." style requests need — without it, the model
// has to improvise by calling a single-series tool once per series value
// and merging the results itself, which is exactly the kind of thing that
// was flaky (works sometimes, silently drops a series, or declines outright).
export const pivot = {
  name: 'pivot',
  description: 'Group rows by an x-axis column and split them into separate series by a second column, aggregating a numeric column within each cell. Use this whenever the user wants multiple lines/bars/series split by a category — e.g. "one line per gender", "sales by month split by region" — instead of calling a single-series tool multiple times and merging results yourself.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      dataset: DATASET_PARAM,
      agg_column: { type: SchemaType.STRING, description: 'The numeric column to aggregate within each cell (e.g. "sales", "academic_performance")' },
      operation: {
        type: SchemaType.STRING,
        enum: ['sum', 'average', 'median', 'count', 'min', 'max'],
        description: 'How to aggregate agg_column within each (x, series) cell',
      },
      x_column: { type: SchemaType.STRING, description: 'Column for the x-axis / row grouping (e.g. "date", "daily_social_media_time")' },
      x_granularity: GROUP_BY_GRANULARITY_PARAM,
      series_column: { type: SchemaType.STRING, description: 'Column whose distinct values become separate series (e.g. "gender", "region"). Each distinct value becomes its own field in the result, ready to use as a yKeys dataKey.' },
      filters: FILTERS_PARAM_SCHEMA,
    },
    required: ['agg_column', 'operation', 'x_column', 'series_column'],
  },
  execute(rows, { agg_column, operation, x_column, x_granularity, series_column, filters }) {
    const reduce = REDUCERS[operation];
    const filtered = applyFilters(rows, filters);

    // cells: xKey -> seriesValue -> raw rows in that (x, series) cell
    const cells = new Map();
    const seriesValues = new Set();

    for (const row of filtered) {
      const xKey = x_granularity ? bucketDateValue(row[x_column], x_granularity) : String(row[x_column] ?? '');
      const seriesKey = String(row[series_column] ?? '');
      seriesValues.add(seriesKey);
      if (!cells.has(xKey)) cells.set(xKey, new Map());
      const seriesMap = cells.get(xKey);
      if (!seriesMap.has(seriesKey)) seriesMap.set(seriesKey, []);
      seriesMap.get(seriesKey).push(row);
    }

    const seriesList = Array.from(seriesValues).sort();
    const isNumericX = Array.from(cells.keys()).every(k => k !== '' && !isNaN(Number(k)));

    const result = Array.from(cells.entries()).map(([xKey, seriesMap]) => {
      const entry = { [x_column]: isNumericX ? Number(xKey) : xKey };
      for (const series of seriesList) {
        const cellRows = seriesMap.get(series);
        entry[series] = cellRows ? reduce(numericValues(cellRows, agg_column)) : null;
      }
      return entry;
    });

    // Sort ascending by x so line charts render as a sensible sequence rather
    // than connecting points in row-encounter order.
    result.sort((a, b) => isNumericX
      ? a[x_column] - b[x_column]
      : String(a[x_column]).localeCompare(String(b[x_column])));

    return result;
  },
};

export const toolList = [pivot];
