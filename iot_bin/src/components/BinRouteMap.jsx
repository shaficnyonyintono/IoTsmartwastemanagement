import { useEffect, useRef, useState } from 'react'
import { Navigation, AlertTriangle, LocateFixed } from 'lucide-react'
import { useCollectorLocation, distanceMeters } from '../hooks/useCollectorLocation'
import { BIN_LOCATION } from '../config'

import 'leaflet/dist/leaflet.css'
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css'

/** Minimum collector movement (m) before the road route is recalculated */
const ROUTE_RECALC_METERS = 30
/** Don't spam OSRM more often than this */
const ROUTE_MIN_INTERVAL_MS = 8000

function makeDivIcon(L, { color, label, pulse }) {
  return L.divIcon({
    className: 'bin-route-marker',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        ${
          pulse
            ? `<span style="position:absolute;width:34px;height:34px;border-radius:9999px;background:${color};opacity:0.35;animation:leaflet-ping 1.4s cubic-bezier(0,0,0.2,1) infinite;"></span>`
            : ''
        }
        <div style="
          width:28px;height:28px;border-radius:9999px;background:${color};
          border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.45);
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-size:10px;font-weight:700;font-family:ui-monospace,monospace;
        ">${label}</div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return null
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return null
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  return `${hours}h ${rem}m`
}

/**
 * Live collector navigation map (phone-first):
 * - Bin coordinates are rigid (BIN_LOCATION)
 * - Collector GPS updates continuously
 * - Optimized road route auto-refreshes as the collector moves
 */
export default function BinRouteMap({
  latitude = BIN_LOCATION.latitude,
  longitude = BIN_LOCATION.longitude,
  nodeId,
  fillPercentage,
  markerColor = '#10b981',
}) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const LRef = useRef(null)
  const routingRef = useRef(null)
  const binMarkerRef = useRef(null)
  const collectorMarkerRef = useRef(null)
  const lastRouteOriginRef = useRef(null)
  const lastRouteAtRef = useRef(0)
  const followRef = useRef(true)

  const { position: collector, error: geoError, status: geoStatus } = useCollectorLocation({
    minMoveMeters: 6,
  })

  const [mapReady, setMapReady] = useState(false)
  const [followCollector, setFollowCollector] = useState(true)
  const [routeInfo, setRouteInfo] = useState(null)
  const [routeError, setRouteError] = useState(null)
  const [mapError, setMapError] = useState(null)
  const [straightLineM, setStraightLineM] = useState(null)

  // Rigid bin position — never drifts with telemetry noise
  const binLat = Number.isFinite(Number(latitude)) ? Number(latitude) : BIN_LOCATION.latitude
  const binLng = Number.isFinite(Number(longitude)) ? Number(longitude) : BIN_LOCATION.longitude

  useEffect(() => {
    followRef.current = followCollector
  }, [followCollector])

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current) return undefined

    let cancelled = false

    const setup = async () => {
      try {
        const leafletModule = await import('leaflet')
        const L = leafletModule.default || leafletModule
        window.L = L
        await import('leaflet-routing-machine')

        if (cancelled || !mapContainerRef.current) return

        if (mapContainerRef.current._leaflet_id) {
          mapContainerRef.current._leaflet_id = undefined
          mapContainerRef.current.innerHTML = ''
        }

        const map = L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: true,
        }).setView([binLat, binLng], 16)

        L.control.zoom({ position: 'topright' }).addTo(map)

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(map)

        // If user pans manually, pause auto-follow until they re-enable it
        map.on('dragstart', () => {
          followRef.current = false
          setFollowCollector(false)
        })

        const binMarker = L.marker([binLat, binLng], {
          icon: makeDivIcon(L, { color: markerColor, label: 'BIN', pulse: true }),
          title: nodeId || 'Smart Bin',
        })
          .addTo(map)
          .bindPopup(
            `<strong>${nodeId || 'Smart Bin'}</strong><br/>Fixed node<br/>Fill: ${fillPercentage}%<br/>${binLat.toFixed(6)}, ${binLng.toFixed(6)}`,
          )

        LRef.current = L
        mapRef.current = map
        binMarkerRef.current = binMarker
        setMapReady(true)
        setMapError(null)
        requestAnimationFrame(() => map.invalidateSize())
      } catch (err) {
        console.error('BinRouteMap init failed:', err)
        if (!cancelled) setMapError(err?.message || 'Failed to initialize map')
      }
    }

    setup()

    return () => {
      cancelled = true
      setMapReady(false)
      const map = mapRef.current
      if (map) {
        try {
          if (routingRef.current) map.removeControl(routingRef.current)
          map.remove()
        } catch {
          // Strict Mode cleanup race
        }
      }
      routingRef.current = null
      mapRef.current = null
      binMarkerRef.current = null
      collectorMarkerRef.current = null
      LRef.current = null
      if (mapContainerRef.current) {
        mapContainerRef.current._leaflet_id = undefined
        mapContainerRef.current.innerHTML = ''
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep bin marker style/popup in sync (position stays rigid)
  useEffect(() => {
    const L = LRef.current
    const binMarker = binMarkerRef.current
    if (!mapReady || !L || !binMarker) return

    binMarker.setLatLng([binLat, binLng])
    binMarker.setIcon(makeDivIcon(L, { color: markerColor, label: 'BIN', pulse: true }))
    binMarker.setPopupContent(
      `<strong>${nodeId || 'Smart Bin'}</strong><br/>Fixed node<br/>Fill: ${fillPercentage}%<br/>${binLat.toFixed(6)}, ${binLng.toFixed(6)}`,
    )
  }, [binLat, binLng, fillPercentage, markerColor, nodeId, mapReady])

  // Live collector marker + auto-updating optimized route
  useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    if (!mapReady || !L || !map || !collector) return

    if (!L.Routing || typeof L.Routing.control !== 'function') {
      setRouteError('Leaflet Routing Machine failed to load.')
      return
    }

    const start = L.latLng(collector.lat, collector.lng)
    const end = L.latLng(binLat, binLng)
    setStraightLineM(Math.round(distanceMeters(collector, { lat: binLat, lng: binLng })))

    if (collectorMarkerRef.current) {
      collectorMarkerRef.current.setLatLng(start)
    } else {
      collectorMarkerRef.current = L.marker(start, {
        icon: makeDivIcon(L, { color: '#06b6d4', label: 'YOU', pulse: true }),
        title: 'Collector (live GPS)',
        zIndexOffset: 500,
      })
        .addTo(map)
        .bindPopup('Your live position')
    }

    if (followRef.current) {
      map.panTo(start, { animate: true, duration: 0.4 })
    }

    const now = Date.now()
    const lastOrigin = lastRouteOriginRef.current
    const movedEnough =
      !lastOrigin || distanceMeters(lastOrigin, collector) >= ROUTE_RECALC_METERS
    const cooledDown = now - lastRouteAtRef.current >= ROUTE_MIN_INTERVAL_MS
    const shouldRecalc = !routingRef.current || (movedEnough && cooledDown)

    if (routingRef.current && !shouldRecalc) return

    lastRouteOriginRef.current = { lat: collector.lat, lng: collector.lng }
    lastRouteAtRef.current = now

    if (routingRef.current) {
      routingRef.current.setWaypoints([start, end])
      return
    }

    try {
      const control = L.Routing.control({
        waypoints: [start, end],
        router: L.Routing.osrmv1({
          serviceUrl: 'https://router.project-osrm.org/route/v1',
          profile: 'driving', // optimized road route for collectors
        }),
        lineOptions: {
          styles: [{ color: '#10b981', opacity: 0.95, weight: 6 }],
          extendToWaypoints: true,
          missingRouteTolerance: 0,
        },
        createMarker: () => null,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: 'smart',
        showAlternatives: false,
        show: false,
        routeWhileDragging: false,
        collapsible: true,
      }).addTo(map)

      control.on('routesfound', (e) => {
        const route = e.routes?.[0]
        const summary = route?.summary
        if (!summary) return
        setRouteError(null)
        setRouteInfo({
          distance: formatDistance(summary.totalDistance),
          duration: formatDuration(summary.totalTime),
          meters: summary.totalDistance,
        })

        // Fit both collector + bin on first route / large updates
        if (followRef.current && route?.coordinates?.length) {
          try {
            const bounds = L.latLngBounds(route.coordinates)
            map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 })
          } catch {
            // ignore fit errors
          }
        }
        requestAnimationFrame(() => map.invalidateSize())
      })

      control.on('routingerror', (e) => {
        setRouteInfo(null)
        setRouteError(e?.error?.message || 'Could not calculate optimized route.')
      })

      routingRef.current = control
    } catch (err) {
      console.error('Route setup failed:', err)
      setRouteError(err?.message || 'Could not start routing.')
    }
  }, [collector, binLat, binLng, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return undefined
    const onResize = () => map.invalidateSize()
    window.addEventListener('resize', onResize)
    const timer = setTimeout(onResize, 250)
    return () => {
      window.removeEventListener('resize', onResize)
      clearTimeout(timer)
    }
  }, [mapReady])

  const recenter = () => {
    setFollowCollector(true)
    followRef.current = true
    const map = mapRef.current
    if (!map || !collector) return
    map.setView([collector.lat, collector.lng], Math.max(map.getZoom(), 16), {
      animate: true,
    })
  }

  return (
    <div className="space-y-2">
      <div className="relative h-72 w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 sm:h-80">
        <div ref={mapContainerRef} className="absolute inset-0 z-0 h-full w-full touch-manipulation" />

        <button
          type="button"
          onClick={recenter}
          className="absolute bottom-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900/95 px-2.5 py-2 text-[10px] font-semibold text-cyan-300 shadow-lg active:scale-95"
          aria-label="Recenter on my live GPS"
        >
          <LocateFixed className="h-3.5 w-3.5" />
          {followCollector ? 'Following' : 'Recenter'}
        </button>

        {!mapReady && !mapError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950 text-[11px] text-slate-400">
            Loading live map…
          </div>
        )}

        {mapError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950 px-4 text-center text-[11px] text-amber-200">
            {mapError}
          </div>
        )}

        <style>{`
          @keyframes leaflet-ping {
            75%, 100% { transform: scale(2); opacity: 0; }
          }
          .bin-route-marker { background: transparent; border: none; }
          .leaflet-routing-container { display: none !important; }
          .leaflet-control-attribution {
            font-size: 9px !important;
            background: rgba(15, 23, 42, 0.75) !important;
            color: #94a3b8 !important;
          }
          .leaflet-control-zoom a {
            background: #0f172a !important;
            color: #e2e8f0 !important;
            border-color: #334155 !important;
          }
        `}</style>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
        {geoStatus === 'requesting' && (
          <span className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-1">
            <Navigation className="h-3 w-3 animate-pulse text-cyan-400" />
            Acquiring phone GPS…
          </span>
        )}

        {geoStatus === 'ready' && collector && (
          <span className="inline-flex items-center gap-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-cyan-300">
            <Navigation className="h-3 w-3" />
            Live GPS · ±{Math.round(collector.accuracy || 0)} m
          </span>
        )}

        {routeInfo && (
          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">
            Optimized route · {routeInfo.distance} · {routeInfo.duration}
          </span>
        )}

        {straightLineM != null && (
          <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-400">
            Straight-line {straightLineM} m
          </span>
        )}

        {(geoError || routeError || mapError) && (
          <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-200">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            {mapError || geoError || routeError}
          </span>
        )}

        {geoStatus === 'ready' && mapReady && !routeInfo && !routeError && (
          <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1">
            Calculating optimized road route…
          </span>
        )}
      </div>
    </div>
  )
}
