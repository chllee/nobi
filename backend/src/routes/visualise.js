import { Router } from 'express';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { ObjectId } from 'mongodb';
import { requireAuth, requireMembership } from '../middleware/auth.js';
import { getDb } from '../lib/mongo.js';

const router = Router();

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
]

// ─── Step 1: Define the tool(s) we want Gemini to be able to call ─────────────
// This tells Gemini: "You have a function called compute_aggregation.
// Here's what it does, what parameters it expects, and which ones are required."
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'compute_aggregation',
        description: 'Aggregate a numeric column from the dataset, optionally grouped by another column. Returns computed values that you can use in your response and chart.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            agg_column: {
              type: SchemaType.STRING,
              description: 'The numeric column to aggregate (e.g. "sales", "age", "revenue")',
            },
            operation: {
              type: SchemaType.STRING,
              enum: ['sum', 'avg', 'count', 'min', 'max'],
              description: 'The aggregation operation to perform',
            },
            group_by_column: {
              type: SchemaType.STRING,
              description: 'Optional column to group results by (e.g. "region", "category"). If omitted, returns a single aggregated value.',
            },
          },
          required: ['agg_column', 'operation'],
        },
      },
    ],
  },
]

// ─── Step 2: The function that actually runs the computation on real data ──────
// When Gemini calls compute_aggregation, this function runs against the dataset rows.
// It returns the result, which gets sent back to Gemini.
function executeAggregation(rows, args) {
  const { agg_column, operation, group_by_column } = args

  if (group_by_column) {
    // GROUPED aggregation: split rows by group_by_column, then compute per group
    const groups = {}
    for (const row of rows) {
      const key = String(row[group_by_column] ?? '')
      if (!groups[key]) groups[key] = []
      groups[key].push(row)
    }

    const results = []
    for (const [key, groupRows] of Object.entries(groups)) {
      const values = groupRows.map(r => Number(r[agg_column])).filter(v => !isNaN(v))
      let result
      switch (operation) {
        case 'sum':   result = values.reduce((a, b) => a + b, 0); break
        case 'avg':   result = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; break
        case 'count': result = values.length; break
        case 'min':   result = values.length ? Math.min(...values) : 0; break
        case 'max':   result = values.length ? Math.max(...values) : 0; break
        default:      result = 0
      }
      results.push({ [group_by_column]: key, [operation]: result })
    }
    return results
  } else {
    // UNGROUPED aggregation: single value across all rows
    const values = rows.map(r => Number(r[agg_column])).filter(v => !isNaN(v))
    let result
    switch (operation) {
      case 'sum':   result = values.reduce((a, b) => a + b, 0); break
      case 'avg':   result = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; break
      case 'count': result = values.length; break
      case 'min':   result = values.length ? Math.min(...values) : 0; break
      case 'max':   result = values.length ? Math.max(...values) : 0; break
      default:      result = 0
    }
    return { [operation]: result }
  }
}

// ─── Step 3: The main Gemini caller with the tool loop ─────────────────────────
// This replaces the old callGemini. The key change:
//   1. Start the chat with tools declared (Gemini now knows it can call functions)
//   2. Send the message
//   3. Check if Gemini returned a functionCall instead of text
//   4. If it did: execute the function, send the result back, get final text
//   5. If it didn't: we're done, return the text
async function callGeminiWithTools(apiKey, systemInstruction, history, lastMessage, rows) {
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError;

  for (const modelName of MODELS) {
    try {
      // Start a chat session WITH tools declared
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });
      const chat = model.startChat({ history, tools: TOOLS });

      // ── Turn 1: Send the user's message ──
      const turn1 = await chat.sendMessage(lastMessage);

      // ── Check if Gemini wants to call a function ──
      const calls = turn1.response.functionCalls?.() || [];

      if (calls.length > 0) {
        // Gemini returned a function call — run the function and send results back
        const functionResponses = calls.map(fn => {
          console.log(`⚡ Gemini called: ${fn.name}(${JSON.stringify(fn.args)})`);
          const result = executeAggregation(rows, fn.args);
          return {
            functionResponse: {
              name: fn.name,
              response: { result },
            },
          };
        });

        // ── Turn 2: Send the function results back to Gemini ──
        // Gemini now has the computed data and can give us the final answer
        const turn2 = await chat.sendMessage(functionResponses);
        const finalText = turn2.response.text();
        return finalText;
      }

      // No function call — Gemini answered directly from the system prompt
      return turn1.response.text();
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
  const systemInstruction = `You are a data analysis and visualisation assistant. The user has a dataset called "${dataset.name}" with columns: ${dataset.columns.join(', ')}.

Sample data (up to 5 rows — use compute_aggregation for real analysis):
${JSON.stringify(sampleRows, null, 2)}

You have access to the full dataset through the compute_aggregation tool.
Use this tool whenever the user asks about:
- Totals, sums, averages, counts, minimums, maximums
- Breakdowns by category or group
- Any question that requires computing across the full dataset (not just the 5 sample rows)

After calling compute_aggregation, analyse the result and:
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
IMPORTANT — When you used compute_aggregation, include a "data" array in the JSON block with the actual computed values. Each object in the array should have one key for the x-axis label and one key for the dataKey value. This ensures the chart shows the real computed numbers, not raw column sums.
For PieChart and frequency BarChart (where you want to count rows per category): set xKey to the categorical column and yKeys[0].dataKey to "count", and include the counted data in the "data" array.
If you did NOT use compute_aggregation, omit the "data" field and the chart will render from the raw dataset rows.
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
