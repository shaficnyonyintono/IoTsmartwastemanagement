import { useEffect, useState } from 'react'
import { BIN_LOCATION, DEFAULT_TREND, config } from '../config'
import { binService } from '../services/binService'

const INITIAL = {
  nodeId: config.binNodeId,
  locationLabel: BIN_LOCATION.label,
  latitude: BIN_LOCATION.latitude,
  longitude: BIN_LOCATION.longitude,
  dTotal: 100,
  dMeasured: 25,
  fillPercentage: 0,
  batteryLevel: null,
  batteryVoltage: null,
  signalQuality: null,
  signalDbm: null,
  lastSync: '',
  status: 'active',
  collectionStatus: null,
  collectionCycle: 'active',
  lastEmptyAt: null,
  volumeRemovedLast: 0,
  lastCollectionEvent: null,
  trend: DEFAULT_TREND,
}

export function useBinTelemetry() {
  const [telemetry, setTelemetry] = useState(INITIAL)
  const [collectionHistory, setCollectionHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [toastMessage, setToastMessage] = useState(null)

  const showToast = (msg) => {
    setToastMessage(msg)
    window.setTimeout(() => setToastMessage(null), 4000)
  }

  useEffect(() => {
    let stopLive = () => {}
    let stopHistory = () => {}

    ;(async () => {
      try {
        stopLive = await binService.subscribe(
          (data) => {
            setTelemetry((prev) => {
              const next = { ...prev, ...data }
              if (
                data.lastCollectionEvent &&
                data.lastCollectionEvent.timestamp !== prev.lastCollectionEvent?.timestamp
              ) {
                showToast(
                  `Collection logged · removed ${data.lastCollectionEvent.volumeRemoved}%`,
                )
              }
              return next
            })
            setLoading(false)
            setError(null)
          },
          (err) => {
            setError(err?.message || 'Failed to load bin telemetry')
            setLoading(false)
          },
        )

        stopHistory = await binService.subscribeHistory(
          (list) => setCollectionHistory(Array.isArray(list) ? list : []),
          (err) => console.warn('Collection history listener:', err?.message || err),
        )
      } catch (err) {
        setError(err?.message || 'Failed to connect to data source')
        setLoading(false)
      }
    })()

    return () => {
      stopLive()
      stopHistory()
    }
  }, [])

  const syncSensor = async () => {
    setIsSyncing(true)
    try {
      const data = await binService.syncTelemetry()
      setTelemetry((prev) => ({ ...prev, ...data }))
      setError(null)
      showToast('Node sensor data synchronized')
    } catch (err) {
      setError(err?.message || 'Sync failed')
      showToast('Sync failed — check backend connection')
    } finally {
      setIsSyncing(false)
    }
  }

  return {
    telemetry,
    collectionHistory,
    loading,
    isSyncing,
    error,
    toastMessage,
    dataSource: binService.dataSource,
    syncSensor,
  }
}
