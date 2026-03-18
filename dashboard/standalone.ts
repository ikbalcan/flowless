#!/usr/bin/env node
/**
 * Sadece Dashboard — UI test için
 * npm run dashboard ile çalıştır. OpenAI/webhook gerekmez.
 */

import 'dotenv/config'
import { startDashboardServer } from './server.js'

startDashboardServer()
console.log('[Flowless] Sadece dashboard. Ana uygulama için: npm start')
