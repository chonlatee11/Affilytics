/**
 * First-run key generation script.
 *
 * D-03: Generates BUN_ENCRYPTION_KEY into .env without overwriting an existing key.
 * T-1-KEY: Encryption key is never auto-generated silently inside the running backend;
 *          it is always explicitly created here by the operator before starting the server.
 *
 * Usage: bun run setup
 * Runs once before first `bun run dev`. Safe to re-run — detects existing key and exits.
 */

import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

const ENV_FILE = join(import.meta.dir, '..', '.env')
const KEY_NAME = 'BUN_ENCRYPTION_KEY'

function main(): void {
  // Check if .env already contains a BUN_ENCRYPTION_KEY line — never overwrite or
  // append a duplicate (D-03, WR-05). Detection is on the KEY line existing at all,
  // regardless of value: an empty `BUN_ENCRYPTION_KEY=` line (e.g. copied from
  // .env.example) must NOT trigger appending a second key, which would leave two
  // entries and make encryption/decryption depend on dotenv load order.
  if (existsSync(ENV_FILE)) {
    const contents = readFileSync(ENV_FILE, 'utf8')
    const keyLines = contents
      .split('\n')
      .filter((line) => line.startsWith(`${KEY_NAME}=`))

    if (keyLines.length > 0) {
      const hasValue = keyLines.some(
        (line) => (line.split('=')[1] ?? '').trim().length > 0
      )
      if (hasValue) {
        console.log(`${KEY_NAME} is already set in .env — nothing to do.`)
        console.log('If you need to rotate the key, edit .env manually (existing encrypted data will be invalidated).')
      } else {
        console.log(`${KEY_NAME} exists but is empty in .env — fill it in manually (do not append a second key).`)
        console.log('Generate one with: bun -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
      }
      process.exit(0)
    }
  }

  // Generate a cryptographically secure 32-byte (256-bit) key encoded as 64 hex characters
  const key = randomBytes(32).toString('hex')
  const entry = `\n${KEY_NAME}=${key}\n`

  if (existsSync(ENV_FILE)) {
    // Append to existing .env (may have DATABASE_URL or other vars)
    appendFileSync(ENV_FILE, entry, 'utf8')
    console.log(`✓ Appended ${KEY_NAME} to existing .env`)
  } else {
    // Create .env with the key
    writeFileSync(ENV_FILE, `${KEY_NAME}=${key}\n`, 'utf8')
    console.log(`✓ Created .env with ${KEY_NAME}`)
  }

  console.log('')
  console.log('Next steps:')
  console.log('  1. bun run dev           — start the backend server')
  console.log('  2. Visit http://127.0.0.1:3000/health to verify it is running')
  console.log('  3. POST /api/settings/fb-connect with your Facebook Page token to connect')
  console.log('')
  console.log('IMPORTANT: Never commit .env to version control — it is gitignored.')
}

main()
