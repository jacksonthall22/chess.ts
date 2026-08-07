import { spawnSync } from 'node:child_process'

const candidates =
  process.platform === 'win32'
    ? [
        ['py', ['-3']],
        ['python', []],
        ['python3', []],
      ]
    : [
        ['python3', []],
        ['python', []],
      ]

for (const [command, prefix] of candidates) {
  const probe = spawnSync(command, [...prefix, '--version'], { stdio: 'ignore' })
  if (probe.error || probe.status !== 0) {
    continue
  }

  const result = spawnSync(command, [...prefix, ...process.argv.slice(2)], {
    stdio: 'inherit',
  })
  if (result.error) {
    console.error(`Could not run ${command}: ${result.error.message}`)
    process.exit(1)
  }
  process.exit(result.status ?? 1)
}

console.error('Python 3 was not found. Install Python 3 and make it available on PATH.')
process.exit(1)
