import { describe, expect, it } from 'vitest'
import { activityChartScale } from '../src/client/activity-chart.js'

describe('player activity chart scale', () => {
  it('keeps an offline or empty chart readable instead of showing three zero labels', () => {
    expect(activityChartScale(0, [])).toBe(2)
    expect(activityChartScale(0, [0, 0, 0])).toBe(2)
  })

  it('uses the configured capacity when it is available', () => {
    expect(activityChartScale(32, [0, 4, 12])).toBe(32)
  })

  it('expands to an even scale when observed activity exceeds the configured value', () => {
    expect(activityChartScale(31, [33])).toBe(34)
  })
})
