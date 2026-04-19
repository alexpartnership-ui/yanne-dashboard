#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { existsSync, unlinkSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const USERS_FILE = join(ROOT, 'users.json')
const ADMIN_EMAIL = 'alex.partnership@yannetr.net'
const ADMIN_NAME = 'Alex Ozdemir'

// Minimal .env loader — no external dep
const envPath = join(ROOT, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

async function upsertProfile(id) {
  const { error } = await supabase.from('user_profiles').upsert({
    id,
    name: ADMIN_NAME,
    role: 'admin',
    pillar_access: ['*'],
  })
  if (error) throw error
  console.log('Upserted admin user_profiles row')
}

async function main() {
  console.log(`Inviting ${ADMIN_EMAIL}...`)
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(ADMIN_EMAIL, { data: { name: ADMIN_NAME } })
  if (error) {
    if (/already registered|already been registered/i.test(error.message)) {
      console.log('Admin auth user already exists — finding profile...')
      const { data: list, error: listErr } = await supabase.auth.admin.listUsers()
      if (listErr) throw listErr
      const existing = list.users.find(u => u.email === ADMIN_EMAIL)
      if (!existing) throw new Error(`Could not find ${ADMIN_EMAIL}`)
      await upsertProfile(existing.id)
    } else {
      throw error
    }
  } else {
    console.log(`Invite sent — user id: ${data.user.id}`)
    await upsertProfile(data.user.id)
  }

  if (existsSync(USERS_FILE)) {
    unlinkSync(USERS_FILE)
    console.log('Deleted users.json')
  } else {
    console.log('users.json already absent')
  }

  console.log(`\nMigration complete. Check ${ADMIN_EMAIL} for invite email and set your password.`)
}

main().catch(e => { console.error(e); process.exit(1) })
