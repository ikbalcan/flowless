/**
 * Dashboard Server — REST API + static UI
 * Port 4000
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { dashboardStore } from './store.js'

/** Proje kökünden dashboard/public (build sonrası dist'ten çalışınca üst dizin) */
const publicDir = join(process.cwd(), 'dashboard', 'public')
const PORT = parseInt(process.env.DASHBOARD_PORT ?? '4000', 10)

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
}

export function startDashboardServer(): void {
  const server = createServer(async (req, res) => {
    const pathname = req.url?.split('?')[0] ?? '/'
    if (req.method === 'GET' && pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(JSON.stringify({ events: dashboardStore.getEvents() }))
      return
    }

    if (req.method === 'GET') {
      const path = pathname === '/' ? '/index.html' : pathname
      const filePath = join(publicDir, path.replace(/^\//, ''))
      try {
        const content = await readFile(filePath)
        const mime = MIME[extname(filePath)] ?? 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': mime })
        res.end(content)
        return
      } catch {
        res.writeHead(404)
        res.end()
        return
      }
    }

    res.writeHead(404)
    res.end()
  })

  server.listen(PORT, () => {
    console.log(`[Dashboard] http://localhost:${PORT}`)
  })
}
