/**
 * DEVNET — One-Bit Sliding Window Protocol (Stop-and-Wait ARQ)
 * 1-bit sequence space: 0 and 1.
 * Sender window size: 1.
 * Receiver window size: 1.
 */

import { BaseProtocol } from './base-protocol.js';

export class StopAndWaitProtocol extends BaseProtocol {
  constructor(config, prng) {
    super({ ...config, windowSize: 1, name: 'One-Bit Sliding Window' }, prng);
    this.sendBase = 0;          // Index of frame being processed (0 ... totalFrames - 1)
    this.expectedSeq = 0;       // 0 or 1
    this.senderWaiting = false; // Waiting for ACK
    this.frames = [];           // Array of frame state tracking objects
    this._initFrames();
  }

  _initFrames() {
    this.frames = [];
    for (let i = 0; i < this.totalFrames; i++) {
      this.frames.push({
        id: i,
        seq: i % 2,
        status: 'unsent', // 'unsent' | 'in-flight' | 'acked' | 'retrying'
        txAttempts: 0
      });
    }
  }

  reset() {
    super.reset();
    this.sendBase = 0;
    this.expectedSeq = 0;
    this.senderWaiting = false;
    this._initFrames();
  }

  /**
   * Check if sender can transmit a frame right now.
   * In Stop-and-Wait, sender can transmit only if not waiting for ACK and sendBase < totalFrames.
   * @returns {object|null} Frame to transmit or null
   */
  canTransmit() {
    if (!this.senderWaiting && this.sendBase < this.totalFrames) {
      return this.frames[this.sendBase];
    }
    return null;
  }

  /**
   * Handle sender frame transmission.
   * @param {number} simTime 
   * @param {boolean} isRetry 
   * @returns {object} Action details for DES
   */
  onSendFrame(simTime, isRetry = false) {
    const frame = this.frames[this.sendBase];
    frame.status = isRetry ? 'retrying' : 'in-flight';
    frame.txAttempts++;
    this.metrics.totalFramesTx++;
    if (isRetry) {
      this.metrics.retransmissions++;
    }

    this.senderWaiting = true;

    // Determine channel packet loss probabilistically
    const isLost = this.prng.chance(this.pktLossProb);

    // Register active timer
    const timeoutTime = simTime + this.timeout;
    this.activeTimers.set(frame.id, timeoutTime);

    return {
      frameId: frame.id,
      seq: frame.seq,
      isRetry,
      isLost,
      arrivalTime: simTime + this.txDelay,
      timeoutTime
    };
  }

  /**
   * Handle frame arrival at receiver.
   * @param {number} simTime 
   * @param {object} packetData 
   * @returns {object} Action details for DES (ACK packet)
   */
  onReceiveFrame(simTime, packetData) {
    if (packetData.isLost) {
      this.metrics.packetsLost++;
      return { packetLost: true, frameId: packetData.frameId };
    }

    const frameId = packetData.frameId;
    const seq = packetData.seq;
    let accepted = false;

    // Check 1-bit sequence match
    if (seq === this.expectedSeq) {
      // In-order frame received
      accepted = true;
      this.metrics.uniqueDelivered++;
      this.expectedSeq = 1 - this.expectedSeq; // Alternate 0 <-> 1
    } else {
      // Duplicate frame received (seq != expectedSeq)
      accepted = false;
    }

    // Receiver sends ACK for the received sequence number
    const ackLost = this.prng.chance(this.ackLossProb);

    return {
      packetLost: false,
      accepted,
      frameId,
      ackSeq: seq,
      ackLost,
      ackArrivalTime: simTime + this.ackDelay
    };
  }

  /**
   * Handle ACK arrival at sender.
   * @param {number} simTime 
   * @param {object} ackData 
   * @returns {object}
   */
  onReceiveAck(simTime, ackData) {
    if (ackData.ackLost) {
      this.metrics.acksLost++;
      return { ackLost: true, frameId: ackData.frameId };
    }

    this.metrics.acksReceived++;
    const frame = this.frames[this.sendBase];

    // Verify ACK corresponds to current outstanding frame
    if (frame && ackData.ackSeq === frame.seq && ackData.frameId === frame.id) {
      // Valid ACK received: cancel timer and slide window
      this.activeTimers.delete(frame.id);
      frame.status = 'acked';
      this.sendBase++;
      this.senderWaiting = false;

      const isComplete = this.sendBase >= this.totalFrames;
      if (isComplete) {
        this.finalizeMetrics(simTime);
      }

      return {
        ackLost: false,
        valid: true,
        frameId: ackData.frameId,
        newSendBase: this.sendBase,
        isComplete
      };
    }

    // Outdated or unexpected ACK ignored
    return {
      ackLost: false,
      valid: false,
      frameId: ackData.frameId
    };
  }

  /**
   * Handle timeout event for frame.
   * @param {number} simTime 
   * @param {number} frameId 
   * @returns {object|null}
   */
  onTimeout(simTime, frameId) {
    if (this.sendBase < this.totalFrames && this.frames[this.sendBase].id === frameId && this.senderWaiting) {
      this.metrics.timeoutsTriggered++;
      this.activeTimers.delete(frameId);
      // Sender retransmits frame
      return {
        shouldRetransmit: true,
        frameId
      };
    }
    return { shouldRetransmit: false };
  }

  /**
   * State snapshot for rendering.
   */
  getStateSnapshot() {
    return {
      protocolName: this.name,
      windowSize: 1,
      totalFrames: this.totalFrames,
      sendBase: this.sendBase,
      nextSeqNum: this.sendBase + (this.senderWaiting ? 1 : 0),
      expectedSeq: this.expectedSeq,
      senderWaiting: this.senderWaiting,
      frames: this.frames.map(f => ({ ...f })),
      receiverWindow: {
        base: this.sendBase,
        size: 1,
        expectedSeq: this.expectedSeq
      },
      activeTimers: Array.from(this.activeTimers.entries()).map(([fId, exp]) => ({
        frameId: fId,
        expiresAt: exp
      })),
      metrics: { ...this.metrics },
      isComplete: this.isComplete
    };
  }
}

