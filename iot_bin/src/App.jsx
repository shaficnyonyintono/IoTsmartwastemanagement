import { useEffect, useState } from 'react'
import {
  Trash2,
  Wifi,
  Battery,
  MapPin,
  BarChart3,
  Clock,
  Sun,
  Moon,
  AlertTriangle,
  History,
  CheckCircle2,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useBinTelemetry } from './hooks/useBinTelemetry'
import BinRouteMap from './components/BinRouteMap'
import ErrorBoundary from './components/ErrorBoundary'

function getStatusTheme(fill) {
  if (fill >= 80) {
    return {
      textClass: 'text-red-400',
      bgClass: 'bg-red-500/10',
      borderClass: 'border-red-500/30',
      halo: 'bg-red-500',
      markerColor: '#ef4444',
    }
  }
  if (fill >= 60) {
    return {
      textClass: 'text-amber-400',
      bgClass: 'bg-amber-500/10',
      borderClass: 'border-amber-500/30',
      halo: 'bg-amber-500',
      markerColor: '#f59e0b',
    }
  }
  return {
    textClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/30',
    halo: 'bg-emerald-500',
    markerColor: '#10b981',
  }
}

function getCycleLabel(cycle, collectionStatus) {
  if (collectionStatus) {
    const lower = String(collectionStatus).toLowerCase()
    if (lower.includes('critical') || lower.includes('needs')) {
      return { text: collectionStatus, className: 'text-amber-300 border-amber-500/40 bg-amber-500/10' }
    }
    if (lower.includes('complete') || lower.includes('emptied')) {
      return { text: collectionStatus, className: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' }
    }
    return { text: collectionStatus, className: 'text-slate-300 border-slate-600 bg-slate-800' }
  }

  switch (cycle) {
    case 'awaiting_collection':
      return { text: 'Critical / Needs Collection', className: 'text-amber-300 border-amber-500/40 bg-amber-500/10' }
    case 'complete':
      return { text: 'Collection cycle complete', className: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' }
    default:
      return { text: 'Normal / Capacity OK', className: 'text-slate-300 border-slate-600 bg-slate-800' }
  }
}

function formatTimestamp(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function App() {
  const [darkMode, setDarkMode] = useState(true)
  const [currentTime, setCurrentTime] = useState('')

  const {
    telemetry,
    collectionHistory,
    loading,
    error,
    toastMessage,
    dataSource,
  } = useBinTelemetry()

  const {
    nodeId,
    locationLabel,
    latitude,
    longitude,
    dTotal,
    dMeasured,
    fillPercentage,
    batteryLevel,
    batteryVoltage,
    signalQuality,
    signalDbm,
    lastSync,
    trend,
    collectionCycle,
    collectionStatus,
    lastEmptyAt,
    volumeRemovedLast,
  } = telemetry

  const statusTheme = getStatusTheme(fillPercentage)
  const cycleLabel = getCycleLabel(collectionCycle, collectionStatus)

  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      const formatted =
        now.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }) +
        ', ' +
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) +
        ' EAT'
      setCurrentTime(formatted)
    }

    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      className={`min-h-screen pb-6 font-sans transition-colors duration-300 ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {toastMessage && (
        <div className="fixed top-16 left-1/2 z-50 flex w-11/12 max-w-md -translate-x-1/2 items-center gap-2 rounded-xl border border-emerald-500/40 bg-slate-900/95 px-4 py-3 text-xs font-semibold text-emerald-300 shadow-2xl backdrop-blur-md">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-md ${
          darkMode ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/90'
        }`}
      >
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-2.5">
            
            <div>
              <h1 className="text-sm font-bold tracking-tight text-emerald-400">
                IoT Smart Waste Node
              </h1>
              <p className="font-mono text-[10px] text-slate-400">{locationLabel}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDarkMode(!darkMode)}
            className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 transition active:scale-95"
            aria-label="Toggle theme"
          >
            {darkMode ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-indigo-400" />
            )}
          </button>
        </div>

        <div className="border-t border-slate-800/40 bg-slate-950/60">
          <div className="mx-auto flex max-w-md items-center px-4 py-1.5 font-mono text-[11px] text-slate-400">
            <div className="flex items-center space-x-1.5">
               <Clock className="h-3.5 w-3.5 text-cyan-400" /> 
              <span>{currentTime || 'Loading time...'}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400">
            Loading telemetry from {dataSource}…
          </div>
        )}

        {/* Bin fill capacity */}
        <div
          className={`space-y-3 rounded-2xl border p-4 ${
            darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Bin Capacity
            </span>
            <span
              className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${cycleLabel.className}`}
            >
              {cycleLabel.text}
            </span>
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="relative flex h-28 w-28 items-center justify-center">
              <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                <path
                  className="text-slate-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={`transition-all duration-500 ${statusTheme.textClass}`}
                  strokeDasharray={`${fillPercentage}, 100`}
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold tracking-tight">{fillPercentage}%</span>
                <span className="font-mono text-[9px] text-slate-400">FILL LEVEL</span>
              </div>
            </div>

            <div className="space-y-2 text-right font-mono text-xs">
              <div>
                <span className="block font-sans text-[10px] text-slate-400">DISTANCE (D_measured)</span>
                <span className={`text-sm font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  {dMeasured} cm
                </span>
              </div>
              <div>
                <span className="block font-sans text-[10px] text-slate-400">DEPTH (D_total)</span>
                <span className={`text-sm font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  {dTotal} cm
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Hardware node */}
        <div
          className={`space-y-3 rounded-2xl border p-4 ${
            darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              IoT Hardware Node
            </span>
            <span className="font-mono text-[10px] text-slate-400">Node ID: {nodeId}</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
              <div className="mb-1 flex items-center space-x-1.5 text-slate-400">
                <Wifi className="h-3.5 w-3.5 text-cyan-400" />
                <span className="font-sans text-[10px]">Signal</span>
              </div>
              <div className="text-xs font-bold text-slate-200">
                {signalQuality != null
                  ? `${signalQuality}%${signalDbm != null ? ` (${signalDbm}dBm)` : ''}`
                  : '—'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
              <div className="mb-1 flex items-center space-x-1.5 text-slate-400">
                <Battery className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-sans text-[10px]">Battery</span>
              </div>
              <div className="text-xs font-bold text-slate-200">
                {batteryVoltage != null
                  ? `${batteryVoltage}V${batteryLevel != null ? ` (~${batteryLevel}%)` : ''}`
                  : batteryLevel != null
                    ? `${batteryLevel}%`
                    : '—'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
            <span>Last Telemetry Sync:</span>
            <span className="font-mono text-slate-200">{lastSync || '—'} EAT</span>
          </div>
        </div>

        {/* Embedded in-app routing map */}
        <div
          className={`space-y-3 rounded-2xl border p-4 ${
            darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <MapPin className="h-4 w-4 text-emerald-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Live Collector Route
              </h2>
            </div>
            <span className="font-mono text-[10px] text-slate-400">
              Bin {latitude.toFixed(5)}° N, {longitude.toFixed(5)}° E
            </span>
          </div>

          <ErrorBoundary>
            <BinRouteMap
              latitude={latitude}
              longitude={longitude}
              nodeId={nodeId}
              fillPercentage={fillPercentage}
              markerColor={statusTheme.markerColor}
            />
          </ErrorBoundary>
        </div>

        {/* Trend chart */}
        <div
          className={`space-y-3 rounded-2xl border p-4 ${
            darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'
          }`}
        >
          <div className="flex items-center space-x-1.5">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Volumetric Trend
            </h2>
          </div>

          <div className="h-44 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} unit="%" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="fill"
                  stroke={statusTheme.markerColor}
                  strokeWidth={2.5}
                  fill={statusTheme.markerColor}
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Section 3.6.3 — Collection history audit log */}
        <div
          className={`space-y-3 rounded-2xl border p-4 ${
            darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <History className="h-4 w-4 text-emerald-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Collection History
              </h2>
            </div>
            <span className="font-mono text-[10px] text-slate-500">
              {collectionHistory.length} event{collectionHistory.length === 1 ? '' : 's'}
            </span>
          </div>

          {(collectionCycle === 'complete' || lastEmptyAt) && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
              Last collection removed <span className="font-mono font-bold">{volumeRemovedLast}%</span>
              {lastEmptyAt ? ` · ${formatTimestamp(lastEmptyAt)}` : ''}
            </div>
          )}

          {collectionHistory.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              No emptying events yet. A log entry is created automatically when fill drops from
              &gt;80% to &lt;15%.
            </p>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-y-auto">
              {collectionHistory.slice(0, 12).map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-[10px] text-slate-300"
                >
                  <div className="mb-1 text-slate-400">{formatTimestamp(row.timestamp)}</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="block text-slate-500">V_before</span>
                      <span className="font-bold text-slate-100">{row.preEmptyVolume}%</span>
                    </div>
                    <div>
                      <span className="block text-slate-500">V_after</span>
                      <span className="font-bold text-slate-100">{row.postEmptyVolume}%</span>
                    </div>
                    <div>
                      <span className="block text-slate-500">Removed</span>
                      <span className="font-bold text-emerald-400">{row.volumeRemoved}%</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
