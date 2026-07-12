import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ObjectId } from 'mongodb';
import { requireAuth, requireMembership } from '../../middleware/auth.js';
import { getDb, requireMongo } from '../../lib/mongo.js';
import { functionDeclarations, dispatch } from '../toolRegistry/registry.js';

const router = Router();
router.use(requireMongo);

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-latest',
]

// Tool declarations handed to Gemini — sourced from the tool registry so new
// tool files (backend/src/visualiser/toolRegistry/) show up here automatically.
const TOOLS = [{ functionDeclarations }]

// Explicit Gemini 2.5 Flash defaults (temperature/topP/topK) — spelled out
// here rather than left implicit, so they're a visible, adjustable knob.
// maxOutputTokens has no fixed default (capped at 65536, otherwise the model
// stops naturally), so it's left unset to preserve that behaviour.
const GENERATION_CONFIG = {
  temperature: 1.0,
  topP: 0.95,
  topK: 64,
}

// ─── Step 3: The main Gemini caller with the tool loop ─────────────────────────
// Keeps sending function-call results back to Gemini until it responds with
// no further function calls, up to MAX_TOOL_TURNS as a guard against a
// runaway loop (e.g. the model repeatedly deciding it needs "one more" call).
const MAX_TOOL_TURNS = 4;

async function callGeminiWithTools(apiKey, systemInstruction, history, lastMessage, rowsByDataset) {
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError;

  for (const modelName of MODELS) {
    try {
      // Start a chat session WITH tools declared
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction, generationConfig: GENERATION_CONFIG });
      const chat = model.startChat({ history, tools: TOOLS });

      let response = (await chat.sendMessage(lastMessage)).response;

      for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        const calls = response.functionCalls?.() || [];
        if (calls.length === 0) break;

        // Gemini returned one or more function calls — run them and send results back.
        // Dispatch errors (e.g. a wrong/missing dataset name) are fed back as the
        // function's result rather than thrown, so Gemini can self-correct on the
        // next turn instead of the whole request failing.
        const functionResponses = calls.map(fn => {
          console.log(`⚡ Gemini called: ${fn.name}(${JSON.stringify(fn.args)})`);
          let result;
          try {
            result = dispatch(fn.name, rowsByDataset, fn.args);
          } catch (err) {
            result = { error: err.message };
          }
          return {
            functionResponse: {
              name: fn.name,
              response: { result },
            },
          };
        });

        response = (await chat.sendMessage(functionResponses)).response;
      }

      if ((response.functionCalls?.() || []).length > 0) {
        console.warn(`Hit MAX_TOOL_TURNS (${MAX_TOOL_TURNS}) with more function calls still pending — returning best-effort text.`);
      }

      return response.text();
    } catch (err) {
      if (err.status === 429 || err.status === 503 || err.status === 404) {
        console.warn(`${modelName} unavailable (${err.status}), trying next…`);
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Builds unique, human-readable dataset names for the prompt/tool-dataset
// param — de-duped so two datasets uploaded with the same filename don't
// collide as rowsByDataset map keys.
function uniqueName(usedNames, name) {
  if (!usedNames.has(name)) return name;
  let i = 2;
  while (usedNames.has(`${name} (${i})`)) i++;
  return `${name} (${i})`;
}

// ─── Step 4: Route handler — fetches N datasets and builds a rowsByDataset map ──
router.post('/', requireAuth, requireMembership, async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Gemini API key not configured' });
  }

  const { datasetIds, messages } = req.body;
  if (!Array.isArray(datasetIds) || datasetIds.length === 0 || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'datasetIds (non-empty array) and messages are required' });
  }

  let oids;
  try {
    oids = datasetIds.map(id => new ObjectId(id));
  } catch {
    return res.status(400).json({ error: 'Invalid dataset ID' });
  }

  const db = getDb();
  const found = await db.collection('datasets').find(
    { _id: { $in: oids }, deleted_at: { $exists: false } },
    { projection: { columns: 1, rows: 1, name: 1, org_id: 1, department_id: 1 } }
  ).toArray();

  if (found.length !== datasetIds.length) {
    return res.status(404).json({ error: 'One or more datasets not found' });
  }

  for (const dataset of found) {
    if (!req.can('view', { id: dataset.department_id, org_id: dataset.org_id })) {
      return res.status(403).json({ error: `Not authorised to visualise dataset "${dataset.name}"` });
    }
  }

  // Preserve the caller's requested order and assign unique display names —
  // these names are what Gemini sees in the prompt and must pass back as the
  // `dataset` tool argument, so the map keys and prompt labels must match.
  const byId = new Map(found.map(d => [String(d._id), d]));
  const usedNames = new Set();
  const datasets = datasetIds.map(id => {
    const d = byId.get(String(id));
    const name = uniqueName(usedNames, d.name);
    usedNames.add(name);
    return { ...d, displayName: name };
  });

  const rowsByDataset = {};
  for (const d of datasets) rowsByDataset[d.displayName] = d.rows;

  const multiDataset = datasets.length > 1;

  const datasetsBlock = datasets.map(d => {
    const sampleRows = d.rows.slice(0, 5);
    return `Dataset "${d.displayName}" — columns: ${d.columns.join(', ')}
Sample data (up to 5 rows — use a tool for real analysis):
${JSON.stringify(sampleRows, null, 2)}`;
  }).join('\n\n');

  const multiDatasetGuidance = !multiDataset ? '' : `

		This conversation has ${datasets.length} datasets available: ${datasets.map(d => `"${d.displayName}"`).join(', ')}. Every tool call needs a "dataset" argument set to exactly one of these names (except join_and_aggregate, which takes left_dataset/right_dataset instead).
		- To COMPARE the same statistic across datasets (e.g. "compare total revenue between Q1 and Q2"), call the same tool once per dataset with a different "dataset" argument each time, then combine the results into one chart's "data" array.
		- CRITICAL when combining results from separate tool calls into one "data" array: each tool result becomes its OWN separate object in the array — never merge two results into a single object. Wrong: "data": [{"dataset": "Q1", "revenue": 3300, "dataset": "Q2", "revenue": 4500}] (this has duplicate keys — the second value silently overwrites the first and one whole row is lost). Right: "data": [{"dataset": "Q1", "revenue": 3300}, {"dataset": "Q2", "revenue": 4500}] — one complete, independent object per dataset, comma-separated between objects, with an "xKey" field (e.g. "dataset") in every object holding that dataset's display name.
		- To JOIN individual records between two datasets by a shared key column (e.g. "for customers present in both datasets, sum their combined order value"), use join_and_aggregate instead — do not try to compute a join by hand from separate tool calls.`;

  const systemInstruction =
		`You are a data analysis and visualisation expert. The user has ${multiDataset ? 'multiple datasets' : `a dataset called "${datasets[0].displayName}"`}.

		${datasetsBlock}
		${multiDatasetGuidance}

		You have access to the full dataset(s) through your tools — basic aggregation (sum/average/median/count/min/max), statistics (standard deviation, percentiles, mode), ranking (top/bottom N groups, percentage of total), a pivot tool for multi-series data, a join tool for combining two datasets by a shared key, and optional filtering and date-bucketed grouping on most of them. Each tool's own name/description/parameters tell you exactly what it computes and what it needs.
		Use a tool whenever the user asks about:
		- Totals, sums, averages, medians, counts, minimums, maximums, standard deviation, or percentiles
		- Breakdowns by category, group, or time period (day/week/month/quarter/year)
		- Rankings ("top 5 by...", "which region has the least...") or shares of a total ("% of sales by...")
		- Questions scoped to a condition ("...in the North region", "...during Q1") — use a tool's filters parameter rather than trying to compute this yourself
		- Multiple lines/bars/series split by a category ("one line per gender", "sales by month split by region") — call the pivot tool ONCE rather than calling a single-series tool multiple times and merging the results yourself. Its result already has one field per series value — use those exact field names as your yKeys dataKeys.
		- Any question that requires computing across the full dataset (not just the sample rows)

		If the user is asking you to tweak the chart you already produced (chart type, colours, title, labels, sorting) rather than asking a new analytical question, do NOT call a tool or recompute — reuse the exact "data" array from your most recent JSON code block earlier in this conversation and only change the fields the user asked about.

		After calling a tool, analyse the result and:
		1. Give a clear plain-English explanation with actual numbers from the computed data
		2. Include a JSON code block (\`\`\`json) with this chart config structure:
		{
		"chartType": "BarChart" | "LineChart" | "PieChart" | "AreaChart" | "ScatterChart",
		"title": "descriptive chart title",
		"xKey": "column name for x-axis or pie labels",
		"xLabel": "label text for the x-axis (omit for PieChart)",
		"yLabel": "label text for the y-axis (omit for PieChart)",
		"yKeys": [{ "dataKey": "column name", "name": "display label", "color": "#hexcolor" }],
		"data": [{ "xKey column name": "value", "dataKey column name": "number" }],
		"yAxis": { "domain": [2.5, 3.5], "scale": "linear" },
		"legend": { "position": "bottom" },
		"series": { "curveType": "monotone", "stacked": true }
		}

		"yAxis", "legend", and "series" are all OPTIONAL — omit any of them (or the whole block) unless the user specifically asks for that kind of tweak:
		- "yAxis": set when the user asks to set/change the y-axis range or scale. "domain" is a [min, max] pair of numbers. "scale" is exactly "linear" or "log".
		- "legend": set when the user asks to move the legend. "position" is exactly one of "top", "bottom", "left", "right".
		- "series": set when the user asks to change how lines/bars are drawn. "curveType" (LineChart/AreaChart only) is exactly one of "linear", "monotone", "step", "natural". "stacked" (BarChart/AreaChart only) is true or false.
		Use exactly these enum values — inventing a different string means the tweak will be ignored.

		IMPORTANT — When you used a tool, include a "data" array in the JSON block with the actual computed values. Each object in the array should have one
		key for the x-axis label and one key matching yKeys[0].dataKey for the computed value — use the same field name the tool's result already used
		(e.g. "average", "sum", "stddev", "percentile", "percentage") as that dataKey, don't rename it.
		This ensures the chart shows the real computed numbers, not raw column sums.
		For PieChart and frequency BarChart (where you want to count rows per category): set xKey to the categorical column and yKeys[0].dataKey to "count",
		and include the counted data in the "data" array.
		${multiDataset
			? 'This conversation has multiple datasets, so you must always use a tool and always include the "data" field — there is no single raw dataset to fall back to.'
			: 'If you did NOT use a tool, omit the "data" field and the chart will render from the raw dataset rows.'}
		Always include the JSON block.`;

  // Gemini uses 'user'/'model' roles; our messages use 'user'/'assistant'
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const lastMessage = messages[messages.length - 1].content;

  let text;
  try {
    text = await callGeminiWithTools(
      process.env.GEMINI_API_KEY,
      systemInstruction,
      history,
      lastMessage,
      rowsByDataset,  // { [displayName]: rows[] } so tools can compute on any selected dataset
    );
  } catch (err) {
    if (err.status === 429 || err.status === 503) {
      return res.status(429).json({ error: 'All Gemini models are busy — please try again in a moment.' });
    }
    return res.status(502).json({ error: 'Gemini API error: ' + err.message });
  }

  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  let config = null;
  if (jsonMatch) {
    try { config = JSON.parse(jsonMatch[1]); } catch { /* leave null */ }
  }

  const explanation = text.replace(/```json[\s\S]*?```/g, '').trim();
  // `raw` (unstripped) is what gets persisted as this turn's chat history —
  // stripping the JSON block before storing it means Gemini loses all memory
  // of the chart config it generated, so follow-up "tweak" requests have
  // nothing concrete to modify.
  res.json({ explanation, config, raw: text });
});

export default router;
