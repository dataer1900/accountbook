import { spawn } from 'node:child_process'
import { createConnection, createServer } from 'node:net'

const requestedFrontendPort = Number(process.env.PORT || 5173)
const requestedBackendPort = Number(process.env.BOOKKEEPING_API_PORT || 8787)
const frontendPort = await findAvailablePort(requestedFrontendPort)
const backendPort = await findAvailablePort(requestedBackendPort)
const backendOrigin = `http://localhost:${backendPort}`
const allowedOrigin = `http://localhost:${frontendPort}`

const children = []

if (frontendPort !== requestedFrontendPort) {
  console.log(`[start] Frontend port ${requestedFrontendPort} is busy. Switched to ${frontendPort}.`)
}

if (backendPort !== requestedBackendPort) {
  console.log(`[start] Backend port ${requestedBackendPort} is busy. Switched to ${backendPort}.`)
}

console.log(`[start] Opening app at ${allowedOrigin}`)

children.push(
  spawnProcess('backend', process.execPath, ['server/index.mjs'], {
    env: {
      ...process.env,
      BOOKKEEPING_API_PORT: String(backendPort),
      BOOKKEEPING_ALLOWED_ORIGIN: allowedOrigin,
    },
  }),
)

children.push(
  spawnProcess('frontend', process.execPath, ['./node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', String(frontendPort), '--open'], {
    env: {
      ...process.env,
      PORT: String(frontendPort),
      BOOKKEEPING_API_PORT: String(backendPort),
      BOOKKEEPING_API_ORIGIN: backendOrigin,
    },
  }),
)

wireShutdown()

function spawnProcess(name, command, args, options) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[${name}] exited with signal ${signal}`)
      return
    }

    if (code && code !== 0) {
      console.log(`[${name}] exited with code ${code}`)
      shutdown(code)
    }
  })

  child.on('error', (error) => {
    console.error(`[${name}] failed to start:`, error.message)
    shutdown(1)
  })

  return child
}

function wireShutdown() {
  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))
}

function shutdown(code) {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }

  process.exit(code)
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })

    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })

    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function findAvailablePort(startPort, attempts = 20) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = startPort + offset
    const busy = await isPortInUse(candidate)
    if (!busy) {
      const available = await canBindPort(candidate)
      if (available) return candidate
    }
  }

  throw new Error(`No available port found starting from ${startPort}.`)
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const probe = createServer()

    probe.once('error', () => {
      resolve(false)
    })

    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => resolve(true))
    })
  })
}
