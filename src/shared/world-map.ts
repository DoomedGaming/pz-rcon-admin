export type WorldMapId = '42.19' | '42.20'
export type WorldMapTileFormat = 'webp' | 'jpg'

export interface WorldMapDefinition {
  id: WorldMapId
  buildLabel: string
  width: number
  height: number
  tileSize: number
  minLevel: number
  maxLevel: number
  tileRoute: string
  upstreamTileRoute: string
  tileFormat: WorldMapTileFormat
  contentType: 'image/webp' | 'image/jpeg'
  officialMapUrl: string
}

const shared = {
  width: 19_968,
  height: 16_128,
  tileSize: 256,
  minLevel: 8,
  maxLevel: 15,
  tileRoute: '/map-tiles',
  officialMapUrl: 'https://map.projectzomboid.com/',
} as const

export const WORLD_MAPS: Readonly<Record<WorldMapId, Readonly<WorldMapDefinition>>> = Object.freeze({
  '42.19': Object.freeze({
    ...shared,
    id: '42.19',
    buildLabel: 'Build 42.19',
    upstreamTileRoute: 'https://map.projectzomboid.com/maps/42.19.0/base_top/layer0_files',
    tileFormat: 'webp',
    contentType: 'image/webp',
  }),
  '42.20': Object.freeze({
    ...shared,
    id: '42.20',
    buildLabel: 'Build 42.20',
    upstreamTileRoute: 'https://map.projectzomboid.com/maps/42.20.0/base_top/layer0_files',
    tileFormat: 'jpg',
    contentType: 'image/jpeg',
  }),
})

export interface WorldPosition {
  x: number
  y: number
  z: number
}

export function worldMapById(value: string): Readonly<WorldMapDefinition> | undefined {
  return WORLD_MAPS[value as WorldMapId]
}

export function worldMapForServerVersion(serverVersion?: string): Readonly<WorldMapDefinition> | undefined {
  const match = /^(\d+)\.(\d+)(?:\.|$)/.exec(serverVersion?.trim() ?? '')
  if (!match) return undefined
  return worldMapById(`${match[1]}.${match[2]}`)
}

export function isWorldPositionMapped(map: WorldMapDefinition, position: WorldPosition): boolean {
  return Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && Number.isFinite(position.z)
    && position.x >= 0
    && position.x < map.width
    && position.y >= 0
    && position.y < map.height
}

export function worldMapTileGrid(map: WorldMapDefinition, level: number): { columns: number; rows: number } | undefined {
  if (!Number.isInteger(level) || level < map.minLevel || level > map.maxLevel) return undefined
  const scale = 2 ** (map.maxLevel - level)
  const levelWidth = Math.ceil(map.width / scale)
  const levelHeight = Math.ceil(map.height / scale)
  return {
    columns: Math.ceil(levelWidth / map.tileSize),
    rows: Math.ceil(levelHeight / map.tileSize),
  }
}

export function isValidWorldMapTile(map: WorldMapDefinition, level: number, x: number, y: number): boolean {
  const grid = worldMapTileGrid(map, level)
  return Boolean(grid)
    && Number.isInteger(x)
    && Number.isInteger(y)
    && x >= 0
    && y >= 0
    && x < grid!.columns
    && y < grid!.rows
}

export function worldMapTilePath(map: WorldMapDefinition, level: number, x: number, y: number): string {
  return `${map.tileRoute}/${map.id}/${level}/${x}_${y}.${map.tileFormat}`
}

export function worldMapUpstreamTileUrl(map: WorldMapDefinition, level: number, x: number, y: number): string {
  return `${map.upstreamTileRoute}/${level}/${x}_${y}.${map.tileFormat}`
}

export function officialWorldMapPositionUrl(map: WorldMapDefinition, position: WorldPosition, zoom = 12): string {
  const coordinates = `${Math.round(position.x)}x${Math.round(position.y)}x${Math.round(zoom)}`
  const query = new URLSearchParams({ version: map.buildLabel })
  return `${map.officialMapUrl}?${query.toString()}&${coordinates}`
}
