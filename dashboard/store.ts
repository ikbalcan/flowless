/**
 * Dashboard Store — Event ve aksiyon geçmişi
 * In-memory, son 100 event tutulur.
 */

import type { FlowlessEvent, FlowlessAction, FlowlessResult } from '../core/interfaces.js'

export interface StoredAction extends FlowlessAction {
  success?: boolean
  error?: string
  executedAt?: string
}

export interface StoredEvent {
  id: string
  source: string
  type: string
  payload: unknown
  timestamp: string
  metadata?: Record<string, unknown>
  actions: StoredAction[]
}

const MAX_EVENTS = 100

class DashboardStore {
  private events: StoredEvent[] = []

  addEvent(event: FlowlessEvent): void {
    const stored: StoredEvent = {
      id: event.id,
      source: event.source,
      type: event.type,
      payload: event.payload,
      timestamp: event.timestamp.toISOString(),
      metadata: event.metadata,
      actions: [],
    }
    this.events.unshift(stored)
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(0, MAX_EVENTS)
    }
  }

  addActions(eventId: string, actions: FlowlessAction[]): void {
    const ev = this.events.find((e) => e.id === eventId)
    if (!ev) return
    for (const a of actions) {
      ev.actions.push({
        ...a,
        success: undefined,
        executedAt: undefined,
      })
    }
  }

  updateActionResult(eventId: string, actionId: string, result: FlowlessResult): void {
    const ev = this.events.find((e) => e.id === eventId)
    if (!ev) return
    const act = ev.actions.find((a) => a.id === actionId)
    if (!act) return
    act.success = result.success
    act.error = result.error
    act.executedAt = new Date().toISOString()
  }

  getEvents(): StoredEvent[] {
    return [...this.events]
  }
}

export const dashboardStore = new DashboardStore()
