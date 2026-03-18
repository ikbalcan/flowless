/**
 * Mock Input Connector
 * Test ve geliştirme için. Periyodik olarak test eventleri emit eder.
 */

import type { IInputConnector } from '../core/interfaces.js'
import type { FlowlessEvent } from '../core/interfaces.js'
import { createMockEvent } from '../core/normalizer.js'

export class MockInputConnector implements IInputConnector {
  name = 'mock'
  private intervalId: ReturnType<typeof setInterval> | null = null
  private onEventCallback: ((event: FlowlessEvent) => void) | null = null

  listen(onEvent: (event: FlowlessEvent) => void): void {
    this.onEventCallback = onEvent
    // Her 3 saniyede bir mock event gönder
    this.intervalId = setInterval(() => {
      const event = createMockEvent({
        type: `mock_event_${Date.now() % 3}`,
        payload: {
          message: `Mock event at ${new Date().toISOString()}`,
          sequence: Date.now(),
        },
      })
      this.onEventCallback?.(event)
    }, 3000)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.onEventCallback = null
  }
}
