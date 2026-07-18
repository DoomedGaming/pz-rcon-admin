export interface PlayerXpPerk {
  value: string
  label: string
}

// Build 42 perk IDs are internal names and do not always match the labels shown in game.
export const PLAYER_XP_PERKS: readonly PlayerXpPerk[] = [
  { value: 'Aiming', label: 'Aiming' },
  { value: 'Axe', label: 'Axe' },
  { value: 'Blacksmith', label: 'Blacksmithing' },
  { value: 'Blunt', label: 'Long Blunt' },
  { value: 'Butchering', label: 'Butchering' },
  { value: 'Carving', label: 'Carving' },
  { value: 'Woodwork', label: 'Carpentry' },
  { value: 'Cooking', label: 'Cooking' },
  { value: 'Electricity', label: 'Electrical' },
  { value: 'Farming', label: 'Farming' },
  { value: 'Doctor', label: 'First Aid' },
  { value: 'Fishing', label: 'Fishing' },
  { value: 'Fitness', label: 'Fitness' },
  { value: 'FlintKnapping', label: 'Flint Knapping' },
  { value: 'PlantScavenging', label: 'Foraging' },
  { value: 'Glassmaking', label: 'Glassmaking' },
  { value: 'Husbandry', label: 'Husbandry' },
  { value: 'Lightfoot', label: 'Lightfooted' },
  { value: 'LongBlade', label: 'Long Blade' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'Masonry', label: 'Masonry' },
  { value: 'Mechanics', label: 'Mechanics' },
  { value: 'MetalWelding', label: 'Metalworking' },
  { value: 'Nimble', label: 'Nimble' },
  { value: 'Pottery', label: 'Pottery' },
  { value: 'Reloading', label: 'Reloading' },
  { value: 'SmallBlade', label: 'Short Blade' },
  { value: 'SmallBlunt', label: 'Short Blunt' },
  { value: 'Sneak', label: 'Sneaking' },
  { value: 'Spear', label: 'Spear' },
  { value: 'Sprinting', label: 'Sprinting' },
  { value: 'Strength', label: 'Strength' },
  { value: 'Tailoring', label: 'Tailoring' },
  { value: 'Tracking', label: 'Tracking' },
  { value: 'Trapping', label: 'Trapping' },
]

const xpPerkAliases = new Map<string, string>()
for (const perk of PLAYER_XP_PERKS) {
  xpPerkAliases.set(perk.value.toLocaleLowerCase('en-US'), perk.value)
  xpPerkAliases.set(perk.label.toLocaleLowerCase('en-US'), perk.value)
}

export function resolvePlayerXpPerk(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('en-US')
  return normalized ? xpPerkAliases.get(normalized) : undefined
}
