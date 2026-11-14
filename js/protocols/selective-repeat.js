/**
 * DEVNET — Selective Repeat (SR) Protocol
 * Pipelined transmission with independent packet buffering and individual ACKs.
 * Sender window size: N.
 * Receiver window size: N.
 * Independent retransmission timer for every outstanding frame.
 * Retransmits ONLY lost/timed-out frames.
 */

import { BaseProtocol } from './base-protocol.js';

export class SelectiveRepeatProtocol extends BaseProtocol {
  constructor(config, prng) {
    super({ ...config, name: 'Selective Repeat' }, prng);
    this.sendBase = 0;          // Oldest unacknowledged frame index at sender
    this.nextSeqNum = 0;        // Next frame sequence number to be sent
    this.recvBase = 0;          // Lowest sequence number expected at receiver
    this.receiverBuffer = new Set(); // Buffered frame IDs at receiver
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
    this.recvBase = 0;
    this.receiverBuffer.clear();
    this._initFrames();
  }

  /**
   * Check if sender can transmit next frame.
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
   * @param {number|null} explicitFrameId (For selective individual retransmission)
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

    // Each frame maintains its own independent timer!
    const timeoutTime = simTime + this.timeout;
    this.activeTimers.set(frameId, timeoutTime);

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
    let shouldSendAck = false;
    const deliveredFrames = [];

    // Case 1: Frame falls within receiver window [recvBase ... recvBase + windowSize - 1]
    if (frameId >= this.recvBase && frameId < this.recvBase + this.windowSize) {
      shouldSendAck = true;
      accepted = true;

      // Buffer frame if not already buffered
      if (!this.receiverBuffer.has(frameId)) {
        this.receiverBuffer.add(frameId);
      }

      // If frameId is recvBase, advance window and deliver all contiguous buffered frames
      if (frameId === this.recvBase) {
        while (this.receiverBuffer.has(this.recvBase)) {
          deliveredFrames.push(this.recvBase);
          this.receiverBuffer.delete(this.recvBase);
          this.metrics.uniqueDelivered++;
          this.recvBase++;
        }
      }
    }
    // Case 2: Frame falls in previous window [recvBase - windowSize ... recvBase - 1]
    // Frame was already delivered, but previous ACK might have been lost
    else if (frameId >= Math.max(0, this.recvBase - this.windowSize) && frameId < this.recvBase) {
      shouldSendAck = true;
      accepted = false; // duplicate
    } else {
      // Ignored (outside window boundaries)
      shouldSendAck = false;
      accepted = false;
    }

    let ackLost = false;
    if (shouldSendAck) {
      ackLost = this.prng.chance(this.ackLossProb);
    }

    return {
      packetLost: false,
      accepted,
      shouldSendAck,
      frameId,
      ackSeq: frameId, // Individual ACK
      ackLost,
      deliveredFrames,
      recvBase: this.recvBase,
      ackArrivalTime: simTime + this.ackDelay
    };
  }

  /**
   * Handle individual ACK arrival at sender.
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
    const frameId = ackData.ackSeq;

    // Check if ACK is for a valid outstanding frame
    if (frameId >= 0 && frameId < this.totalFrames) {
      const frame = this.frames[frameId];
      frame.status = 'acked';
      this.activeTimers.delete(frameId);

      // If ACK is for sendBase, advance sendBase forward over consecutive acked frames
      if (frameId === this.sendBase) {
        while (this.sendBase < this.totalFrames && this.frames[this.sendBase].status === 'acked') {
          this.sendBase++;
        }
      }

      const isComplete = this.sendBase >= this.totalFrames;
      if (isComplete) {
        this.finalizeMetrics(simTime);
      }

      return {
        ackLost: false,
        valid: true,
        frameId,
        newSendBase: this.sendBase,
        isComplete
      };
    }

    return {
      ackLost: false,
      valid: false,
      frameId
    };
  }

  /**
   * Handle timeout event for specific frame.
   * In Selective Repeat, ONLY this single frame is retransmitted!
   * @param {number} simTime 
   * @param {number} frameId 
   * @returns {object}
   */
  onTimeout(simTime, frameId) {
    const frame = this.frames[frameId];
    // Check if frame is still unacknowledged
    if (frame && frame.status !== 'acked') {
      this.metrics.timeoutsTriggered++;
      this.activeTimers.delete(frameId);

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
      windowSize: this.windowSize,
      totalFrames: this.totalFrames,
      sendBase: this.sendBase,
      nextSeqNum: this.nextSeqNum,
      recvBase: this.recvBase,
      bufferedFrames: Array.from(this.receiverBuffer),
      frames: this.frames.map(f => ({ ...f })),
      receiverWindow: {
        base: this.recvBase,
        size: this.windowSize,
        expectedSeq: this.recvBase
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

