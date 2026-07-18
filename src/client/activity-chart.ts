export function activityChartScale(configuredMaximum: number, samples: number[]): number {
  const values = [configuredMaximum, ...samples]
    .filter(Number.isFinite)
    .map((value) => Math.max(0, Math.floor(value)))
  const highest = Math.max(2, ...values)
  return highest % 2 === 0 ? highest : highest + 1
}
