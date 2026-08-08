import { spawn } from 'node:child_process'

const commands = [
  ['@livetv/web', 'dev'],
  ['@livetv/api', 'dev'],
  ['@livetv/media-worker', 'dev'],
]

const children = commands.map(([workspace, script]) =>
  spawn('npm', ['run', script, '--workspace', workspace], {
    stdio: 'inherit',
    env: process.env,
  }),
)

let shuttingDown = false

const shutdown = (signal) => {
  if (shuttingDown) return
  shuttingDown = true

  for (const child of children) {
    if (!child.killed) child.kill(signal)
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal))
}

for (const child of children) {
  child.on('exit', (code) => {
    if (shuttingDown) return
    shutdown('SIGTERM')
    process.exitCode = code ?? 1
  })
}
