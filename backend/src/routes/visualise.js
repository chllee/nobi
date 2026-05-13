import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ObjectId } from 'mongodb';
import { requireAuth, requireMembership } from '../middleware/auth.js';
import { getDb } from '../lib/mongo.js';

const router = Router();

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
]

async function callGemini(apiKey, systemInstruction, history, lastMessage) {
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError;
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(lastMessage);
      console.log(`Gemini model used: ${modelName}`);
      return result.response.text();
    } catch (err) {
      if (err.status === 429 || err.status === 503) {
        console.warn(`${modelName} unavailable (${err.status}), trying next…`);
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

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

  const sampleRows = dataset.rows.slice(0, 20);
  const systemInstruction = `You are a data visualisation assistant. The user has a dataset called "${dataset.name}" with columns: ${dataset.columns.join(', ')}.

Sample data (up to 20 rows):
${JSON.stringify(sampleRows, null, 2)}

For every response you must:
1. Give a brief plain-English explanation of what you are showing and why you chose this chart type.
2. Include a JSON code block (\`\`\`json) with this exact structure:
{
  "chartType": "BarChart" | "LineChart" | "PieChart" | "AreaChart" | "ScatterChart",
  "title": "descriptive chart title",
  "xKey": "column name for x-axis or pie labels",
  "yKeys": [{ "dataKey": "column name", "name": "display label", "color": "#hexcolor" }]
}
For PieChart and frequency BarChart (where you want to count how many rows fall into each category): set xKey to the categorical column and yKeys[0].dataKey to "count" — the system will count occurrences automatically.
For all other charts: only use column names that exactly match those listed above. Always include the JSON block — even when the user asks to refine an existing chart.`;

  // Gemini uses 'user'/'model' roles; our messages use 'user'/'assistant'
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const lastMessage = messages[messages.length - 1].content;

  let text;
  try {
    text = await callGemini(process.env.GEMINI_API_KEY, systemInstruction, history, lastMessage);
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
