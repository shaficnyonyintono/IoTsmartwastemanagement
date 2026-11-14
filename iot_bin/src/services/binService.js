import { config } from '../config'
import { mockApi } from './mockApi'
import { djangoApi } from './djangoApi'

/**
 * Single entry point for the UI. Switch backends with VITE_DATA_SOURCE:
 *   mock     → local simulation (default, works offline)
 *   django   → Python Django REST API
 *   firebase → Firebase Realtime Database (/smart_bin_01/…)
 */
async function resolveProvider() {
  switch (config.dataSource) {
    case 'django':
      return djangoApi
    case 'firebase': {
      const { firebaseApi } = await import('./firebaseApi')
      return firebaseApi
    }
    case 'mock':
    default:
      return mockApi
  }
}

export const binService = {
  get dataSource() {
    return config.dataSource
  },

  async getTelemetry() {
    const api = await resolveProvider()
    return api.getTelemetry()
  },

  async syncTelemetry() {
    const api = await resolveProvider()
    return api.syncTelemetry()
  },

  async emptyBin() {
    const api = await resolveProvider()
    return api.emptyBin()
  },

  async setMeasuredDistance(cm) {
    const api = await resolveProvider()
    return api.setMeasuredDistance(cm)
  },

  async getCollectionHistory() {
    const api = await resolveProvider()
    if (typeof api.getCollectionHistory === 'function') {
      return api.getCollectionHistory()
    }
    return []
  },

  /**
   * Live telemetry. Firebase: /smart_bin_01/live_status (+ emptying detection).
   */
  async subscribe(onData, onError) {
    if (config.dataSource === 'firebase') {
      const { firebaseApi } = await import('./firebaseApi')
      return firebaseApi.subscribe(onData, onError)
    }

    if (config.dataSource === 'mock') {
      return mockApi.subscribe(onData, onError)
    }

    let cancelled = false
    const poll = async () => {
      try {
        const data = await this.getTelemetry()
        if (!cancelled) onData(data)
      } catch (error) {
        if (!cancelled) onError?.(error)
      }
    }

    await poll()
    const timer = setInterval(poll, config.pollIntervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  },

  /**
   * Live collection audit log. Firebase: /smart_bin_01/collection_history
   */
  async subscribeHistory(onHistory, onError) {
    if (config.dataSource === 'firebase') {
      const { firebaseApi } = await import('./firebaseApi')
      return firebaseApi.subscribeHistory(onHistory, onError)
    }

    if (config.dataSource === 'mock') {
      return mockApi.subscribeHistory(onHistory, onError)
    }

    // Django: one-shot fetch if endpoint exists later
    try {
      const list = await this.getCollectionHistory()
      onHistory(list)
    } catch (err) {
      onError?.(err)
    }
    return () => {}
  },
}
