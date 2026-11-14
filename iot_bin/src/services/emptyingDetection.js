/**
 * Section 3.6.2 — Automatic Emptying Detection
 *
 * A collection cycle is detected when fill level transitions from a high
 * state (> highThreshold) down to a low baseline (< lowThreshold).
 *
 * Section 3.6.3 — Volume Removed (%) = V_before - V_after
 */

export const HIGH_FILL_THRESHOLD = 80
export const LOW_FILL_THRESHOLD = 15

export function createEmptyingDetector({
  highThreshold = HIGH_FILL_THRESHOLD,
  lowThreshold = LOW_FILL_THRESHOLD,
} = {}) {
  let primed = false
  let vBefore = null
  let collectionCycle = 'active' // active | awaiting_collection | complete

  return {
    /**
     * Feed the latest fill percentage.
     * Returns a collection event when an emptying drop is detected, otherwise null.
     */
    process(fillPercentage) {
      const level = Number(fillPercentage)
      if (!Number.isFinite(level)) {
        return { event: null, collectionCycle }
      }

      // High-fill arming: remember peak volume before collection
      if (level > highThreshold) {
        primed = true
        vBefore = vBefore == null ? level : Math.max(vBefore, level)
        collectionCycle = 'awaiting_collection'
        return { event: null, collectionCycle }
      }

      // Sudden drop to baseline after a high-fill period → emptying event
      if (primed && level < lowThreshold) {
        const vAfter = level
        const volumeRemoved = Math.round((vBefore - vAfter) * 100) / 100

        const event = {
          timestamp: new Date().toISOString(),
          pre_empty_volume: vBefore,
          post_empty_volume: vAfter,
          volume_removed: volumeRemoved,
        }

        primed = false
        vBefore = null
        collectionCycle = 'complete'

        return { event, collectionCycle }
      }

      // After a completed collection, resume normal filling cycle
      if (collectionCycle === 'complete' && level >= lowThreshold) {
        collectionCycle = 'active'
      }

      return { event: null, collectionCycle }
    },

    getState() {
      return {
        primed,
        vBefore,
        collectionCycle,
      }
    },

    reset() {
      primed = false
      vBefore = null
      collectionCycle = 'active'
    },
  }
}

export function normalizeCollectionRecord(id, raw = {}) {
  return {
    id,
    timestamp: raw.timestamp ?? raw.time ?? raw.at ?? null,
    preEmptyVolume: Number(raw.pre_empty_volume ?? raw.preEmptyVolume ?? raw.v_before ?? 0),
    postEmptyVolume: Number(raw.post_empty_volume ?? raw.postEmptyVolume ?? raw.v_after ?? 0),
    volumeRemoved: Number(raw.volume_removed ?? raw.volumeRemoved ?? raw.removed ?? 0),
  }
}
