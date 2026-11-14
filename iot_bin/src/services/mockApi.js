import { BIN_LOCATION, DEFAULT_TREND, config, normalizeTelemetry } from '../config'
import {
  createEmptyingDetector,
  normalizeCollectionRecord,
} from './emptyingDetection'

const detector = createEmptyingDetector()

let mockState = normalizeTelemetry({
  node_id: config.binNodeId,
  d_total: 100,
  d_measured: 25,
  fill_percentage: 75,
  battery_level: 94,
  battery_voltage: 3.95,
  signal_quality: 88,
  signal_dbm: -64,
  latitude: BIN_LOCATION.latitude,
  longitude: BIN_LOCATION.longitude,
  location_label: BIN_LOCATION.label,
  last_sync: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  collection_cycle: 'active',
  trend: DEFAULT_TREND,
})

/** In-memory stand-in for /smart_bin_01/collection_history */
let collectionHistory = []
let historyListeners = new Set()
let liveListeners = new Set()

const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms))

function notifyLive() {
  const payload = { ...mockState, trend: [...mockState.trend] }
  liveListeners.forEach((cb) => cb(payload))
}

function notifyHistory() {
  const list = [...collectionHistory]
  historyListeners.forEach((cb) => cb(list))
}

function applyFillAndDetect(fillPercentage, extra = {}) {
  const { event, collectionCycle } = detector.process(fillPercentage)
  const timeNow = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  if (event) {
    const record = normalizeCollectionRecord(`mock_${Date.now()}`, {
      timestamp: event.timestamp,
      pre_empty_volume: event.pre_empty_volume,
      post_empty_volume: event.post_empty_volume,
      volume_removed: event.volume_removed,
    })
    collectionHistory = [record, ...collectionHistory].slice(0, 50)
    notifyHistory()

    mockState = normalizeTelemetry({
      ...mockState,
      ...extra,
      fill_percentage: event.post_empty_volume,
      d_measured: Math.round((1 - event.post_empty_volume / 100) * mockState.dTotal),
      collection_cycle: 'complete',
      last_empty_at: event.timestamp,
      volume_removed: event.volume_removed,
      last_sync: timeNow,
      trend: [...mockState.trend.slice(1), { time: timeNow, fill: event.post_empty_volume }],
    })

    mockState = {
      ...mockState,
      lastCollectionEvent: {
        timestamp: event.timestamp,
        preEmptyVolume: event.pre_empty_volume,
        postEmptyVolume: event.post_empty_volume,
        volumeRemoved: event.volume_removed,
      },
    }

    notifyLive()
    return mockState
  }

  mockState = normalizeTelemetry({
    ...mockState,
    ...extra,
    fill_percentage: fillPercentage,
    d_measured: Math.round((1 - fillPercentage / 100) * mockState.dTotal),
    collection_cycle: collectionCycle,
    last_sync: timeNow,
  })

  notifyLive()
  return { ...mockState, trend: [...mockState.trend] }
}

export const mockApi = {
  async getTelemetry() {
    await delay()
    return { ...mockState, trend: [...mockState.trend] }
  },

  async syncTelemetry() {
    await delay(400)
    mockState = {
      ...mockState,
      lastSync: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    }
    notifyLive()
    return { ...mockState, trend: [...mockState.trend] }
  },

  async emptyBin() {
    // Simulate sensor drop: must be primed (>80) first, then <15
    if (mockState.fillPercentage <= 80) {
      applyFillAndDetect(85)
    }
    await delay(300)
    return applyFillAndDetect(8)
  },

  async setMeasuredDistance(cm) {
    const next = Math.max(5, Math.min(95, Number(cm)))
    const fill = Math.round((1 - next / mockState.dTotal) * 100)
    await delay(50)
    return applyFillAndDetect(fill, { d_measured: next })
  },

  /**
   * Demo helper: drive fill% through the emptying detector
   * (high → low) without a UI slider.
   */
  async simulateFill(fillPercentage) {
    await delay(50)
    return applyFillAndDetect(Number(fillPercentage))
  },

  async getCollectionHistory() {
    await delay(100)
    return [...collectionHistory]
  },

  subscribe(onData, onError) {
    liveListeners.add(onData)
    try {
      onData({ ...mockState, trend: [...mockState.trend] })
    } catch (err) {
      onError?.(err)
    }
    return () => liveListeners.delete(onData)
  },

  subscribeHistory(onHistory, onError) {
    historyListeners.add(onHistory)
    try {
      onHistory([...collectionHistory])
    } catch (err) {
      onError?.(err)
    }
    return () => historyListeners.delete(onHistory)
  },
}
