import { describe, it, expect } from 'vitest'
import { repNegParams } from './negotiation'

describe('repNegParams', () => {
  it('New label (0 rep): no modifier, window 15', () => {
    expect(repNegParams(0)).toEqual({ targetModifier: 0, counterWindow: 15 })
  })

  it('New label (249 rep): still New tier', () => {
    expect(repNegParams(249)).toEqual({ targetModifier: 0, counterWindow: 15 })
  })

  it('Established label (250 rep): -5 modifier, window 20', () => {
    expect(repNegParams(250)).toEqual({ targetModifier: -5, counterWindow: 20 })
  })

  it('Established label (599 rep): still Established', () => {
    expect(repNegParams(599)).toEqual({ targetModifier: -5, counterWindow: 20 })
  })

  it('Veteran label (600 rep): -10 modifier, window 25', () => {
    expect(repNegParams(600)).toEqual({ targetModifier: -10, counterWindow: 25 })
  })

  it('Veteran label (1000 rep): still Veteran', () => {
    expect(repNegParams(1000)).toEqual({ targetModifier: -10, counterWindow: 25 })
  })
})
