import { useEffect, useRef, useState } from 'react'

/** Haversine distance in meters */
export function distanceMeters(a, b) {
  if (!a || !b) return Infinity
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function geoErrorMessage(err) {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Location needs HTTPS. On your phone open the https:// Network URL from the Vite terminal (same Wi‑Fi).'
  }

  const code = err?.code
  if (code === 1) {
    return 'Location permission denied. Allow location for this site in browser settings.'
  }
  if (code === 2) {
    return 'Position unavailable. Turn on GPS / location services and try outdoors.'
  }
  if (code === 3) {
    return 'GPS timed out. Move to an open area and tap Recenter.'
  }

  const msg = err?.message || 'Unable to read collector GPS.'
  if (/unknown error/i.test(msg)) {
    return 'Could not get GPS. On phone use the https:// Network URL, allow location, and enable GPS.'
  }
  return msg
}

/**
 * Watch the collector's live GPS on a phone / browser.
 * High-accuracy watch with continuous updates for live routing.
 */
export function useCollectorLocation({ minMoveMeters = 8 } = {}) {
  const [position, setPosition] = useState(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('requesting')
  const lastAcceptedRef = useRef(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      setError('Geolocation is not supported on this device.')
      return undefined
    }

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setStatus('insecure')
      setError(geoErrorMessage())
      return undefined
    }

    const onSuccess = (geo) => {
      const next = {
        lat: geo.coords.latitude,
        lng: geo.coords.longitude,
        accuracy: geo.coords.accuracy,
        heading: geo.coords.heading,
        speed: geo.coords.speed,
        timestamp: geo.timestamp,
      }

      const prev = lastAcceptedRef.current
      if (prev && distanceMeters(prev, next) < minMoveMeters && (next.accuracy || 0) > 40) {
        return
      }

      lastAcceptedRef.current = next
      setPosition(next)
      setError(null)
      setStatus('ready')
    }

    const onError = (err) => {
      setStatus('denied')
      setError(geoErrorMessage(err))
    }

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    })

    const watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 20000,
    })

    return () => navigator.geolocation.clearWatch(watchId)
  }, [minMoveMeters])

  return { position, error, status }
}
