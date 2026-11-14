const env = import.meta.env || {}

const toNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const binRoot = (env.VITE_FIREBASE_BIN_ROOT || 'smart_bin_01').replace(/^\/+|\/+$/g, '')

/**
 * Fixed physical bin coordinates (rigid node location).
 * Collector GPS is live; the bin never moves.
 */
export const BIN_LOCATION = {
  latitude: toNumber(env.VITE_BIN_LATITUDE, 0.28771512921183306),
  longitude: toNumber(env.VITE_BIN_LONGITUDE, 32.538981266575874),
  label: env.VITE_BIN_LOCATION_LABEL || 'Mutundwe',
}

export const config = {
  dataSource: (env.VITE_DATA_SOURCE || 'firebase').toLowerCase(),
  apiBaseUrl: (env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, ''),
  binNodeId: env.VITE_BIN_NODE_ID || 'smart_bin_01',
  pollIntervalMs: toNumber(env.VITE_POLL_INTERVAL_MS, 5000),
  firebase: {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    binRoot,
    liveStatusPath: env.VITE_FIREBASE_LIVE_STATUS_PATH || `${binRoot}/live_status`,
    collectionHistoryPath:
      env.VITE_FIREBASE_COLLECTION_HISTORY_PATH || `${binRoot}/collection_history`,
    binPath: env.VITE_FIREBASE_BIN_PATH || `${binRoot}/live_status`,
  },
}

export const DEFAULT_TREND = [
  { time: '00:00', fill: 12 },
  { time: '03:00', fill: 18 },
  { time: '06:00', fill: 28 },
  { time: '09:00', fill: 45 },
  { time: '12:00', fill: 62 },
  { time: '15:00', fill: 75 },
  { time: '18:00', fill: 84 },
  { time: '21:00', fill: 89 },
]

/** Rough Li-ion / pack voltage → % for UI when battery_level is absent */
function voltageToPercent(voltage) {
  const v = Number(voltage)
  if (!Number.isFinite(v)) return null
  const min = 3.3
  const max = 4.2
  return Math.max(0, Math.min(100, Math.round(((v - min) / (max - min)) * 100)))
}

/**
 * Map Firebase `collection_status` strings (and fill) → internal cycle state.
 */
export function mapCollectionCycle(collectionStatus, fillPercentage) {
  const status = String(collectionStatus || '').toLowerCase()

  if (status.includes('complete') || status.includes('emptied') || status.includes('collected')) {
    return 'complete'
  }
  if (
    status.includes('critical') ||
    status.includes('needs collection') ||
    status.includes('awaiting') ||
    status.includes('action')
  ) {
    return 'awaiting_collection'
  }
  if (status.includes('normal') || status.includes('ok') || status.includes('active')) {
    return 'active'
  }

  if (fillPercentage > 80) return 'awaiting_collection'
  if (fillPercentage < 15) return 'complete'
  return 'active'
}

/**
 * Normalize Realtime Database `smart_bin_01/live_status` (and aliases)
 * into the dashboard telemetry shape.
 *
 * Your live schema:
 * {
 *   battery_voltage: 4.3795,
 *   collection_status: "Critical / Needs Collection",
 *   fill_level_percent: 79
 * }
 */
export function normalizeTelemetry(raw = {}) {
  const dTotal = Number(raw.d_total ?? raw.dTotal ?? raw.depth_total ?? 100)

  const fillFromBackend =
    raw.fill_level_percent ??
    raw.fill_percentage ??
    raw.fillPercentage ??
    raw.fill_level ??
    raw.volume_percent ??
    raw.volume

  let fillPercentage
  if (fillFromBackend != null && Number.isFinite(Number(fillFromBackend))) {
    fillPercentage = Math.max(0, Math.min(100, Math.round(Number(fillFromBackend))))
  } else {
    const dMeasuredRaw = Number(raw.d_measured ?? raw.dMeasured ?? raw.distance_cm)
    fillPercentage = Number.isFinite(dMeasuredRaw)
      ? Math.max(0, Math.min(100, Math.round((1 - dMeasuredRaw / dTotal) * 100)))
      : 0
  }

  const dMeasuredExplicit = Number(raw.d_measured ?? raw.dMeasured ?? raw.distance_cm)
  const dMeasured = Number.isFinite(dMeasuredExplicit)
    ? dMeasuredExplicit
    : Math.round((1 - fillPercentage / 100) * dTotal)

  const batteryVoltage = Number(raw.battery_voltage ?? raw.batteryVoltage ?? NaN)
  const batteryLevelExplicit = Number(raw.battery_level ?? raw.batteryLevel ?? raw.battery)
  const batteryLevel = Number.isFinite(batteryLevelExplicit)
    ? batteryLevelExplicit
    : voltageToPercent(batteryVoltage) ?? 0

  const collectionStatus =
    raw.collection_status ?? raw.collectionStatus ?? raw.status ?? null

  const collectionCycle =
    raw.collection_cycle ??
    raw.collectionCycle ??
    mapCollectionCycle(collectionStatus, fillPercentage)

  const signalRaw = raw.signal_quality ?? raw.signalQuality ?? raw.rssi_quality
  const signalDbmRaw = raw.signal_dbm ?? raw.signalDbm ?? raw.rssi

  return {
    nodeId: raw.node_id ?? raw.nodeId ?? config.binNodeId,
    locationLabel: raw.location_label ?? raw.locationLabel ?? BIN_LOCATION.label,
    // Bin is physically fixed — always prefer configured rigid coordinates
    latitude: BIN_LOCATION.latitude,
    longitude: BIN_LOCATION.longitude,
    dTotal,
    dMeasured,
    fillPercentage,
    batteryLevel,
    batteryVoltage: Number.isFinite(batteryVoltage) ? Number(batteryVoltage.toFixed(4)) : null,
    signalQuality: signalRaw != null ? Number(signalRaw) : null,
    signalDbm: signalDbmRaw != null ? Number(signalDbmRaw) : null,
    lastSync: raw.last_sync ?? raw.lastSync ?? null,
    status: collectionStatus || raw.status || 'active',
    collectionStatus: collectionStatus || mapCollectionStatusLabel(collectionCycle),
    collectionCycle,
    lastEmptyAt: raw.last_empty_at ?? raw.lastEmptyAt ?? null,
    volumeRemovedLast: Number(
      raw.volume_removed ?? raw.volumeRemovedLast ?? raw.last_volume_removed ?? 0,
    ),
    trend:
      Array.isArray(raw.trend) && raw.trend.length
        ? raw.trend.map((point) => ({
            time: point.time ?? point.timestamp ?? point.t,
            fill: Number(point.fill ?? point.fill_percentage ?? point.fill_level_percent ?? point.value ?? 0),
          }))
        : [...DEFAULT_TREND],
  }
}

function mapCollectionStatusLabel(cycle) {
  switch (cycle) {
    case 'awaiting_collection':
      return 'Critical / Needs Collection'
    case 'complete':
      return 'Collection cycle complete'
    default:
      return 'Normal / Capacity OK'
  }
}
