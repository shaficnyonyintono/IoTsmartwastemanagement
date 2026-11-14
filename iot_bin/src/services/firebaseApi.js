import { initializeApp, getApps } from 'firebase/app'
import { getDatabase, ref, get, update, onValue, push, set, query, limitToLast } from 'firebase/database'
import { config, normalizeTelemetry } from '../config'
import {
  createEmptyingDetector,
  normalizeCollectionRecord,
} from './emptyingDetection'

let db = null
const detector = createEmptyingDetector()
let lastWrittenCycle = null

function getDb() {
  if (db) return db

  const firebaseConfig = {
    apiKey: config.firebase.apiKey,
    authDomain: config.firebase.authDomain,
    databaseURL: config.firebase.databaseURL,
    projectId: config.firebase.projectId,
    storageBucket: config.firebase.storageBucket,
    messagingSenderId: config.firebase.messagingSenderId,
    appId: config.firebase.appId,
  }

  if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL) {
    throw new Error(
      'Firebase is not configured. Set VITE_FIREBASE_* values in .env (see .env.example).',
    )
  }

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  db = getDatabase(app)
  return db
}

function liveStatusRef() {
  return ref(getDb(), config.firebase.liveStatusPath)
}

function collectionHistoryRef() {
  return ref(getDb(), config.firebase.collectionHistoryPath)
}

async function readLiveStatus() {
  const snapshot = await get(liveStatusRef())
  if (!snapshot.exists()) {
    throw new Error(`No Firebase data at path "${config.firebase.liveStatusPath}"`)
  }
  return normalizeTelemetry(snapshot.val())
}

/**
 * Section 3.6.3 — push audit record to /smart_bin_01/collection_history
 */
async function logCollectionEvent(event) {
  const record = {
    timestamp: event.timestamp,
    pre_empty_volume: event.pre_empty_volume,
    post_empty_volume: event.post_empty_volume,
    volume_removed: event.volume_removed,
  }

  const newRef = push(collectionHistoryRef())
  await set(newRef, record)
  return { id: newRef.key, ...normalizeCollectionRecord(newRef.key, record) }
}

/**
 * Annotate live_status using your schema field names.
 * Does not overwrite sensor-owned fill_level_percent (ESP32 owns that).
 */
async function markCollectionComplete(event) {
  await update(liveStatusRef(), {
    collection_status: 'Collection cycle complete',
    collection_cycle: 'complete',
    last_empty_at: event.timestamp,
    pre_empty_volume: event.pre_empty_volume,
    post_empty_volume: event.post_empty_volume,
    volume_removed: event.volume_removed,
  })
  lastWrittenCycle = 'complete'
}

async function markAwaitingCollection(vBefore) {
  if (lastWrittenCycle === 'awaiting_collection') return
  await update(liveStatusRef(), {
    collection_status: 'Critical / Needs Collection',
    collection_cycle: 'awaiting_collection',
    pre_empty_volume: vBefore,
  })
  lastWrittenCycle = 'awaiting_collection'
}

function historyFromSnapshot(snapshot) {
  const value = snapshot.val() || {}
  return Object.entries(value)
    .map(([id, row]) => normalizeCollectionRecord(id, row))
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
}

/**
 * Live data from:
 *   https://smartiotwastemanagement-default-rtdb.firebaseio.com/smart_bin_01/live_status
 */
export const firebaseApi = {
  async getTelemetry() {
    return readLiveStatus()
  },

  async syncTelemetry() {
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    await update(liveStatusRef(), { last_sync: now })
    return readLiveStatus()
  },

  async emptyBin() {
    return readLiveStatus()
  },

  async setMeasuredDistance() {
    return readLiveStatus()
  },

  async getCollectionHistory(limit = 20) {
    const historyQuery = query(collectionHistoryRef(), limitToLast(limit))
    const snapshot = await get(historyQuery)
    return historyFromSnapshot(snapshot)
  },

  subscribe(onData, onError) {
    return onValue(
      liveStatusRef(),
      async (snapshot) => {
        try {
          if (!snapshot.exists()) {
            onError?.(new Error(`No Firebase data at path "${config.firebase.liveStatusPath}"`))
            return
          }

          const telemetry = normalizeTelemetry(snapshot.val())
          const { event, collectionCycle } = detector.process(telemetry.fillPercentage)

          if (event) {
            try {
              await logCollectionEvent(event)
              await markCollectionComplete(event)
            } catch (writeErr) {
              // Still update UI even if history write is denied by rules
              console.warn('Collection log write failed:', writeErr)
            }

            onData({
              ...telemetry,
              collectionCycle: 'complete',
              collectionStatus: 'Collection cycle complete',
              lastEmptyAt: event.timestamp,
              volumeRemovedLast: event.volume_removed,
              lastCollectionEvent: {
                timestamp: event.timestamp,
                preEmptyVolume: event.pre_empty_volume,
                postEmptyVolume: event.post_empty_volume,
                volumeRemoved: event.volume_removed,
              },
            })
            return
          }

          if (collectionCycle === 'awaiting_collection') {
            const { vBefore } = detector.getState()
            try {
              await markAwaitingCollection(vBefore)
            } catch (writeErr) {
              console.warn('Awaiting-collection write failed:', writeErr)
            }
          } else if (collectionCycle === 'active' && lastWrittenCycle === 'complete') {
            lastWrittenCycle = 'active'
            try {
              await update(liveStatusRef(), {
                collection_status: 'Normal / Capacity OK',
                collection_cycle: 'active',
              })
            } catch (writeErr) {
              console.warn('Active-cycle write failed:', writeErr)
            }
          }

          onData({
            ...telemetry,
            collectionCycle,
            collectionStatus:
              telemetry.collectionStatus ||
              (collectionCycle === 'awaiting_collection'
                ? 'Critical / Needs Collection'
                : collectionCycle === 'complete'
                  ? 'Collection cycle complete'
                  : telemetry.collectionStatus),
          })
        } catch (err) {
          onError?.(err)
        }
      },
      (error) => onError?.(error),
    )
  },

  subscribeHistory(onHistory, onError) {
    return onValue(
      collectionHistoryRef(),
      (snapshot) => {
        onHistory(historyFromSnapshot(snapshot))
      },
      (error) => onError?.(error),
    )
  },
}
