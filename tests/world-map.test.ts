import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  WORLD_MAPS,
  isValidWorldMapTile,
  isWorldPositionMapped,
  officialWorldMapPositionUrl,
  worldMapById,
  worldMapForServerVersion,
  worldMapTileGrid,
  worldMapTilePath,
  worldMapUpstreamTileUrl,
} from '../src/shared/world-map.js'

const map419 = WORLD_MAPS['42.19']
const map420 = WORLD_MAPS['42.20']
const mapComponentSource = readFileSync(new URL('../src/client/ZomboidMap.vue', import.meta.url), 'utf8')

describe('Project Zomboid world map helpers', () => {
  it('selects only the supported map matching the reported server version', () => {
    expect(worldMapForServerVersion('42.19.1')).toBe(map419)
    expect(worldMapForServerVersion('42.20.0')).toBe(map420)
    expect(worldMapForServerVersion(' 42.20 ')).toBe(map420)
    expect(worldMapForServerVersion('42.21.0')).toBeUndefined()
    expect(worldMapForServerVersion('')).toBeUndefined()
    expect(worldMapForServerVersion()).toBeUndefined()
    expect(worldMapById('42.19')).toBe(map419)
    expect(worldMapById('42.20')).toBe(map420)
    expect(worldMapById('../42.20')).toBeUndefined()
  })

  it.each([map419, map420])('accepts only finite positions inside $buildLabel bounds', (worldMap) => {
    expect(isWorldPositionMapped(worldMap, { x: 0, y: 0, z: 0 })).toBe(true)
    expect(isWorldPositionMapped(worldMap, { x: worldMap.width - 0.001, y: worldMap.height - 0.001, z: 30 })).toBe(true)

    expect(isWorldPositionMapped(worldMap, { x: -0.001, y: 0, z: 0 })).toBe(false)
    expect(isWorldPositionMapped(worldMap, { x: 0, y: -0.001, z: 0 })).toBe(false)
    expect(isWorldPositionMapped(worldMap, { x: worldMap.width, y: 0, z: 0 })).toBe(false)
    expect(isWorldPositionMapped(worldMap, { x: 0, y: worldMap.height, z: 0 })).toBe(false)
    expect(isWorldPositionMapped(worldMap, { x: Number.NaN, y: 0, z: 0 })).toBe(false)
    expect(isWorldPositionMapped(worldMap, { x: 0, y: Number.POSITIVE_INFINITY, z: 0 })).toBe(false)
    expect(isWorldPositionMapped(worldMap, { x: 0, y: 0, z: Number.NaN })).toBe(false)
  })

  it.each([map419, map420])('calculates the $buildLabel Deep Zoom tile grid', (worldMap) => {
    expect(worldMapTileGrid(worldMap, worldMap.minLevel)).toEqual({ columns: 1, rows: 1 })
    expect(worldMapTileGrid(worldMap, 13)).toEqual({ columns: 20, rows: 16 })
    expect(worldMapTileGrid(worldMap, 14)).toEqual({ columns: 39, rows: 32 })
    expect(worldMapTileGrid(worldMap, worldMap.maxLevel)).toEqual({ columns: 78, rows: 63 })

    expect(worldMapTileGrid(worldMap, worldMap.minLevel - 1)).toBeUndefined()
    expect(worldMapTileGrid(worldMap, worldMap.maxLevel + 1)).toBeUndefined()
    expect(worldMapTileGrid(worldMap, 12.5)).toBeUndefined()
  })

  it.each([map419, map420])('rejects tile coordinates outside the $buildLabel grid', (worldMap) => {
    expect(isValidWorldMapTile(worldMap, 15, 0, 0)).toBe(true)
    expect(isValidWorldMapTile(worldMap, 15, 77, 62)).toBe(true)
    expect(isValidWorldMapTile(worldMap, 15, 78, 62)).toBe(false)
    expect(isValidWorldMapTile(worldMap, 15, 77, 63)).toBe(false)
    expect(isValidWorldMapTile(worldMap, 8, 0, 0)).toBe(true)
    expect(isValidWorldMapTile(worldMap, 8, 1, 0)).toBe(false)
    expect(isValidWorldMapTile(worldMap, 15, -1, 0)).toBe(false)
    expect(isValidWorldMapTile(worldMap, 15, 0.5, 0)).toBe(false)
    expect(isValidWorldMapTile(worldMap, 16, 0, 0)).toBe(false)
  })

  it('builds versioned same-origin and allowlisted upstream tile paths', () => {
    expect(worldMapTilePath(map419, 15, 46, 26)).toBe('/map-tiles/42.19/15/46_26.webp')
    expect(worldMapUpstreamTileUrl(map419, 15, 46, 26)).toBe(
      'https://map.projectzomboid.com/maps/42.19.0/base_top/layer0_files/15/46_26.webp',
    )
    expect(worldMapTilePath(map420, 15, 46, 26)).toBe('/map-tiles/42.20/15/46_26.jpg')
    expect(worldMapUpstreamTileUrl(map420, 15, 46, 26)).toBe(
      'https://map.projectzomboid.com/maps/42.20.0/base_top/layer0_files/15/46_26.jpg',
    )
  })

  it('builds official map links with the selected version and rounded coordinates', () => {
    expect(officialWorldMapPositionUrl(map419, { x: 11_955.680_664, y: 6_805.998_047, z: 0 })).toBe(
      'https://map.projectzomboid.com/?version=Build+42.19&11956x6806x12',
    )
    expect(officialWorldMapPositionUrl(map420, { x: 10.4, y: 20.49, z: 3 }, 14.6)).toBe(
      'https://map.projectzomboid.com/?version=Build+42.20&10x20x15',
    )
  })

  it('does not render a guessed map when the server build is absent or unsupported', () => {
    expect(mapComponentSource).toContain('const activeWorldMap = computed(() => worldMapForServerVersion(props.serverVersion))')
    expect(mapComponentSource).toContain('Waiting for server build')
    expect(mapComponentSource).toContain('No matching base map')
  })
})
