// One-off helper: set a user's password directly via the Supabase Admin API,
// bypassing email-based recovery (useful when the email rate limit is hit).
// Usage: node scripts/admin-set-password.mjs
// Not wired into package.json — run manually and delete when done.

import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { readFileSync } from 'node:fs'

function loadEnvLocal() {
  try {
    const content = readFileSync('.env.local', 'utf8')
    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.*)$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
    }
  } catch {
    // ignore, rely on real env vars
  }
}

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = {
  async listUsers(page) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    })
    if (!res.ok) throw new Error(`listUsers failed: ${res.status} ${await res.text()}`)
    return res.json()
  },
  async updateUserPassword(id, password) {
    const res = await fetch(`${url}/auth/v1/admin/users/${id}`, {
      method: 'PUT',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) throw new Error(`updateUser failed: ${res.status} ${await res.text()}`)
    return res.json()
  },
}

const rl = readline.createInterface({ input: stdin, output: stdout })

const email = (await rl.question('Email of the account: ')).trim()
const password = await rl.question('New password (min 8 chars, typed here only): ')
rl.close()

if (password.length < 8) {
  console.error('Password must be at least 8 characters.')
  process.exit(1)
}

// Find the user by email (admin API has no direct getUserByEmail, so we page through).
let page = 1
let user = null
while (!user) {
  const data = await admin.listUsers(page)
  const users = data.users ?? []
  user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (user || users.length < 200) break
  page += 1
}

if (!user) {
  console.error(`No user found with email ${email}`)
  process.exit(1)
}

await admin.updateUserPassword(user.id, password)

console.log(`Password updated for ${email}. You can now sign in with password mode at /login.`)
