import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { resolveDatasetRows } from './shared/aggregationHelpers.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SELF = path.basename(fileURLToPath(import.meta.url));

// Auto-discover every tool file in this directory (e.g. basic_math.js) —
// dropping in a new file that exports a `toolList` array registers it here
// automatically, no edits to this file needed.
const toolFiles = readdirSync(DIR).filter(f => f.endsWith('.js') && f !== SELF);

const modules = await Promise.all(
  toolFiles.map(f => import(pathToFileURL(path.join(DIR, f)).href))
);

const ALL_TOOLS = modules.flatMap(m => m.toolList ?? []);

const seen = new Set();
for (const tool of ALL_TOOLS) {
  if (seen.has(tool.name)) throw new Error(`Duplicate tool name registered: "${tool.name}"`);
  seen.add(tool.name);
}

// Gemini-facing declarations — name/description/parameters only. `execute`
// and `multiDataset` are internal dispatch metadata and must not be sent to
// the API (Gemini rejects unknown fields on a function declaration).
export const functionDeclarations = ALL_TOOLS.map(({ execute, multiDataset, ...declaration }) => declaration);

// `rowsByDataset` is a { [datasetName]: rows[] } map. Most tools operate on
// one dataset's rows — dispatch resolves which one via the tool's `dataset`
// arg (falling back to the sole dataset when only one is in scope) before
// calling execute(), so those tools' execute() bodies never need to know
// multiple datasets exist. Tools that genuinely need more than one dataset
// at once (e.g. join.js) opt out via `multiDataset: true` and resolve rows
// themselves from the full map.
export function dispatch(name, rowsByDataset, args) {
  const tool = ALL_TOOLS.find(t => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  if (tool.multiDataset) return tool.execute(rowsByDataset, args);
  const rows = resolveDatasetRows(rowsByDataset, args.dataset);
  return tool.execute(rows, args);
}
