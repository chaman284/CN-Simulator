/**
 * DEVNET — Go-Back-N (GBN) Protocol
 * Pipelined transmission with cumulative acknowledgments.
 * Sender window size: N.
 * Receiver window size: 1 (strictly in-order acceptance).
 * Single retransmission timer for the oldest unacknowledged frame (`sendBase`).
 */

import { BaseProtocol } from './base-protocol.js';

export class GoBackNProtocol extends BaseProtocol {
  constructor(config, prng) {
    super({ ...config, name: 'Go-Back-N' }, prng);
    this.sendBase = 0;          // Oldest unacknowledged frame index
    this.nextSeqNum = 0;        // Next frame sequence number to be sent
    this.expectedSeq = 0;       // Next frame expected by receiver
    this.timerRunning = false;
    this.timerExpiry = 0;
    this.frames = [];
    this._initFrames();
  }

  _initFrames() {
    this.frames = [];
    for (let i = 0; i < this.totalFrames; i++) {
      this.frames.push({
        id: i,
        seq: i,
        status: 'unsent', // 'unsent' | 'in-flight' | 'acked' | 'retrying'
        txAttempts: 0
      });
    }
  }

  reset() {
    super.reset();
    this.sendBase = 0;
    this.nextSeqNum = 0;
    this.expectedSeq = 0;
    this.timerRunning = false;
    this.timerExpiry = 0;
    this._initFrames();
  }

  /**
   * Check if sender has capacity to transmit next frame.
   * Can transmit if nextSeqNum < sendBase + windowSize and nextSeqNum < totalFrames.
   * @returns {object|null}
   */
  canTransmit() {
    if (this.nextSeqNum < this.sendBase + this.windowSize && this.nextSeqNum < this.totalFrames) {
      return this.frames[this.nextSeqNum];
    }
    return null;
  }

  /**
   * Handle sender frame transmission.
   * @param {number} simTime 
   * @param {number|null} explicitFrameId (Used during retransmission of window)
   * @returns {object} Action details for DES
   */
  onSendFrame(simTime, explicitFrameId = null) {
    const isRetry = explicitFrameId !== null;
    const frameId = isRetry ? explicitFrameId : this.nextSeqNum;
    const frame = this.frames[frameId];

    frame.status = isRetry ? 'retrying' : 'in-flight';
    frame.txAttempts++;
    this.metrics.totalFramesTx++;
    if (isRetry) {
      this.metrics.retransmissions++;
    } else {
      this.nextSeqNum++;
    }

    // Determine channel packet drop probabilistically
    const isLost = this.prng.chance(this.pktLossProb);

    // If timer is not running, start it for sendBase
    let timeoutTime = null;
    if (!this.timerRunning) {
      this.timerRunning = true;
      timeoutTime = simTime + this.timeout;
      this.timerExpiry = timeoutTime;
      this.activeTimers.set(this.sendBase, timeoutTime);
    } else {
      timeoutTime = this.timerExpiry;
    }

    return {
      frameId: frame.id,
      seq: frame.seq,
      isRetry,
      isLost,
      arrivalTime: simTime + this.txDelay,
      timeoutTime,
      sendBase: this.sendBase,
      nextSeqNum: this.nextSeqNum
    };
  }

  /**
   * Handle frame arrival at receiver.
   * @param {number} simTime 
   * @param {object} packetData 
   * @returns {object}
   */
  onReceiveFrame(simTime, packetData) {
    if (packetData.isLost) {
      this.metrics.packetsLost++;
      return { packetLost: true, frameId: packetData.frameId };
    }

    const frameId = packetData.frameId;
    let accepted = false;
    let ackSeqToSend = -1;

    // Strict in-order acceptance
    if (frameId === this.expectedSeq) {
      accepted = true;
      this.metrics.uniqueDelivered++;
      ackSeqToSend = this.expectedSeq;
      this.expectedSeq++;
    } else {
      // Out of order: discard frame, re-ACK highest consecutive frame
      accepted = false;
      ackSeqToSend = this.expectedSeq - 1;
    }

    // Check if ACK gets lost in reverse channel
    const ackLost = this.prng.chance(this.ackLossProb);

    return {
      packetLost: false,
      accepted,
      frameId,
      ackSeq: ackSeqToSend,
      ackLost,
      expectedSeq: this.expectedSeq,
      ackArrivalTime: simTime + this.ackDelay
    };
  }

  /**
   * Handle cumulative ACK arrival at sender.
   * @param {number} simTime 
   * @param {object} ackData 
   * @returns {object}
   */
  onReceiveAck(simTime, ackData) {
    if (ackData.ackLost) {
      this.metrics.acksLost++;
      return { ackLost: true, ackSeq: ackData.ackSeq };
    }

    this.metrics.acksReceived++;
    const ackSeq = ackData.ackSeq;

    // In GBN, cumulative ACK k acknowledges all frames <= k
    if (ackSeq >= this.sendBase) {
      // Mark all frames from sendBase to ackSeq as acknowledged
      for (let i = this.sendBase; i <= ackSeq && i < this.totalFrames; i++) {
        this.frames[i].status = 'acked';
      }

      this.activeTimers.delete(this.sendBase);
      this.sendBase = ackSeq + 1;

      let newTimeoutTime = null;
      if (this.sendBase === this.nextSeqNum) {
        // No outstanding unacknowledged frames: stop timer
        this.timerRunning = false;
        this.activeTimers.clear();
      } else {
        // Outstanding frames still exist: restart timer for new sendBase
        this.timerRunning = true;
        newTimeoutTime = simTime + this.timeout;
        this.timerExpiry = newTimeoutTime;
        this.activeTimers.clear();
        this.activeTimers.set(this.sendBase, newTimeoutTime);
      }

      const isComplete = this.sendBase >= this.totalFrames;
      if (isComplete) {
        this.finalizeMetrics(simTime);
      }

      return {
        ackLost: false,
        valid: true,
        ackSeq,
        newSendBase: this.sendBase,
        newTimeoutTime,
        isComplete
      };
    }

    // Duplicate or out-of-window ACK
    return {
      ackLost: false,
      valid: false,
      ackSeq,
      currentSendBase: this.sendBase
    };
  }

  /**
   * Handle timeout for sendBase.
   * GBN rolls back and retransmits all frames from sendBase to nextSeqNum - 1!
   * @param {number} simTime 
   * @param {number} frameId 
   * @returns {object}
   */
  onTimeout(simTime, frameId) {
    if (frameId === this.sendBase && this.sendBase < this.nextSeqNum) {
      this.metrics.timeoutsTriggered++;

      // Restart timer for sendBase
      const newTimeout = simTime + this.timeout;
      this.timerExpiry = newTimeout;
      this.timerRunning = true;
      this.activeTimers.clear();
      this.activeTimers.set(this.sendBase, newTimeout);

      // Collect list of frames in current window that must be retransmitted
      const framesToRetransmit = [];
      for (let i = this.sendBase; i < this.nextSeqNum; i++) {
        framesToRetransmit.push(i);
      }

      return {
        shouldRetransmit: true,
        framesToRetransmit,
        newTimeout
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
      windowSize: this.windowSize,
      totalFrames: this.totalFrames,
      sendBase: this.sendBase,
      nextSeqNum: this.nextSeqNum,
      expectedSeq: this.expectedSeq,
      timerRunning: this.timerRunning,
      frames: this.frames.map(f => ({ ...f })),
      receiverWindow: {
        base: this.expectedSeq,
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

