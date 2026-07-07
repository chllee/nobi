import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

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

// Gemini-facing declarations — name/description/parameters only, no execute.
export const functionDeclarations = ALL_TOOLS.map(({ execute, ...declaration }) => declaration);

export function dispatch(name, rows, args) {
  const tool = ALL_TOOLS.find(t => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.execute(rows, args);
}
