import { memo, useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  ScatterChart, Scatter,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Label,
} from 'recharts'

const PIE_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16']
const MAX_SAMPLE   = 300
const MAX_PIE      = 10
const MAX_BAR      = 25

// ─── data helpers ────────────────────────────────────────────────────────────

function columnExists(rows, key) {
  return rows.length > 0 && key in rows[0]
}

function isCountMode(rows, yKeys) {
  return yKeys.length === 1 && !columnExists(rows, yKeys[0].dataKey)
}

function buildAggMap(rows, xKey, yKeys) {
  const primary  = yKeys[0].dataKey
  const counting = isCountMode(rows, yKeys)
  const map      = new Map()
  rows.forEach(r => {
    const key = String(r[xKey] ?? '')
    if (!map.has(key)) {
      const entry = { [xKey]: key }
      yKeys.forEach(y => { entry[y.dataKey] = 0 })
      map.set(key, entry)
    }
    const entry = map.get(key)
    if (counting) {
      entry[primary] += 1
    } else {
      yKeys.forEach(y => { entry[y.dataKey] += Number(r[y.dataKey]) || 0 })
    }
  })
  return { map, primary }
}

// Pie — aggregate, sort by value desc (biggest slice first), cap to topN
function aggregateByValue(rows, xKey, yKeys, topN) {
  const { map, primary } = buildAggMap(rows, xKey, yKeys)
  return Array.from(map.values())
    .sort((a, b) => b[primary] - a[primary])
    .slice(0, topN)
}

// Bar — numeric xKey → sort by xKey asc (natural order); categorical → sort by value desc
function aggregateBarData(rows, xKey, yKeys, topN) {
  const { map, primary } = buildAggMap(rows, xKey, yKeys)
  const data = Array.from(map.values())
  const isNumeric = data.length > 0 && data.every(d => d[xKey] !== '' && !isNaN(Number(d[xKey])))
  if (isNumeric) {
    data.forEach(d => { d[xKey] = Number(d[xKey]) })
    return data.sort((a, b) => a[xKey] - b[xKey]).slice(0, topN)
  }
  return data.sort((a, b) => b[primary] - a[primary]).slice(0, topN)
}

// Line / Area (count mode) — aggregate then sort by xKey asc for distribution shape
function aggregateByXKey(rows, xKey, yKeys) {
  const { map } = buildAggMap(rows, xKey, yKeys)
  const data = Array.from(map.values())
  const isNumeric = data.length > 0 && data.every(d => !isNaN(Number(d[xKey])))
  if (isNumeric) data.forEach(d => { d[xKey] = Number(d[xKey]) })
  data.sort((a, b) => isNumeric
    ? a[xKey] - b[xKey]
    : String(a[xKey]).localeCompare(String(b[xKey])))
  if (data.length <= MAX_SAMPLE) return data
  const step = data.length / MAX_SAMPLE
  return Array.from({ length: MAX_SAMPLE }, (_, i) => data[Math.floor(i * step)])
}

// Line / Area (real yKey) + Scatter — even sample, convert yKeys to numbers
function evenSample(rows, xKey, yKeys, convertX = false) {
  const src = rows.length <= MAX_SAMPLE ? rows : (() => {
    const step = rows.length / MAX_SAMPLE
    return Array.from({ length: MAX_SAMPLE }, (_, i) => rows[Math.floor(i * step)])
  })()
  return src.map(r => {
    const out = { ...r }
    yKeys.forEach(y => { out[y.dataKey] = Number(r[y.dataKey]) || 0 })
    if (convertX) out[xKey] = Number(r[xKey]) || 0
    return out
  })
}

function prepareData(rows, config) {
  const { chartType, xKey, yKeys } = config
  const counting = isCountMode(rows, yKeys)
  if (chartType === 'PieChart')   return aggregateByValue(rows, xKey, yKeys, MAX_PIE)
  if (chartType === 'BarChart')   return aggregateBarData(rows, xKey, yKeys, MAX_BAR)
  if ((chartType === 'LineChart' || chartType === 'AreaChart') && counting)
                                  return aggregateByXKey(rows, xKey, yKeys)
  if (chartType === 'ScatterChart') return evenSample(rows, xKey, yKeys, true)
  return evenSample(rows, xKey, yKeys, false)
}

// ─── validation ──────────────────────────────────────────────────────────────

function getValidationError(rows, config) {
  const { chartType, xKey, yKeys } = config

  if (!columnExists(rows, xKey)) {
    return `Column "${xKey}" not found in this dataset — try rephrasing your prompt with an exact column name`
  }

  if (chartType === 'ScatterChart') {
    const yKey = yKeys[0]?.dataKey
    if (!yKey || !columnExists(rows, yKey)) {
      return `Column "${yKey}" not found — scatter charts need two existing numeric columns`
    }
    const sample = rows.slice(0, 20)
    if (sample.every(r => isNaN(Number(r[xKey])))) {
      return `Column "${xKey}" does not appear to be numeric — scatter charts require numeric axes`
    }
    if (sample.every(r => isNaN(Number(r[yKey])))) {
      return `Column "${yKey}" does not appear to be numeric — scatter charts require numeric axes`
    }
  }

  return null
}

// ─── optional tweak fields (yAxis / legend / series) ──────────────────────────
// No schema enforcement exists on Gemini's chart-config JSON (see
// visualise.js) — a malformed value here is still syntactically valid JSON,
// so each field is validated independently and dropped (with a console.warn)
// rather than trusted, keeping one bad field from breaking the whole render.

const CURVE_TYPES = ['linear', 'monotone', 'step', 'natural']
const LEGEND_ALIGN = {
  top:    { verticalAlign: 'top',    align: 'center' },
  bottom: { verticalAlign: 'bottom', align: 'center' },
  left:   { verticalAlign: 'middle', align: 'left' },
  right:  { verticalAlign: 'middle', align: 'right' },
}

function sanitizeChartOptions(config) {
  const opts = { yAxis: {}, legend: {}, series: {} }

  const domain = config.yAxis?.domain
  if (Array.isArray(domain) && domain.length === 2 && domain.every(n => typeof n === 'number' && isFinite(n)) && domain[0] < domain[1]) {
    opts.yAxis.domain = domain
  } else if (domain !== undefined) {
    console.warn('ChartRenderer: ignoring invalid yAxis.domain', domain)
  }

  const scale = config.yAxis?.scale
  if (scale === 'linear' || scale === 'log') {
    opts.yAxis.scale = scale
    if (scale === 'log' && opts.yAxis.domain?.some(n => n <= 0)) {
      delete opts.yAxis.domain   // log scale can't render a non-positive bound
    }
  } else if (scale !== undefined) {
    console.warn('ChartRenderer: ignoring invalid yAxis.scale', scale)
  }

  const position = config.legend?.position
  if (position in LEGEND_ALIGN) {
    opts.legend.position = position
  } else if (position !== undefined) {
    console.warn('ChartRenderer: ignoring invalid legend.position', position)
  }

  const curveType = config.series?.curveType
  if (CURVE_TYPES.includes(curveType)) {
    opts.series.curveType = curveType
  } else if (curveType !== undefined) {
    console.warn('ChartRenderer: ignoring invalid series.curveType', curveType)
  }

  const stacked = config.series?.stacked
  if (typeof stacked === 'boolean') {
    opts.series.stacked = stacked
  } else if (stacked !== undefined) {
    console.warn('ChartRenderer: ignoring invalid series.stacked', stacked)
  }

  return opts
}

// ─── component ───────────────────────────────────────────────────────────────

function ChartRenderer({ config, rows }) {
  const data = useMemo(
    () => {
      if (config?.data) return config.data          // pre-computed data from Gemini
      return (config && rows?.length ? prepareData(rows, config) : [])
    },
    [rows, config]
  )

  const validationError = useMemo(
    () => {
      if (config?.data) return null                 // computed data is always valid
      return (config && rows?.length ? getValidationError(rows, config) : null)
    },
    [rows, config]
  )

  const chartOptions = useMemo(() => sanitizeChartOptions(config || {}), [config])

  if (!config || !rows?.length) return null

  if (validationError) {
    return (
      <div style={{ padding: '16px', color: '#dc2626', fontSize: 14, lineHeight: 1.5 }}>
        <strong>Chart error:</strong> {validationError}
      </div>
    )
  }

  if (!data.length) {
    return (
      <div style={{ padding: '16px', color: '#6b7280', fontSize: 14 }}>
        No data to display for this chart.
      </div>
    )
  }

  const margin = { top: 10, right: 20, left: 0, bottom: 70 }

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey={config.xKey} tick={{ fontSize: 12 }} angle={-35} textAnchor="end" interval="preserveStartEnd">
        {config.xLabel && <Label value={config.xLabel} offset={20} position="bottom" style={{ textAnchor: 'middle', fontSize: 13, fill: '#6b7280' }} />}
      </XAxis>
      <YAxis tick={{ fontSize: 12 }} domain={chartOptions.yAxis.domain} scale={chartOptions.yAxis.scale}>
        {config.yLabel && <Label value={config.yLabel} angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fontSize: 13, fill: '#6b7280' }} />}
      </YAxis>
      <Tooltip />
      <Legend
        verticalAlign={LEGEND_ALIGN[chartOptions.legend.position ?? 'bottom'].verticalAlign}
        align={LEGEND_ALIGN[chartOptions.legend.position ?? 'bottom'].align}
        height={36}
        wrapperStyle={{ paddingTop: 32 }}
      />
    </>
  )

  let chart
  if (config.chartType === 'BarChart') {
    chart = (
      <BarChart data={data} margin={margin}>
        {axes}
        {config.yKeys.map(y => (
          <Bar key={y.dataKey} dataKey={y.dataKey} name={y.name} fill={y.color} stackId={chartOptions.series.stacked ? '1' : undefined} />
        ))}
      </BarChart>
    )
  } else if (config.chartType === 'LineChart') {
    chart = (
      <LineChart data={data} margin={margin}>
        {axes}
        {config.yKeys.map(y => (
          <Line key={y.dataKey} type={chartOptions.series.curveType ?? 'monotone'} dataKey={y.dataKey} name={y.name} stroke={y.color} dot={false} />
        ))}
      </LineChart>
    )
  } else if (config.chartType === 'AreaChart') {
    chart = (
      <AreaChart data={data} margin={margin}>
        {axes}
        {config.yKeys.map(y => (
          <Area key={y.dataKey} type={chartOptions.series.curveType ?? 'monotone'} dataKey={y.dataKey} name={y.name}
            stroke={y.color} fill={y.color} fillOpacity={0.2} stackId={chartOptions.series.stacked ? '1' : undefined} />
        ))}
      </AreaChart>
    )
  } else if (config.chartType === 'PieChart') {
    chart = (
      <PieChart>
        <Pie data={data} dataKey={config.yKeys[0].dataKey} nameKey={config.xKey}
          cx="50%" cy="50%" outerRadius={130} label>
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    )
  } else if (config.chartType === 'ScatterChart') {
    chart = (
      <ScatterChart margin={margin}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={config.xKey} type="number" name={config.xKey} tick={{ fontSize: 12 }}>
          {config.xLabel && <Label value={config.xLabel} offset={-5} position="insideBottom" style={{ textAnchor: 'middle', fontSize: 13, fill: '#6b7280' }} />}
        </XAxis>
        <YAxis dataKey={config.yKeys[0].dataKey} type="number" name={config.yKeys[0].name} tick={{ fontSize: 12 }} domain={chartOptions.yAxis.domain} scale={chartOptions.yAxis.scale}>
          {config.yLabel && <Label value={config.yLabel} angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fontSize: 13, fill: '#6b7280' }} />}
        </YAxis>
        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
        <Scatter data={data} fill={config.yKeys[0].color} />
      </ScatterChart>
    )
  } else {
    return (
      <div style={{ padding: '16px', color: '#6b7280', fontSize: 14 }}>
        Unsupported chart type: {config.chartType}
      </div>
    )
  }

  return (
    <div style={{ width: '100%' }}>
      {config.title && (
        <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#111827' }}>
          {config.title}
        </p>
      )}
      <ResponsiveContainer width="100%" height={380}>
        {chart}
      </ResponsiveContainer>
    </div>
  )
}

export default memo(ChartRenderer)
