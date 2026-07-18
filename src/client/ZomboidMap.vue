<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, watch, ref } from 'vue'
import OpenSeadragon from 'openseadragon'
import type { PlayerMapRecord } from '@shared/types'
import {
  WORLD_MAP,
  isValidWorldMapTile,
  isWorldPositionMapped,
  officialWorldMapPositionUrl,
  worldMapTilePath,
  type WorldPosition,
} from '@shared/world-map'

const props = withDefaults(defineProps<{
  players: PlayerMapRecord[]
  audience: 'player' | 'admin'
}>(), {
  players: () => [],
})

interface PlayerMarker {
  username: string
  online: boolean
  position: WorldPosition
  updatedAt?: string
  health?: number
}

const mapElement = ref<HTMLDivElement | null>(null)
const mapReady = ref(false)
const mapError = ref('')
const selectedUsername = ref('')
let viewer: OpenSeadragon.Viewer | undefined
let loadTimer: number | undefined

const positionedPlayers = computed(() => props.players.filter((player) => player.telemetry?.position))
const markers = computed<PlayerMarker[]>(() => positionedPlayers.value.flatMap((player) => {
  const position = player.telemetry?.position
  if (!position || !isWorldPositionMapped(position)) return []
  return [{
    username: player.username,
    online: player.online,
    position,
    updatedAt: player.telemetry?.updatedAt,
    health: player.telemetry?.health,
  }]
}))
const outsideCoverage = computed(() => positionedPlayers.value.filter((player) => {
  const position = player.telemetry?.position
  return Boolean(position && !isWorldPositionMapped(position))
}))
const selectedMarker = computed(() => markers.value.find((marker) => marker.username === selectedUsername.value) ?? markers.value[0])
const heading = computed(() => props.audience === 'admin' ? 'Survivor locations' : 'Online survivor locations')
const subtitle = computed(() => props.audience === 'admin'
  ? 'All survivors with a reported position. Offline markers show their last known location.'
  : 'Your latest location plus currently online survivors with a reported position.')

function relativeTime(value?: string): string {
  if (!value) return 'Unknown time'
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000))
  if (seconds < 10) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function coordinates(position: WorldPosition): string {
  return `${position.x.toFixed(1)}, ${position.y.toFixed(1)}, z${position.z.toFixed(0)}`
}

function clearLoadTimer() {
  window.clearTimeout(loadTimer)
  loadTimer = undefined
}

function destroyViewer() {
  clearLoadTimer()
  viewer?.destroy()
  viewer = undefined
  mapReady.value = false
}

function tileSource(): OpenSeadragon.TileSource {
  const source = new OpenSeadragon.TileSource({
    width: WORLD_MAP.width,
    height: WORLD_MAP.height,
    tileSize: WORLD_MAP.tileSize,
    tileOverlap: 0,
    minLevel: WORLD_MAP.minLevel,
    maxLevel: WORLD_MAP.maxLevel,
    ready: true,
  })
  source.getTileUrl = (level, x, y) => worldMapTilePath(level, x, y)
  source.tileExists = (level, x, y) => isValidWorldMapTile(level, x, y)
  return source
}

function initializeMap() {
  if (viewer || !mapElement.value || !markers.value.length) return
  mapError.value = ''
  mapReady.value = false
  viewer = OpenSeadragon({
    element: mapElement.value,
    tileSources: [tileSource()],
    showNavigationControl: false,
    animationTime: 0.55,
    blendTime: 0.12,
    constrainDuringPan: true,
    visibilityRatio: 0.25,
    minZoomImageRatio: 0.75,
    maxZoomPixelRatio: 2.5,
    drawer: ['canvas', 'html'],
    gestureSettingsMouse: { clickToZoom: false, scrollToZoom: true },
    gestureSettingsTouch: { pinchToZoom: true, flickEnabled: true },
  })

  viewer.addHandler('open', () => {
    syncOverlays()
    fitMarkers(true)
    loadTimer = window.setTimeout(() => {
      if (!mapReady.value) mapError.value = 'Map imagery is temporarily unavailable. Coordinates remain available below.'
    }, 10_000)
  })
  viewer.addHandler('tile-loaded', () => {
    mapReady.value = true
    mapError.value = ''
    clearLoadTimer()
  })
  viewer.addHandler('open-failed', () => {
    mapError.value = 'Map imagery could not be opened. Coordinates remain available below.'
    clearLoadTimer()
  })
}

function syncOverlays() {
  if (!viewer?.isOpen()) return
  viewer.clearOverlays()
  const image = viewer.world.getItemAt(0)
  if (!image) return

  for (const marker of markers.value) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = [
      'world-map-marker',
      marker.online ? 'online' : 'offline',
      marker.username === selectedMarker.value?.username ? 'selected' : '',
    ].filter(Boolean).join(' ')
    button.setAttribute('aria-label', `${marker.username}, ${marker.online ? 'online' : 'offline last known location'}, ${coordinates(marker.position)}`)

    const pin = document.createElement('span')
    pin.className = 'world-map-marker-pin'
    pin.textContent = marker.online ? '●' : '○'
    const label = document.createElement('span')
    label.className = 'world-map-marker-label'
    label.textContent = marker.username
    button.append(pin, label)
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      focusMarker(marker.username)
    })

    viewer.addOverlay({
      element: button,
      location: image.imageToViewportCoordinates(marker.position.x, marker.position.y),
      placement: OpenSeadragon.Placement.BOTTOM,
      checkResize: false,
    })
  }
}

function fitMarkers(immediately = false) {
  if (!viewer?.isOpen() || !markers.value.length) return
  const image = viewer.world.getItemAt(0)
  if (!image) return

  if (markers.value.length === 1) {
    const point = image.imageToViewportCoordinates(markers.value[0].position.x, markers.value[0].position.y)
    const targetZoom = Math.min(viewer.viewport.getMaxZoom(), Math.max(9, viewer.viewport.getHomeZoom() * 8))
    viewer.viewport.panTo(point, immediately)
    viewer.viewport.zoomTo(targetZoom, point, immediately)
    viewer.viewport.applyConstraints(immediately)
    return
  }

  const xs = markers.value.map((marker) => marker.position.x)
  const ys = markers.value.map((marker) => marker.position.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const span = Math.max(maxX - minX, maxY - minY, 1_600)
  const padding = span * 0.22
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const bounds = image.imageToViewportRectangle(
    centerX - span / 2 - padding,
    centerY - span / 2 - padding,
    span + padding * 2,
    span + padding * 2,
  )
  viewer.viewport.fitBoundsWithConstraints(bounds, immediately)
}

function focusMarker(username: string) {
  const marker = markers.value.find((item) => item.username === username)
  if (!marker || !viewer?.isOpen()) return
  selectedUsername.value = username
  syncOverlays()
  const image = viewer.world.getItemAt(0)
  if (!image) return
  const point = image.imageToViewportCoordinates(marker.position.x, marker.position.y)
  const targetZoom = Math.min(viewer.viewport.getMaxZoom(), Math.max(viewer.viewport.getZoom(), 10))
  viewer.viewport.panTo(point)
  viewer.viewport.zoomTo(targetZoom, point)
  viewer.viewport.applyConstraints()
}

function zoom(factor: number) {
  if (!viewer?.isOpen()) return
  viewer.viewport.zoomBy(factor)
  viewer.viewport.applyConstraints()
}

watch(markers, async (nextMarkers, previousMarkers) => {
  if (!nextMarkers.length) {
    destroyViewer()
    selectedUsername.value = ''
    return
  }
  if (!selectedUsername.value || !nextMarkers.some((marker) => marker.username === selectedUsername.value)) {
    selectedUsername.value = nextMarkers[0].username
  }
  await nextTick()
  if (!viewer) initializeMap()
  else syncOverlays()

  // Do not interrupt an administrator who is panning when telemetry refreshes.
  if (!previousMarkers?.length) fitMarkers(true)
}, { deep: true, immediate: true })

onBeforeUnmount(destroyViewer)
</script>

<template>
  <article class="world-map-card">
    <header class="world-map-heading">
      <div>
        <p class="eyebrow">Latest deep telemetry</p>
        <h2>{{ heading }}</h2>
        <p>{{ subtitle }}</p>
      </div>
      <div v-if="markers.length" class="world-map-summary">
        <strong>{{ markers.length }}</strong>
        <span>{{ markers.length === 1 ? 'mapped survivor' : 'mapped survivors' }}</span>
      </div>
    </header>

    <div v-if="!positionedPlayers.length" class="world-map-empty">
      <span>⌖</span>
      <div><strong>No position reported yet</strong><p>The map will appear after the next deep telemetry snapshot includes a location.</p></div>
    </div>

    <div v-else-if="!markers.length" class="world-map-empty">
      <span>↗</span>
      <div><strong>Position is outside this base map</strong><p>The coordinate is preserved below, but it cannot be placed on the pinned {{ WORLD_MAP.buildLabel }} map.</p></div>
    </div>

    <template v-else>
      <div class="world-map-toolbar" aria-label="Map controls">
        <div class="world-map-legend"><span class="live"></span> Online <span class="last-known"></span> Last known</div>
        <div class="world-map-buttons">
          <button type="button" aria-label="Zoom out" title="Zoom out" @click="zoom(0.7)">−</button>
          <button type="button" aria-label="Zoom in" title="Zoom in" @click="zoom(1.4)">+</button>
          <button type="button" @click="fitMarkers()">Fit {{ markers.length === 1 ? 'survivor' : 'all' }}</button>
        </div>
      </div>

      <div class="world-map-frame">
        <div ref="mapElement" class="world-map-viewer" :aria-label="`${heading}. Pan with a pointer and zoom with the wheel or map controls.`"></div>
        <div v-if="!mapReady && !mapError" class="world-map-loading" aria-live="polite"><span></span>Loading map imagery…</div>
        <div v-if="mapError" class="world-map-warning" role="status">{{ mapError }}</div>
        <span class="world-map-floor">TOP VIEW · Z shown per survivor</span>
      </div>

      <div class="world-map-roster" aria-label="Mapped survivors">
        <button
          v-for="marker in markers"
          :key="marker.username"
          type="button"
          :class="[{ active: selectedMarker?.username === marker.username, online: marker.online }]"
          @click="focusMarker(marker.username)"
        >
          <span></span>
          <strong>{{ marker.username }}</strong>
          <small>{{ marker.online ? 'Online now' : `Last known ${relativeTime(marker.updatedAt)}` }}</small>
        </button>
      </div>

      <section v-if="selectedMarker" class="world-map-selection" aria-live="polite">
        <div>
          <small>Selected survivor</small>
          <strong>{{ selectedMarker.username }}</strong>
          <span>{{ selectedMarker.online ? 'Online position' : 'Offline · last known position' }}</span>
        </div>
        <dl>
          <div><dt>Coordinates</dt><dd>{{ coordinates(selectedMarker.position) }}</dd></div>
          <div><dt>Health</dt><dd>{{ selectedMarker.health !== undefined ? `${selectedMarker.health.toFixed(1)}%` : '—' }}</dd></div>
          <div><dt>Snapshot</dt><dd>{{ relativeTime(selectedMarker.updatedAt) }}</dd></div>
        </dl>
        <a :href="officialWorldMapPositionUrl(selectedMarker.position)" target="_blank" rel="noreferrer">Open on official map ↗</a>
      </section>
    </template>

    <div v-if="outsideCoverage.length" class="world-map-outside">
      <strong>Outside mapped bounds</strong>
      <span v-for="player in outsideCoverage" :key="player.username">{{ player.username }} · {{ coordinates(player.telemetry!.position!) }}</span>
    </div>

    <footer class="world-map-attribution">
      <span>{{ WORLD_MAP.buildLabel }} base map; custom-map areas may appear blank.</span>
      <span>Map rendering: PZmap by CalvyPZ · Project Zomboid imagery © The Indie Stone Ltd.</span>
    </footer>
  </article>
</template>
