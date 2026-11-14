/**
 * DEVNET — Base Protocol Class
 * Encapsulates common protocol state, parameter configuration,
 * metrics calculation, and lifecycle hooks.
 */

export class BaseProtocol {
  /**
   * @param {object} config
   * @param {string} config.name
   * @param {number} config.windowSize
   * @param {number} config.totalFrames
   * @param {number} config.txDelay (ms)
   * @param {number} config.ackDelay (ms)
   * @param {number} config.pktLossProb (0 - 1)
   * @param {number} config.ackLossProb (0 - 1)
   * @param {number} config.timeout (ms)
   * @param {import('../engine/prng.js').PRNG} prng
   */
  constructor(config, prng) {
    this.name = config.name || 'BaseProtocol';
    this.windowSize = config.windowSize !== undefined ? Number(config.windowSize) : 4;
    this.totalFrames = config.totalFrames !== undefined ? Number(config.totalFrames) : 20;
    this.txDelay = config.txDelay !== undefined ? Number(config.txDelay) : 100;
    this.ackDelay = config.ackDelay !== undefined ? Number(config.ackDelay) : 50;
    this.pktLossProb = config.pktLossProb !== undefined ? Number(config.pktLossProb) : 0.1;
    this.ackLossProb = config.ackLossProb !== undefined ? Number(config.ackLossProb) : 0.05;
    this.timeout = config.timeout !== undefined ? Number(config.timeout) : 300;

    this.prng = prng;

    // Simulation metrics
    this.metrics = {
      totalFramesTx: 0,        // Total frame transmissions (initial + retries)
      uniqueDelivered: 0,      // Successfully delivered unique frames
      retransmissions: 0,      // Total retransmission events
      packetsLost: 0,          // Channel packet drops
      acksReceived: 0,         // ACKs reaching sender
      acksLost: 0,             // ACKs dropped in reverse channel
      timeoutsTriggered: 0,    // Number of timeout expirations
      startTime: 0,
      finishTime: 0,
      totalDuration: 0,
      throughput: 0,           // delivered / sec
      efficiency: 0            // (delivered / totalFramesTx) * 100%
    };

    // State tracking
    this.isComplete = false;
    this.activeTimers = new Map(); // frameId -> timer expiry time
  }

  /**
   * Calculate final performance metrics.
   * @param {number} currentSimTime 
   */
  finalizeMetrics(currentSimTime) {
    this.metrics.finishTime = currentSimTime;
    this.metrics.totalDuration = Math.max(1, this.metrics.finishTime - this.metrics.startTime);

    // Throughput = unique frames delivered / duration in seconds
    const durationSeconds = this.metrics.totalDuration / 1000.0;
    this.metrics.throughput = durationSeconds > 0 
      ? Number((this.metrics.uniqueDelivered / durationSeconds).toFixed(2))
      : 0;

    // Efficiency = (unique delivered / total frame transmissions) * 100%
    this.metrics.efficiency = this.metrics.totalFramesTx > 0
      ? Number(((this.metrics.uniqueDelivered / this.metrics.totalFramesTx) * 100).toFixed(1))
      : 0;

    this.isComplete = true;
  }

  /**
   * Returns serializable snapshot of protocol state for UI visualization.
   */
  getStateSnapshot() {
    throw new Error('getStateSnapshot() must be implemented by protocol subclass');
  }

  /**
   * Reset internal protocol state for re-run.
   */
  reset() {
    this.metrics = {
      totalFramesTx: 0,
      uniqueDelivered: 0,
      retransmissions: 0,
      packetsLost: 0,
      acksReceived: 0,
      acksLost: 0,
      timeoutsTriggered: 0,
      startTime: 0,
      finishTime: 0,
      totalDuration: 0,
      throughput: 0,
      efficiency: 0
    };
    this.isComplete = false;
    this.activeTimers.clear();
  }
}
