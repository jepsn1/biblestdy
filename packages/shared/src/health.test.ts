import { describe, expect, it } from 'vitest'
import { healthStatus } from './health.js'

describe('healthStatus', () => {
  it('reports ok for the given service', () => {
    expect(healthStatus('api')).toEqual({ status: 'ok', service: 'api' })
  })
})
