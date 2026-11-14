import { config, normalizeTelemetry } from '../config'

async function request(path, options = {}) {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Django API ${response.status}: ${detail || response.statusText}`)
  }

  if (response.status === 204) return null
  return response.json()
}

/**
 * Expected Django REST endpoints:
 *   GET  /api/bins/<node_id>/
 *   GET  /api/bins/<node_id>/trends/
 *   POST /api/bins/<node_id>/sync/
 *   POST /api/bins/<node_id>/empty/
 *
 * Telemetry payload example:
 * {
 *   "node_id": "ESP32-UG-01",
 *   "d_total": 100,
 *   "d_measured": 25,
 *   "fill_percentage": 75,
 *   "battery_level": 94,
 *   "battery_voltage": 3.95,
 *   "signal_quality": 88,
 *   "signal_dbm": -64,
 *   "latitude": 0.3476,
 *   "longitude": 32.5825,
 *   "last_sync": "09:15",
 *   "trend": [{ "time": "00:00", "fill": 12 }]
 * }
 */
export const djangoApi = {
  async getTelemetry() {
    const nodeId = encodeURIComponent(config.binNodeId)
    const telemetry = await request(`/bins/${nodeId}/`)

    // Prefer embedded trend; otherwise fetch the trends endpoint.
    if (!Array.isArray(telemetry?.trend) || !telemetry.trend.length) {
      try {
        const trends = await request(`/bins/${nodeId}/trends/`)
        const points = Array.isArray(trends) ? trends : trends?.results || trends?.trend || []
        return normalizeTelemetry({ ...telemetry, trend: points })
      } catch {
        return normalizeTelemetry(telemetry)
      }
    }

    return normalizeTelemetry(telemetry)
  },

  async syncTelemetry() {
    const nodeId = encodeURIComponent(config.binNodeId)
    const payload = await request(`/bins/${nodeId}/sync/`, { method: 'POST', body: '{}' })
    return normalizeTelemetry(payload || (await this.getTelemetry()))
  },

  async emptyBin() {
    const nodeId = encodeURIComponent(config.binNodeId)
    const payload = await request(`/bins/${nodeId}/empty/`, {
      method: 'POST',
      body: JSON.stringify({ action: 'empty' }),
    })
    return normalizeTelemetry(payload || (await this.getTelemetry()))
  },

  // Sensor distance is owned by the ESP32/backend in live mode.
  async setMeasuredDistance() {
    return this.getTelemetry()
  },
}
