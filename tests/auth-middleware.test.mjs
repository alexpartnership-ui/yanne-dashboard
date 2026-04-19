import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
process.env.ENCRYPTION_KEY = '0'.repeat(64)
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'

const { requirePillar, requireRole } = await import('../server.mjs')

test('requirePillar passes when user has pillar', () => {
  const req = { user: { pillar_access: ['sales'] } }
  let called = false
  const res = { status: () => res, json: () => res }
  requirePillar('sales')(req, res, () => { called = true })
  assert.equal(called, true)
})

test('requirePillar passes on wildcard', () => {
  const req = { user: { pillar_access: ['*'] } }
  let called = false
  const res = { status: () => res, json: () => res }
  requirePillar('investor-relations')(req, res, () => { called = true })
  assert.equal(called, true)
})

test('requirePillar rejects when pillar missing', () => {
  const req = { user: { pillar_access: ['sales'] } }
  let status = 0
  const res = { status: (s) => { status = s; return res }, json: () => res }
  requirePillar('investor-relations')(req, res, () => { throw new Error('should not call next') })
  assert.equal(status, 403)
})

test('requireRole passes for matching role', () => {
  const req = { user: { role: 'admin' } }
  let called = false
  const res = { status: () => res, json: () => res }
  requireRole('admin')(req, res, () => { called = true })
  assert.equal(called, true)
})

test('requireRole rejects for wrong role', () => {
  const req = { user: { role: 'manager' } }
  let status = 0
  const res = { status: (s) => { status = s; return res }, json: () => res }
  requireRole('admin')(req, res, () => { throw new Error('should not call next') })
  assert.equal(status, 403)
})
