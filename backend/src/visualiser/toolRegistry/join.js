import { SchemaType } from '@google/generative-ai';
import {
  FILTERS_PARAM_SCHEMA,
  applyFilters,
  groupRows,
  numericValues,
  REDUCERS,
  resolveDatasetRows,
} from './shared/aggregationHelpers.js';

// Normalizes a join-key value for matching: numbers compare numerically
// (so "42" and 42 match), everything else compares as a trimmed,
// case-insensitive string.
function toJoinKey(value) {
  const num = Number(value);
  if (value !== '' && value != null && !isNaN(num)) return num;
  return String(value ?? '').trim().toLowerCase();
}

// Inner join only (v1): rows with no match on either side are dropped, not
// carried through with nulls. `matched_rows` is returned alongside the
// aggregate so a low match count is visible rather than silently hidden —
// a mismatched key column (e.g. joining on differently-formatted IDs)
// would otherwise look identical to a correct join that happens to be small.
export const join_and_aggregate = {
  name: 'join_and_aggregate',
  description: 'Inner-join two datasets on a shared key column, then aggregate a numeric column from the joined rows. Use this when the user asks a question that requires matching individual records between two datasets by a common id/key (e.g. "for customers present in both datasets, sum their combined order value"). Do NOT use this to compare separate totals from each dataset side by side — call the regular aggregation tools once per dataset for that instead, this tool is only for genuine row-level joins. Rows with no match on either side are dropped.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      left_dataset: { type: SchemaType.STRING, description: 'Name of the first dataset, exactly as listed in the system instruction' },
      left_key_column: { type: SchemaType.STRING, description: 'Column in the left dataset to join on (e.g. "customer_id")' },
      right_dataset: { type: SchemaType.STRING, description: 'Name of the second dataset, exactly as listed in the system instruction' },
      right_key_column: { type: SchemaType.STRING, description: 'Column in the right dataset to join on — may have a different name than left_key_column' },
      agg_column: { type: SchemaType.STRING, description: 'Numeric column to aggregate from the joined rows — may come from either dataset, use whichever side actually has it' },
      reducer: {
        type: SchemaType.STRING,
        enum: ['sum', 'average', 'median', 'count', 'min', 'max'],
        description: 'How to aggregate agg_column across the joined rows',
      },
      group_by_column: { type: SchemaType.STRING, description: 'Optional column (from either dataset) to group the joined rows by before aggregating' },
      filters: FILTERS_PARAM_SCHEMA,
    },
    required: ['left_dataset', 'left_key_column', 'right_dataset', 'right_key_column', 'agg_column', 'reducer'],
  },
  // Needs two arbitrary datasets by name rather than the single resolved
  // `rows` array every other tool gets — opts out of registry.js's default
  // single-dataset resolution and resolves both sides itself.
  multiDataset: true,
  execute(rowsByDataset, args) {
    const { left_dataset, left_key_column, right_dataset, right_key_column, agg_column, reducer, group_by_column, filters } = args;
    const leftRows = resolveDatasetRows(rowsByDataset, left_dataset);
    const rightRows = resolveDatasetRows(rowsByDataset, right_dataset);

    const rightByKey = new Map();
    for (const row of rightRows) {
      const key = toJoinKey(row[right_key_column]);
      if (!rightByKey.has(key)) rightByKey.set(key, []);
      rightByKey.get(key).push(row);
    }

    const joined = [];
    for (const leftRow of leftRows) {
      const matches = rightByKey.get(toJoinKey(leftRow[left_key_column]));
      if (!matches) continue;
      for (const rightRow of matches) {
        // Left fields win on name collision — left is the "primary" side the
        // caller named first.
        joined.push({ ...rightRow, ...leftRow });
      }
    }

    const filtered = applyFilters(joined, filters);
    const reduce = REDUCERS[reducer];

    if (!group_by_column) {
      return { [reducer]: reduce(numericValues(filtered, agg_column)), matched_rows: filtered.length };
    }

    const groups = groupRows(filtered, group_by_column);
    return Array.from(groups.entries()).map(([key, groupRows]) => ({
      [group_by_column]: key,
      [reducer]: reduce(numericValues(groupRows, agg_column)),
      matched_rows: groupRows.length,
    }));
  },
};

export const toolList = [join_and_aggregate];
