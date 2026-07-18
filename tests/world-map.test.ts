import { describe, expect, it } from 'vitest'
import {
  WORLD_MAP,
  isValidWorldMapTile,
  isWorldPositionMapped,
  officialWorldMapPositionUrl,
  worldMapTileGrid,
  worldMapTilePath,
  worldMapUpstreamTileUrl,
} from '../src/shared/world-map.js'

describe('Project Zomboid world map helpers', () => {
  it('accepts only finite positions inside the pinned Build 42 map bounds', () => {
    expect(isWorldPositionMapped({ x: 0, y: 0, z: 0 })).toBe(true)
    expect(isWorldPositionMapped({ x: WORLD_MAP.width - 0.001, y: WORLD_MAP.height - 0.001, z: 30 })).toBe(true)

    expect(isWorldPositionMapped({ x: -0.001, y: 0, z: 0 })).toBe(false)
    expect(isWorldPositionMapped({ x: 0, y: -0.001, z: 0 })).toBe(false)
    expect(isWorldPositionMapped({ x: WORLD_MAP.width, y: 0, z: 0 })).toBe(false)
    expect(isWorldPositionMapped({ x: 0, y: WORLD_MAP.height, z: 0 })).toBe(false)
    expect(isWorldPositionMapped({ x: Number.NaN, y: 0, z: 0 })).toBe(false)
    expect(isWorldPositionMapped({ x: 0, y: Number.POSITIVE_INFINITY, z: 0 })).toBe(false)
    expect(isWorldPositionMapped({ x: 0, y: 0, z: Number.NaN })).toBe(false)
  })

  it('calculates the Deep Zoom tile grid at supported levels', () => {
    expect(worldMapTileGrid(WORLD_MAP.minLevel)).toEqual({ columns: 1, rows: 1 })
    expect(worldMapTileGrid(13)).toEqual({ columns: 20, rows: 16 })
    expect(worldMapTileGrid(14)).toEqual({ columns: 39, rows: 32 })
    expect(worldMapTileGrid(WORLD_MAP.maxLevel)).toEqual({ columns: 78, rows: 63 })

    expect(worldMapTileGrid(WORLD_MAP.minLevel - 1)).toBeUndefined()
    expect(worldMapTileGrid(WORLD_MAP.maxLevel + 1)).toBeUndefined()
    expect(worldMapTileGrid(12.5)).toBeUndefined()
  })

  it('rejects tile coordinates outside each Deep Zoom grid', () => {
    expect(isValidWorldMapTile(15, 0, 0)).toBe(true)
    expect(isValidWorldMapTile(15, 77, 62)).toBe(true)
    expect(isValidWorldMapTile(15, 78, 62)).toBe(false)
    expect(isValidWorldMapTile(15, 77, 63)).toBe(false)
    expect(isValidWorldMapTile(8, 0, 0)).toBe(true)
    expect(isValidWorldMapTile(8, 1, 0)).toBe(false)
    expect(isValidWorldMapTile(15, -1, 0)).toBe(false)
    expect(isValidWorldMapTile(15, 0.5, 0)).toBe(false)
    expect(isValidWorldMapTile(16, 0, 0)).toBe(false)
  })

  it('builds same-origin and pinned upstream tile paths', () => {
    expect(worldMapTilePath(15, 46, 26)).toBe('/map-tiles/15/46_26.webp')
    expect(worldMapUpstreamTileUrl(15, 46, 26)).toBe(
      'https://map.projectzomboid.com/maps/42.19.0/base_top/layer0_files/15/46_26.webp',
    )
  })

  it('builds an official map link with its version and rounded coordinates', () => {
    expect(officialWorldMapPositionUrl({ x: 11_955.680_664, y: 6_805.998_047, z: 0 })).toBe(
      'https://map.projectzomboid.com/?version=Build+42.19&11956x6806x12',
    )
    expect(officialWorldMapPositionUrl({ x: 10.4, y: 20.49, z: 3 }, 14.6)).toBe(
      'https://map.projectzomboid.com/?version=Build+42.19&10x20x15',
    )
  })
})
