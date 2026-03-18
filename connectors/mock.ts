/**
 * Mock Output Connector
 * Geliştirme ve test için. Her aksiyonu konsola loglar.
 */

import type { IOutputConnector, FlowlessAction, FlowlessResult } from '../core/interfaces.js'

export class MockOutputConnector implements IOutputConnector {
  name = 'mock'

  async execute(action: FlowlessAction): Promise<FlowlessResult> {
    console.log(`[MockConnector] Execute: ${action.type}`, {
      id: action.id,
      targetConnector: action.targetConnector,
      reasoning: action.reasoning,
      payload: action.payload,
    })
    return {
      success: true,
      data: { executedAt: new Date().toISOString(), actionId: action.id },
    }
  }
}
