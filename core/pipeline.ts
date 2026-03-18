/**
 * Core Pipeline — Faz 1
 * Event → Action dönüşümü. Faz 2'de AI reasoning buraya eklenecek.
 */

import type { FlowlessEvent, FlowlessAction } from './interfaces.js'

/**
 * Faz 1: AI olmadan basit event → action dönüşümü.
 * Her event için bir "log" aksiyonu üretir.
 */
export function eventToAction(event: FlowlessEvent): FlowlessAction[] {
  const action: FlowlessAction = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    type: 'log_event',
    targetConnector: 'mock',
    payload: {
      eventId: event.id,
      source: event.source,
      type: event.type,
      timestamp: event.timestamp.toISOString(),
      payload: event.payload,
    },
    reasoning: 'Faz 1: Passthrough — AI reasoning henüz yok',
  }
  return [action]
}
