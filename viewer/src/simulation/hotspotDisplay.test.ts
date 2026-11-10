import { describe, expect, it } from 'vitest'
import { getHotspotDisplayName } from './hotspotDisplay'

describe('hotspot display labels', () => {
  it('uses the saved activity name unless it is missing or a broken one-character value', () => {
    expect(getHotspotDisplayName('Stationary diesel', 'Fuel')).toBe('Stationary diesel')
    expect(getHotspotDisplayName('s', 'Fuel')).toBe('Fuel')
    expect(getHotspotDisplayName(' ', 'Electricity')).toBe('Electricity')
    expect(getHotspotDisplayName(undefined, '')).toBe('Unnamed activity')
  })
})
