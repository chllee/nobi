import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ObjectId } from 'mongodb';
import { requireAuth, requireMembership } from '../../middleware/auth.js';
import { getDb } from '../../lib/mongo.js';
import { functionDeclarations, dispatch } from '../toolRegistry/registry.js';

const router = Router();

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

async function callGeminiWithTools(apiKey, systemInstruction, history, lastMessage, rows) {
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

        // Gemini returned one or more function calls — run them and send results back
        const functionResponses = calls.map(fn => {
          console.log(`⚡ Gemini called: ${fn.name}(${JSON.stringify(fn.args)})`);
          const result = dispatch(fn.name, rows, fn.args);
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

// ─── Step 4: Route handler (mostly the same, just passes rows to callGemini) ──
router.post('/', requireAuth, requireMembership, async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Gemini API key not configured' });
  }

  const { datasetId, messages } = req.body;
  if (!datasetId || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'datasetId and messages are required' });
  }

  let oid;
  try {
    oid = new ObjectId(datasetId);
  } catch {
    return res.status(400).json({ error: 'Invalid dataset ID' });
  }

  const db = getDb();
  const dataset = await db.collection('datasets').findOne(
    { _id: oid, deleted_at: { $exists: false } },
    { projection: { columns: 1, rows: 1, name: 1, org_id: 1, department_id: 1 } }
  );
  if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

  if (!req.can('view', { id: dataset.department_id, org_id: dataset.org_id })) {
    return res.status(403).json({ error: 'Not authorised to visualise this dataset' });
  }

  const sampleRows = dataset.rows.slice(0, 5);
  const systemInstruction = 
		`You are a data analysis and visualisation expert. The user has a dataset called "${dataset.name}" with columns: ${dataset.columns.join(', ')}.

		Sample data (up to 5 rows — use one of your tools for real analysis):
		${JSON.stringify(sampleRows, null, 2)}

		You have access to the full dataset through your tools — basic aggregation (sum/average/median/count/min/max), statistics (standard deviation, percentiles, mode), ranking (top/bottom N groups, percentage of total), a pivot tool for multi-series data, and optional filtering and date-bucketed grouping on all of them. Each tool's own name/description/parameters tell you exactly what it computes and what it needs.
		Use a tool whenever the user asks about:
		- Totals, sums, averages, medians, counts, minimums, maximums, standard deviation, or percentiles
		- Breakdowns by category, group, or time period (day/week/month/quarter/year)
		- Rankings ("top 5 by...", "which region has the least...") or shares of a total ("% of sales by...")
		- Questions scoped to a condition ("...in the North region", "...during Q1") — use a tool's filters parameter rather than trying to compute this yourself
		- Multiple lines/bars/series split by a category ("one line per gender", "sales by month split by region") — call the pivot tool ONCE rather than calling a single-series tool multiple times and merging the results yourself. Its result already has one field per series value — use those exact field names as your yKeys dataKeys.
		- Any question that requires computing across the full dataset (not just the 5 sample rows)

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
		"data": [{ "xKey column name": "value", "dataKey column name": "number" }]
		}
		
		IMPORTANT — When you used a tool, include a "data" array in the JSON block with the actual computed values. Each object in the array should have one
		key for the x-axis label and one key matching yKeys[0].dataKey for the computed value — use the same field name the tool's result already used
		(e.g. "average", "sum", "stddev", "percentile", "percentage") as that dataKey, don't rename it.
		This ensures the chart shows the real computed numbers, not raw column sums.
		For PieChart and frequency BarChart (where you want to count rows per category): set xKey to the categorical column and yKeys[0].dataKey to "count", 
		and include the counted data in the "data" array.
		If you did NOT use a tool, omit the "data" field and the chart will render from the raw dataset rows.
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
      dataset.rows,  // pass the full dataset rows so the tool can compute on them
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
  res.json({ explanation, config });
});

export default router;
