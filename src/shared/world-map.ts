export const WORLD_MAP = Object.freeze({
  buildLabel: 'Build 42.19',
  width: 19_968,
  height: 16_128,
  tileSize: 256,
  minLevel: 8,
  maxLevel: 15,
  tileRoute: '/map-tiles',
  upstreamTileRoute: 'https://map.projectzomboid.com/maps/42.19.0/base_top/layer0_files',
  officialMapUrl: 'https://map.projectzomboid.com/',
})

export interface WorldPosition {
  x: number
  y: number
  z: number
}

export function isWorldPositionMapped(position: WorldPosition): boolean {
  return Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && Number.isFinite(position.z)
    && position.x >= 0
    && position.x < WORLD_MAP.width
    && position.y >= 0
    && position.y < WORLD_MAP.height
}

export function worldMapTileGrid(level: number): { columns: number; rows: number } | undefined {
  if (!Number.isInteger(level) || level < WORLD_MAP.minLevel || level > WORLD_MAP.maxLevel) return undefined
  const scale = 2 ** (WORLD_MAP.maxLevel - level)
  const levelWidth = Math.ceil(WORLD_MAP.width / scale)
  const levelHeight = Math.ceil(WORLD_MAP.height / scale)
  return {
    columns: Math.ceil(levelWidth / WORLD_MAP.tileSize),
    rows: Math.ceil(levelHeight / WORLD_MAP.tileSize),
  }
}

export function isValidWorldMapTile(level: number, x: number, y: number): boolean {
  const grid = worldMapTileGrid(level)
  return Boolean(grid)
    && Number.isInteger(x)
    && Number.isInteger(y)
    && x >= 0
    && y >= 0
    && x < grid!.columns
    && y < grid!.rows
}

export function worldMapTilePath(level: number, x: number, y: number): string {
  return `${WORLD_MAP.tileRoute}/${level}/${x}_${y}.webp`
}

export function worldMapUpstreamTileUrl(level: number, x: number, y: number): string {
  return `${WORLD_MAP.upstreamTileRoute}/${level}/${x}_${y}.webp`
}

export function officialWorldMapPositionUrl(position: WorldPosition, zoom = 12): string {
  const coordinates = `${Math.round(position.x)}x${Math.round(position.y)}x${Math.round(zoom)}`
  const query = new URLSearchParams({ version: WORLD_MAP.buildLabel })
  return `${WORLD_MAP.officialMapUrl}?${query.toString()}&${coordinates}`
}
