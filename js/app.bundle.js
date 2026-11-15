/* DEVNET — Self-Contained Browser Application Bundle */
(function() {
"use strict";

/* ─── File: js/engine/prng.js ─── */
/**
 * DEVNET — Seedable Pseudo-Random Number Generator (PRNG)
 * Mulberry32 implementation for deterministic academic simulations.
 */
class PRNG {
  /**
   * @param {number|null} seed Initial seed integer. If null, generates random seed.
   */
  constructor(seed = 42) {
    this.initialSeed = seed !== null ? Number(seed) : Math.floor(Math.random() * 2147483647);
    this.seed = this.initialSeed;
  }

  /**
   * Reset generator to initial seed.
   */
  reset() {
    this.seed = this.initialSeed;
  }

  /**
   * Set new seed and reset.
   * @param {number} seed 
   */
  setSeed(seed) {
    this.initialSeed = Number(seed);
    this.reset();
  }

  /**
   * Generate next 32-bit integer pseudo-random number.
   * @returns {number} Float in range [0, 1)
   */
  random() {
    let t = (this.seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Return boolean with probability p of being true.
   * @param {number} probability Float in range [0, 1]
   * @returns {boolean}
   */
  chance(probability) {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.random() < probability;
  }

  /**
   * Return integer in range [min, max] inclusive.
   */
  randInt(min, max) {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }
}



/* ─── File: js/engine/event-queue.js ─── */
/**
 * DEVNET — Discrete Event Priority Queue (Min-Heap)
 * Events are ordered strictly by simulation timestamp `event.time`.
 * Ties broken by deterministic sequential event ID.
 */

let globalEventId = 0;
class SimEvent {
  /**
   * @param {number} time Discrete simulation time (ms)
   * @param {string} type 'FRAME_TX' | 'FRAME_ARRIVE' | 'ACK_TX' | 'ACK_ARRIVE' | 'TIMEOUT'
   * @param {object} payload Arbitrary event payload
   */
  constructor(time, type, payload = {}) {
    this.id = ++globalEventId;
    this.time = Number(time);
    this.type = type;
    this.payload = payload;
    this.cancelled = false;
  }
}
class EventQueue {
  constructor() {
    /** @type {SimEvent[]} */
    this.heap = [];
  }

  /**
   * Insert event into priority queue.
   * @param {SimEvent} event 
   */
  push(event) {
    this.heap.push(event);
    this._bubbleUp(this.heap.length - 1);
  }

  /**
   * Remove and return the earliest event.
   * Skips cancelled events automatically.
   * @returns {SimEvent|null}
   */
  pop() {
    while (this.heap.length > 0) {
      const top = this.heap[0];
      const last = this.heap.pop();
      if (this.heap.length > 0) {
        this.heap[0] = last;
        this._bubbleDown(0);
      }
      if (!top.cancelled) {
        return top;
      }
    }
    return null;
  }

  /**
   * Peek next active event without removing.
   * @returns {SimEvent|null}
   */
  peek() {
    while (this.heap.length > 0 && this.heap[0].cancelled) {
      this.pop();
    }
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  /**
   * Cancel events matching a predicate function.
   * @param {function(SimEvent): boolean} predicate 
   * @returns {number} Count of cancelled events
   */
  cancel(predicate) {
    let count = 0;
    for (const ev of this.heap) {
      if (!ev.cancelled && predicate(ev)) {
        ev.cancelled = true;
        count++;
      }
    }
    return count;
  }

  /**
   * Total number of pending active events.
   */
  size() {
    let active = 0;
    for (const ev of this.heap) {
      if (!ev.cancelled) active++;
    }
    return active;
  }

  isEmpty() {
    return this.size() === 0;
  }

  clear() {
    this.heap = [];
  }

  /* Internal Min-Heap Methods */
  _bubbleUp(idx) {
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      if (this._compare(this.heap[idx], this.heap[parentIdx]) < 0) {
        this._swap(idx, parentIdx);
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  _bubbleDown(idx) {
    const length = this.heap.length;
    while (true) {
      let smallest = idx;
      const leftChild = 2 * idx + 1;
      const rightChild = 2 * idx + 2;

      if (leftChild < length && this._compare(this.heap[leftChild], this.heap[smallest]) < 0) {
        smallest = leftChild;
      }
      if (rightChild < length && this._compare(this.heap[rightChild], this.heap[smallest]) < 0) {
        smallest = rightChild;
      }

      if (smallest !== idx) {
        this._swap(idx, smallest);
        idx = smallest;
      } else {
        break;
      }
    }
  }

  _compare(a, b) {
    if (a.time !== b.time) {
      return a.time - b.time;
    }
    return a.id - b.id;
  }

  _swap(i, j) {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}



/* ─── File: js/protocols/base-protocol.js ─── */
/**
 * DEVNET — Base Protocol Class
 * Encapsulates common protocol state, parameter configuration,
 * metrics calculation, and lifecycle hooks.
 */
class BaseProtocol {
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


/* ─── File: js/protocols/stop-and-wait.js ─── */
/**
 * DEVNET — One-Bit Sliding Window Protocol (Stop-and-Wait ARQ)
 * 1-bit sequence space: 0 and 1.
 * Sender window size: 1.
 * Receiver window size: 1.
 */
class StopAndWaitProtocol extends BaseProtocol {
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



/* ─── File: js/protocols/go-back-n.js ─── */
/**
 * DEVNET — Go-Back-N (GBN) Protocol
 * Pipelined transmission with cumulative acknowledgments.
 * Sender window size: N.
 * Receiver window size: 1 (strictly in-order acceptance).
 * Single retransmission timer for the oldest unacknowledged frame (`sendBase`).
 */
class GoBackNProtocol extends BaseProtocol {
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



/* ─── File: js/protocols/selective-repeat.js ─── */
/**
 * DEVNET — Selective Repeat (SR) Protocol
 * Pipelined transmission with independent packet buffering and individual ACKs.
 * Sender window size: N.
 * Receiver window size: N.
 * Independent retransmission timer for every outstanding frame.
 * Retransmits ONLY lost/timed-out frames.
 */
class SelectiveRepeatProtocol extends BaseProtocol {
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



/* ─── File: js/engine/simulation-core.js ─── */
/**
 * DEVNET — Discrete Event Simulation Core Engine
 * Coordinates the Event Queue, Protocol logic, Time advancement, and UI dispatching.
 */
class SimulationCore {
  /**
   * @param {object} config 
   */
  constructor(config = {}) {
    this.config = {
      protocolType: 'gbn', // 'one-bit' | 'gbn' | 'sr'
      windowSize: 4,
      totalFrames: 20,
      txDelay: 100,
      ackDelay: 50,
      pktLossProb: 0.1,
      ackLossProb: 0.05,
      timeout: 300,
      deterministic: true,
      randomSeed: 42,
      ...config
    };

    this.prng = new PRNG(this.config.deterministic ? this.config.randomSeed : null);
    this.queue = new EventQueue();
    this.simTime = 0;
    this.speed = 1.0;
    this.state = 'IDLE'; // 'IDLE' | 'RUNNING' | 'PAUSED' | 'FINISHED'

    this.animFrameId = null;
    this.lastRealTimestamp = null;

    // Instantiate active protocol
    this.protocol = this._createProtocolInstance();

    // Callbacks
    this.onStateChanged = null;
    this.onLogMessage = null;
    this.onFinished = null;
    this.onEventProcessed = null;
  }

  _createProtocolInstance() {
    const protoConfig = {
      windowSize: this.config.protocolType === 'one-bit' ? 1 : this.config.windowSize,
      totalFrames: this.config.totalFrames,
      txDelay: this.config.txDelay,
      ackDelay: this.config.ackDelay,
      pktLossProb: this.config.pktLossProb,
      ackLossProb: this.config.ackLossProb,
      timeout: this.config.timeout
    };

    switch (this.config.protocolType) {
      case 'one-bit':
        return new StopAndWaitProtocol(protoConfig, this.prng);
      case 'sr':
        return new SelectiveRepeatProtocol(protoConfig, this.prng);
      case 'gbn':
      default:
        return new GoBackNProtocol(protoConfig, this.prng);
    }
  }

  updateConfig(newConfig) {
    this.stop();
    this.config = { ...this.config, ...newConfig };
    this.prng.setSeed(this.config.deterministic ? this.config.randomSeed : Math.floor(Math.random() * 2147483647));
    this.reset();
  }

  setSpeed(speed) {
    this.speed = Math.max(0.1, Math.min(4.0, Number(speed)));
  }

  reset() {
    this.stop();
    this.simTime = 0;
    this.queue.clear();
    this.prng.reset();
    this.protocol = this._createProtocolInstance();
    this.state = 'IDLE';
    this.lastRealTimestamp = null;
    this._notifyStateChanged();
  }

  start() {
    if (this.state === 'RUNNING') return;

    if (this.state === 'IDLE' || this.state === 'FINISHED') {
      this.reset();
      this.state = 'RUNNING';
      this.protocol.metrics.startTime = this.simTime;
      this._emitLog('SYSTEM', 'Simulation started', 'badge-tx');

      // Transmit first batch within window
      this._handleTransmitWindow();
    } else if (this.state === 'PAUSED') {
      this.state = 'RUNNING';
      this._emitLog('SYSTEM', 'Simulation resumed', 'badge-tx');
    }

    this._notifyStateChanged();
    this.lastRealTimestamp = performance.now();
    this._runLoop();
  }

  pause() {
    if (this.state === 'RUNNING') {
      this.state = 'PAUSED';
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
      this._emitLog('SYSTEM', 'Simulation paused', 'badge-timeout');
      this._notifyStateChanged();
    }
  }

  stop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.state = 'IDLE';
  }

  step() {
    if (this.state === 'FINISHED') return;
    if (this.state === 'IDLE') {
      this.start();
      this.pause();
      return;
    }

    if (this.queue.isEmpty()) {
      this._finishSimulation();
      return;
    }

    const nextEvent = this.queue.pop();
    if (nextEvent) {
      this.simTime = nextEvent.time;
      this._processEvent(nextEvent);
      this._notifyStateChanged();

      if (this.protocol.isComplete || this.queue.isEmpty()) {
        this._finishSimulation();
      }
    }
  }

  _runLoop() {
    if (this.state !== 'RUNNING') return;

    const now = performance.now();
    const realDelta = now - (this.lastRealTimestamp || now);
    this.lastRealTimestamp = now;

    // Visual pacing: scale real time so packets travel smoothly and visibly
    // 0.5x Slow ~1.6s per hop, 1x Normal ~800ms per hop, 2x Fast ~400ms per hop
    const timeScale = 0.12;
    const simTimeDelta = realDelta * (this.speed * timeScale);
    const targetSimTime = this.simTime + simTimeDelta;

    while (!this.queue.isEmpty() && this.queue.peek().time <= targetSimTime) {
      const event = this.queue.pop();
      this.simTime = event.time;
      this._processEvent(event);
      this._notifyStateChanged();

      if (this.protocol.isComplete) {
        this._finishSimulation();
        return;
      }
    }

    this.simTime = targetSimTime;
    this._notifyStateChanged();

    if (this.protocol.isComplete || (this.queue.isEmpty() && this.protocol.sendBase >= this.protocol.totalFrames)) {
      this._finishSimulation();
      return;
    }

    this.animFrameId = requestAnimationFrame(() => this._runLoop());
  }

  _transmitSingleFrame(frameId, isRetry) {
    const txResult = this.protocol.onSendFrame(this.simTime, isRetry ? frameId : null);

    this._emitLog(
      isRetry ? 'RETRY' : 'FRAME',
      `Frame ${txResult.frameId} transmitted (Seq: ${txResult.seq})${txResult.isLost ? ' — [Scheduled Loss in Channel]' : ''}`,
      isRetry ? 'badge-retry' : 'badge-tx',
      txResult
    );

    // Notify visualizer
    if (this.onEventProcessed) {
      this.onEventProcessed({
        type: 'FRAME_TX',
        payload: {
          frameId: txResult.frameId,
          seq: txResult.seq,
          isRetry,
          isLost: txResult.isLost
        }
      });
    }

    // Schedule frame arrival at receiver
    this.queue.push(new SimEvent(txResult.arrivalTime, 'FRAME_ARRIVE', {
      frameId: txResult.frameId,
      seq: txResult.seq,
      isLost: txResult.isLost,
      startTime: this.simTime,
      arrivalTime: txResult.arrivalTime
    }));

    // Schedule timeout event
    this.queue.push(new SimEvent(txResult.timeoutTime, 'TIMEOUT', {
      frameId: txResult.frameId
    }));
  }

  _handleTransmitWindow() {
    let nextFrame = this.protocol.canTransmit();
    while (nextFrame) {
      this._transmitSingleFrame(nextFrame.id, false);
      if (this.config.protocolType === 'one-bit') {
        break;
      }
      nextFrame = this.protocol.canTransmit();
    }
  }

  _processEvent(event) {
    switch (event.type) {
      case 'FRAME_ARRIVE': {
        const payload = event.payload;
        if (payload.isLost) {
          this.protocol.metrics.packetsLost++;
          this._emitLog('LOSS', `Frame ${payload.frameId} lost in transmission channel (Packet dropped)`, 'badge-loss', payload);
          return;
        }

        const rxResult = this.protocol.onReceiveFrame(this.simTime, payload);

        if (rxResult.accepted) {
          this._emitLog(
            'RECV',
            `Frame ${payload.frameId} successfully received & delivered at receiver`,
            'badge-recv',
            rxResult
          );
        } else {
          this._emitLog(
            'DROP',
            `Frame ${payload.frameId} arrived out-of-order/duplicate — discarded by receiver`,
            'badge-loss',
            rxResult
          );
        }

        // Send ACK
        if (rxResult.shouldSendAck !== false && rxResult.ackSeq !== -1) {
          this._emitLog(
            'ACK_TX',
            `Receiver sent ACK ${rxResult.ackSeq}${rxResult.ackLost ? ' — [Scheduled Loss in Reverse Channel]' : ''}`,
            'badge-ack',
            rxResult
          );

          if (this.onEventProcessed) {
            this.onEventProcessed({
              type: 'ACK_TX',
              payload: {
                frameId: payload.frameId,
                ackSeq: rxResult.ackSeq,
                ackLost: rxResult.ackLost
              }
            });
          }

          this.queue.push(new SimEvent(rxResult.ackArrivalTime, 'ACK_ARRIVE', {
            frameId: payload.frameId,
            ackSeq: rxResult.ackSeq,
            ackLost: rxResult.ackLost,
            startTime: this.simTime,
            arrivalTime: rxResult.ackArrivalTime
          }));
        }
        break;
      }

      case 'ACK_ARRIVE': {
        const payload = event.payload;
        if (payload.ackLost) {
          this.protocol.metrics.acksLost++;
          this._emitLog('LOSS', `ACK ${payload.ackSeq} lost in reverse channel (ACK dropped)`, 'badge-loss', payload);
          return;
        }

        const ackResult = this.protocol.onReceiveAck(this.simTime, payload);

        if (ackResult.valid) {
          this._emitLog(
            'ACK_REC',
            `Sender accepted ACK ${payload.ackSeq}. Window advanced (Base: ${this.protocol.sendBase})`,
            'badge-ack',
            ackResult
          );

          // Window slid: transmit new frames that entered window
          this._handleTransmitWindow();
        } else {
          this._emitLog(
            'ACK_IGN',
            `Sender ignored duplicate/outdated ACK ${payload.ackSeq}`,
            'badge-loss',
            ackResult
          );
        }
        break;
      }

      case 'TIMEOUT': {
        const { frameId } = event.payload;
        const timeoutResult = this.protocol.onTimeout(this.simTime, frameId);

        if (timeoutResult.shouldRetransmit) {
          if (timeoutResult.framesToRetransmit) {
            // GBN: Retransmit entire window
            this._emitLog(
              'TIMEOUT',
              `Timeout on Frame ${frameId}! GBN rolling back: retransmitting Frames [${timeoutResult.framesToRetransmit.join(', ')}]`,
              'badge-timeout',
              timeoutResult
            );

            for (let i = 0; i < timeoutResult.framesToRetransmit.length; i++) {
              const fId = timeoutResult.framesToRetransmit[i];
              this._transmitSingleFrame(fId, true);
            }
          } else {
            // One-Bit or Selective Repeat: Retransmit single frame
            this._emitLog(
              'TIMEOUT',
              `Timeout on Frame ${frameId}! Retransmitting Frame ${frameId} only`,
              'badge-timeout',
              timeoutResult
            );

            this._transmitSingleFrame(frameId, true);
          }
        }
        break;
      }
    }
  }

  _finishSimulation() {
    this.stop();
    this.state = 'FINISHED';
    this.protocol.finalizeMetrics(this.simTime);
    this._emitLog('COMPLETE', `Simulation finished in ${this.simTime} ms! Throughput: ${this.protocol.metrics.throughput} fps, Efficiency: ${this.protocol.metrics.efficiency}%`, 'badge-recv');
    this._notifyStateChanged();

    if (this.onFinished) {
      this.onFinished(this.protocol.metrics);
    }
  }

  _notifyStateChanged() {
    if (this.onStateChanged) {
      this.onStateChanged({
        simTime: Math.round(this.simTime),
        state: this.state,
        snapshot: this.protocol.getStateSnapshot(),
        queueLength: this.queue.size()
      });
    }
  }

  _emitLog(type, message, badgeClass, data = {}) {
    if (this.onLogMessage) {
      this.onLogMessage({
        time: Math.round(this.simTime),
        type,
        message,
        badgeClass,
        data
      });
    }
  }
}


/* ─── File: js/ui/liquid-glass.js ─── */
/**
 * DEVNET — Refined Glassmorphism UI (Clean, Minimal, No Wobble)
 * Completely eliminates erratic 3D tilts, mouse-following spotlights, and unwanted hovering gestures.
 * Provides clean Apple-style dark glass surfaces with crisp borders and subtle ambient depth.
 */
function ensureLiquidGlassFilter() {
  // Silent fallback - no invasive SVG warping
}
function applyLiquidGlass(element) {
  if (!element) return;
  element.classList.add('glass-card');
}
function initAllLiquidGlass() {
  // Ensures rock-solid stable cards without mouse-hover wobble
  document.querySelectorAll('.glass-card, .btn-primary, .btn-secondary, .comparison-ascii-card').forEach(el => {
    el.style.transform = 'none';
    el.style.willChange = 'auto';
  });
}


/* ─── File: js/ui/stage-visualizer.js ─── */
/**
 * DEVNET — Fixed-Stage Interactive Protocol Visualizer
 * Keeps the simulation entirely fixed on screen without vertical scrolling.
 * Features:
 * - Sender station with live sliding window buffer & active window bracket
 * - Animated in-flight packet traversal across forward and reverse channel tracks
 * - Mid-channel packet loss and ACK loss breaking animations
 * - Receiver station with expected sequence tracking and Selective Repeat buffering
 * - Plain-English Action Callout Banner explaining protocol decisions in real time
 */
class StageVisualizer {
  constructor(containerEl) {
    this.container = containerEl;
    this.protocolType = 'gbn';
    this.windowSize = 4;
    this.totalFrames = 20;
    this.animationSpeed = 1.0; // 0.5 (slow), 1.0 (normal), 2.0 (fast)
    this.timerInterval = null;
    this.timeoutDuration = 300;
    this.renderInitialStage();
  }

  renderInitialStage() {
    this.container.innerHTML = `
      <div class="stage-container">
        <!-- ── MAIN HORIZONTAL NETWORK STAGE (FIXED, NO SCROLL) ── -->
        <div class="network-stage">
          
          <!-- SENDER STATION -->
          <div class="station-card station-sender">
            <div class="station-header">
              <div class="station-title">
                <span class="station-icon">▲</span>
                <span>SENDER</span>
              </div>
              <span class="station-status status-idle" id="sender-status">IDLE</span>
            </div>

            <div class="station-meta">
              <div class="meta-item"><span>Base:</span> <strong id="sender-base">0</strong></div>
              <div class="meta-item"><span>Next:</span> <strong id="sender-next">0</strong></div>
              <div class="meta-item"><span>Win:</span> <strong id="sender-win">${this.windowSize}</strong></div>
            </div>

            <!-- Sender Sliding Window Buffer -->
            <div class="station-buffer-wrap">
              <div class="buffer-label">SENDER BUFFER (SLIDING WINDOW)</div>
              <div class="sliding-buffer-stage" id="sender-buffer-stage">
                <!-- Buffer cells dynamically injected -->
              </div>
            </div>

            <!-- Timeout Countdown Timer -->
            <div class="timer-display-wrap">
              <div class="timer-label">
                <span>TIMEOUT TIMER</span>
                <span id="timer-val">Inactive</span>
              </div>
              <div class="timer-bar-track">
                <div class="timer-bar-fill" id="timer-bar-fill" style="width: 0%;"></div>
              </div>
            </div>
          </div>

          <!-- PHYSICAL CHANNEL TRACKS -->
          <div class="channel-stage">
            <div class="channel-label">PHYSICAL TRANSMISSION MEDIUM</div>

            <!-- Forward Track (Data frames Sender -> Receiver) -->
            <div class="track-container forward-track">
              <div class="track-header">
                <span class="track-dir">FORWARD CHANNEL (DATA)</span>
                <span class="track-arrow">───────►</span>
              </div>
              <div class="track-rail" id="forward-rail">
                <div class="track-midpoint-mark">LOSS POINT</div>
              </div>
            </div>

            <!-- Reverse Track (ACKs Receiver -> Sender) -->
            <div class="track-container reverse-track">
              <div class="track-header">
                <span class="track-arrow">◄───────</span>
                <span class="track-dir">REVERSE CHANNEL (ACK)</span>
              </div>
              <div class="track-rail" id="reverse-rail">
                <div class="track-midpoint-mark">LOSS POINT</div>
              </div>
            </div>
          </div>

          <!-- RECEIVER STATION -->
          <div class="station-card station-receiver">
            <div class="station-header">
              <div class="station-title">
                <span class="station-icon">▼</span>
                <span>RECEIVER</span>
              </div>
              <span class="station-status status-idle" id="receiver-status">LISTENING</span>
            </div>

            <div class="station-meta">
              <div class="meta-item"><span>Expected:</span> <strong id="receiver-expected">0</strong></div>
              <div class="meta-item"><span>Accepted:</span> <strong id="receiver-accepted">0</strong></div>
            </div>

            <!-- Receiver Buffer -->
            <div class="station-buffer-wrap">
              <div class="buffer-label">RECEIVER BUFFER</div>
              <div class="sliding-buffer-stage" id="receiver-buffer-stage">
                <!-- Receiver cells dynamically injected -->
              </div>
            </div>

            <div class="receiver-feedback" id="receiver-feedback">
              Ready for incoming frames.
            </div>
          </div>

        </div>

        <!-- ── LIVE ACTION CALLOUT BANNER (FIXED IN PLACE) ── -->
        <div class="stage-callout-banner" id="stage-callout">
          <div class="callout-tag">STATUS</div>
          <div class="callout-msg">Simulation ready. Configure network parameters on the left and click <strong>▶ Run Simulation</strong>.</div>
        </div>
      </div>
    `;

    this.renderSenderBuffer(0, 0, this.windowSize);
    this.renderReceiverBuffer(0, []);
  }

  setSpeed(speedVal) {
    this.animationSpeed = Number(speedVal) || 1.0;
  }

  /**
   * Returns traversal duration in ms based on animation speed
   */
  getTravelDuration() {
    // 0.5x Slow = 1400ms, 1x Normal = 800ms, 2x Fast = 400ms
    if (this.animationSpeed <= 0.5) return 1400;
    if (this.animationSpeed >= 2.0) return 400;
    return 800;
  }

  setSenderStatus(text, type = 'idle') {
    const el = document.getElementById('sender-status');
    if (!el) return;
    el.textContent = text;
    el.className = `station-status status-${type}`;
  }

  setReceiverStatus(text, type = 'idle') {
    const el = document.getElementById('receiver-status');
    if (!el) return;
    el.textContent = text;
    el.className = `station-status status-${type}`;
  }

  setCallout(message, type = 'info') {
    const banner = document.getElementById('stage-callout');
    if (!banner) return;
    banner.className = `stage-callout-banner banner-${type}`;
    const tagMap = {
      info: 'INFO',
      transmit: 'TRANSMITTING',
      success: 'DELIVERED',
      loss: 'PACKET LOSS',
      timeout: 'TIMEOUT EVENT',
      retry: 'RETRANSMITTING'
    };
    const tag = tagMap[type] || 'STATUS';
    banner.innerHTML = `
      <div class="callout-tag">${tag}</div>
      <div class="callout-msg">${message}</div>
    `;
  }

  /**
   * Renders the sender buffer strip with active sliding window bracket
   */
  renderSenderBuffer(sendBase = 0, nextSeq = 0, winSize = 4) {
    const stage = document.getElementById('sender-buffer-stage');
    if (!stage) return;

    document.getElementById('sender-base').textContent = sendBase;
    document.getElementById('sender-next').textContent = nextSeq;
    document.getElementById('sender-win').textContent = winSize;

    const visibleSlots = Math.min(10, this.totalFrames);
    const startIdx = Math.max(0, Math.min(sendBase - 1, this.totalFrames - visibleSlots));
    const cells = [];

    for (let i = 0; i < visibleSlots; i++) {
      const frameId = startIdx + i;
      if (frameId >= this.totalFrames) break;

      const inWindow = frameId >= sendBase && frameId < sendBase + winSize;
      const isAcked = frameId < sendBase;
      const isNext = frameId === nextSeq;

      let cellClass = 'buf-cell';
      if (isAcked) cellClass += ' cell-acked';
      else if (inWindow) cellClass += ' cell-in-window';

      if (isNext && inWindow) cellClass += ' cell-active-pointer';

      cells.push(`
        <div class="${cellClass}" title="Frame ${frameId}">
          <span class="cell-num">${frameId}</span>
          ${isAcked ? '<span class="cell-sub">✓</span>' : ''}
          ${isNext && inWindow ? '<span class="cell-pointer">S▲</span>' : ''}
        </div>
      `);
    }

    stage.innerHTML = `
      <div class="buffer-strip-row">
        ${cells.join('')}
      </div>
      <div class="window-bracket-indicator">
        <span class="bracket-label">ACTIVE WINDOW (Size: ${winSize})</span>
      </div>
    `;
  }

  /**
   * Renders the receiver buffer strip
   */
  renderReceiverBuffer(expectedSeq = 0, bufferedFrames = []) {
    const stage = document.getElementById('receiver-buffer-stage');
    if (!stage) return;

    document.getElementById('receiver-expected').textContent = expectedSeq;
    document.getElementById('receiver-accepted').textContent = expectedSeq;

    const visibleSlots = Math.min(10, this.totalFrames);
    const startIdx = Math.max(0, Math.min(expectedSeq - 1, this.totalFrames - visibleSlots));
    const cells = [];

    for (let i = 0; i < visibleSlots; i++) {
      const frameId = startIdx + i;
      if (frameId >= this.totalFrames) break;

      const isDelivered = frameId < expectedSeq;
      const isExpected = frameId === expectedSeq;
      const isBuffered = bufferedFrames && bufferedFrames.includes(frameId);

      let cellClass = 'buf-cell';
      if (isDelivered) cellClass += ' cell-delivered';
      else if (isBuffered) cellClass += ' cell-buffered';
      else if (isExpected) cellClass += ' cell-expected';

      cells.push(`
        <div class="${cellClass}" title="Frame ${frameId}">
          <span class="cell-num">${frameId}</span>
          ${isDelivered ? '<span class="cell-sub">✓</span>' : ''}
          ${isBuffered ? '<span class="cell-sub">BUF</span>' : ''}
          ${isExpected ? '<span class="cell-pointer">R▼</span>' : ''}
        </div>
      `);
    }

    stage.innerHTML = `
      <div class="buffer-strip-row">
        ${cells.join('')}
      </div>
      <div class="window-bracket-indicator">
        <span class="bracket-label">${this.protocolType === 'sr' ? 'SELECTIVE REPEAT BUFFER' : `EXPECTED: FRAME ${expectedSeq}`}</span>
      </div>
    `;
  }

  /**
   * Start timeout timer bar animation
   */
  startTimer(duration = 300) {
    this.stopTimer();
    this.timeoutDuration = duration;
    const bar = document.getElementById('timer-bar-fill');
    const label = document.getElementById('timer-val');
    if (!bar || !label) return;

    const startTime = performance.now();
    const effectiveDuration = duration * (this.getTravelDuration() / 100);

    bar.style.transition = 'none';
    bar.style.width = '100%';
    bar.style.background = '#30d158';

    const update = () => {
      const elapsed = performance.now() - startTime;
      const pct = Math.max(0, 100 - (elapsed / effectiveDuration) * 100);
      bar.style.width = `${pct}%`;
      const rem = Math.max(0, Math.round(duration * (pct / 100)));
      label.textContent = `${rem}ms`;

      if (pct < 30) bar.style.background = '#ff453a';
      else if (pct < 60) bar.style.background = '#ff9f0a';

      if (pct > 0) {
        this.timerInterval = requestAnimationFrame(update);
      } else {
        label.textContent = 'Expired';
        bar.style.width = '0%';
      }
    };

    this.timerInterval = requestAnimationFrame(update);
  }

  stopTimer() {
    if (this.timerInterval) {
      cancelAnimationFrame(this.timerInterval);
      this.timerInterval = null;
    }
    const bar = document.getElementById('timer-bar-fill');
    const label = document.getElementById('timer-val');
    if (bar) bar.style.width = '0%';
    if (label) label.textContent = 'Idle';
  }

  /**
   * Animate a data frame traveling from Sender across to Receiver
   */
  animateFrameTransmission(txData, snapshot) {
    const rail = document.getElementById('forward-rail');
    if (!rail) return;

    this.setSenderStatus(`TX ${txData.frameId}`, txData.isRetry ? 'retry' : 'active');
    this.renderSenderBuffer(snapshot?.sendBase ?? txData.frameId, txData.frameId + 1, snapshot?.windowSize ?? this.windowSize);

    const packet = document.createElement('div');
    packet.className = `flight-packet packet-frame ${txData.isRetry ? 'packet-retry' : ''}`;
    packet.innerHTML = `<span>Frame ${txData.frameId}${txData.isRetry ? ' ↺' : ''}</span>`;
    rail.appendChild(packet);

    const duration = this.getTravelDuration();

    if (txData.isRetry) {
      this.setCallout(`Retransmitting Frame ${txData.frameId} across channel...`, 'retry');
    } else {
      this.setCallout(`Transmitting Frame ${txData.frameId} (Seq: ${txData.seq})`, 'transmit');
    }

    // Trigger smooth CSS slide
    requestAnimationFrame(() => {
      packet.style.transition = `left ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease`;

      if (txData.isLost) {
        // Travels to midpoint then breaks
        packet.style.left = '48%';
        setTimeout(() => {
          packet.classList.add('packet-lost-burst');
          packet.innerHTML = `<span>✕ Frame ${txData.frameId} Lost!</span>`;
          this.setCallout(`⚠️ Frame ${txData.frameId} was LOST in physical transmission channel!`, 'loss');
          setTimeout(() => {
            packet.remove();
          }, 600);
        }, duration * 0.5);
      } else {
        // Reaches receiver smoothly
        packet.style.left = 'calc(100% - 78px)';
        setTimeout(() => {
          this.setReceiverStatus(`RECV ${txData.frameId}`, 'active');
          const expected = snapshot?.expectedSeq ?? snapshot?.recvBase ?? txData.frameId;
          const fb = document.getElementById('receiver-feedback');
          if (fb) fb.textContent = `Frame ${txData.frameId} arrived safely at receiver.`;
          setTimeout(() => packet.remove(), 250);
        }, duration);
      }
    });

    this.startTimer(snapshot?.timeout ?? this.timeoutDuration);
  }

  /**
   * Animate an ACK packet traveling from Receiver back to Sender
   */
  animateAckTransmission(rxData, snapshot) {
    const rail = document.getElementById('reverse-rail');
    if (!rail) return;

    this.setReceiverStatus(`ACK ${rxData.ackSeq}`, 'success');
    const expected = snapshot?.expectedSeq ?? snapshot?.recvBase ?? rxData.ackSeq;
    const buffered = snapshot?.receiverWindow?.bufferedFrames ?? [];
    this.renderReceiverBuffer(expected, buffered);

    const packet = document.createElement('div');
    packet.className = 'flight-packet packet-ack';
    packet.innerHTML = `<span>ACK ${rxData.ackSeq}</span>`;
    rail.appendChild(packet);

    const duration = this.getTravelDuration() * 0.85;

    requestAnimationFrame(() => {
      packet.style.transition = `right ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease`;

      if (rxData.ackLost) {
        packet.style.right = '48%';
        setTimeout(() => {
          packet.classList.add('packet-lost-burst');
          packet.innerHTML = `<span>✕ ACK ${rxData.ackSeq} Lost!</span>`;
          this.setCallout(`⚠️ ACK ${rxData.ackSeq} lost on reverse return path!`, 'loss');
          setTimeout(() => packet.remove(), 600);
        }, duration * 0.5);
      } else {
        packet.style.right = 'calc(100% - 78px)';
        setTimeout(() => {
          this.setSenderStatus(`ACK ${rxData.ackSeq} OK`, 'success');
          this.renderSenderBuffer(snapshot?.sendBase ?? rxData.ackSeq, snapshot?.nextSeqNum ?? rxData.ackSeq, snapshot?.windowSize ?? this.windowSize);
          this.setCallout(`ACK ${rxData.ackSeq} accepted by Sender. Window advanced (Base: ${snapshot?.sendBase ?? rxData.ackSeq}).`, 'success');
          setTimeout(() => packet.remove(), 250);
        }, duration);
      }
    });
  }

  /**
   * Explicit retransmission banner when timeout occurs
   */
  showTimeoutAlert(protoType, frameId, framesToRetransmit) {
    this.setSenderStatus(`TIMEOUT ${frameId}`, 'loss');
    let msg = '';
    if (protoType === 'gbn') {
      const list = framesToRetransmit && framesToRetransmit.length > 0 ? framesToRetransmit.join(' → ') : `${frameId}`;
      msg = `⏱️ Timeout on Frame ${frameId}! <strong>Go-Back-N Protocol Action:</strong> Retransmitting all unacknowledged frames: <strong>${list}</strong>`;
    } else if (protoType === 'sr') {
      msg = `⏱️ Timeout on Frame ${frameId}! <strong>Selective Repeat Action:</strong> Retransmitting <strong>Frame ${frameId} only</strong> (subsequent frames safely buffered at Receiver).`;
    } else {
      msg = `⏱️ Timeout on Frame ${frameId}! <strong>Stop-and-Wait Action:</strong> Retransmitting <strong>Frame ${frameId} only</strong>.`;
    }

    this.setCallout(msg, 'timeout');
  }

  showSimulationComplete(metrics) {
    this.stopTimer();
    this.setSenderStatus('COMPLETE', 'success');
    this.setReceiverStatus('COMPLETE', 'success');
    this.setCallout(`🎉 Simulation Finished! Transmitted ${metrics.totalFramesTx} frames (${metrics.retransmissions} retransmissions, ${metrics.efficiency}% efficiency).`, 'success');
  }

  clear() {
    this.stopTimer();
    const fRail = document.getElementById('forward-rail');
    const rRail = document.getElementById('reverse-rail');
    if (fRail) fRail.querySelectorAll('.flight-packet').forEach(p => p.remove());
    if (rRail) rRail.querySelectorAll('.flight-packet').forEach(p => p.remove());
    this.renderSenderBuffer(0, 0, this.windowSize);
    this.renderReceiverBuffer(0, []);
    this.setSenderStatus('IDLE', 'idle');
    this.setReceiverStatus('LISTENING', 'idle');
    this.setCallout(`Simulation reset. Click <strong>▶ Run Simulation</strong> to begin.`, 'info');
  }
}



/* ─── File: js/ui/ladder-visualizer.js ─── */
/**
 * DEVNET — Space-Time Ladder Diagram Visualizer
 * Implements an animated textbook-style MSC (Message Sequence Chart) with:
 * - Vertical Sender/Receiver lifelines
 * - Animated diagonal arrows (data = solid, ACK = dashed)
 * - Sliding window buffer strips with brackets and pointers
 * - Mid-channel packet loss breaks
 * - Retransmission callout banners
 */
class LadderVisualizer {
  constructor(containerEl) {
    this.container = containerEl;
    this.windowSize = 4;
    this.totalFrames = 20;
    this.protocolType = 'gbn';
    this._arrowId = 0;
    this._initialized = false;
    this._stepsEl = null;
    this.clear();
  }

  clear() {
    this._initialized = false;
    this._stepsEl = null;
    this._arrowId = 0;
    this._init();

    // Initial ready state: show initial buffer strips and channel cue so window is never empty
    const readyRow = document.createElement('div');
    readyRow.className = 'ld-row ld-ready-row';
    const proto = this.protocolType;
    const winSize = this.windowSize;
    const leftHTML = this._bufferHTML(0, 0, winSize, 'S', 'sender', proto);
    const rightHTML = this._bufferHTML(0, 0, winSize, 'R', 'receiver', proto);

    readyRow.innerHTML = `
      <div class="ld-col-left">${leftHTML}</div>
      <div class="ld-col-center">
        <div class="ld-ready-cue">
          <span class="ld-ready-icon">⚡</span>
          <span>Physical Channel Ready · Click <strong>▶ Run Simulation</strong> to begin</span>
        </div>
      </div>
      <div class="ld-col-right">${rightHTML}</div>
    `;
    this._stepsEl.appendChild(readyRow);
  }

  _init() {
    if (this._initialized) return;
    this._initialized = true;
    this.container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'ld-wrap';

    // Header row
    const header = document.createElement('div');
    header.className = 'ld-header';
    header.innerHTML = `
      <div class="ld-hcol ld-hcol-left"><span class="ld-col-title ld-title-sender">Sender</span></div>
      <div class="ld-hcol ld-hcol-center"><span class="ld-channel-label">Physical Channel</span></div>
      <div class="ld-hcol ld-hcol-right"><span class="ld-col-title ld-title-receiver">Receiver</span></div>
    `;
    wrap.appendChild(header);

    // Steps container (grows downward, auto-scrolls)
    this._stepsEl = document.createElement('div');
    this._stepsEl.className = 'ld-steps';
    wrap.appendChild(this._stepsEl);

    // Time arrow footer
    const footer = document.createElement('div');
    footer.className = 'ld-footer';
    footer.innerHTML = `<div class="ld-time-arrow"><span>◄</span><span class="ld-time-line"></span><span class="ld-time-text">Time</span><span class="ld-time-line"></span><span>►</span></div>`;
    wrap.appendChild(footer);

    this.container.appendChild(wrap);
  }

  // ── Buffer Strip HTML ──
  _bufferHTML(base, activeSlot, winSize, pointerLabel, side, protoType) {
    const seqMod = (protoType === 'one-bit') ? 2 : Math.max(4, winSize * 2);
    const total = 7;
    const slots = [];
    for (let i = 0; i < total; i++) {
      const frameId = base - 1 + i;
      const seq = ((frameId % seqMod) + seqMod) % seqMod;
      const inWin = frameId >= base && frameId < base + winSize;
      const isPast = frameId < base;
      const isPtr = frameId === activeSlot;
      let cls = 'ld-slot';
      if (isPast) cls += ' ld-slot-past';
      else if (inWin) cls += ' ld-slot-win';
      slots.push(`
        <div class="${cls}">
          <span class="ld-slot-val">${seq}</span>
          ${isPtr ? `<div class="ld-slot-ptr"><span class="ld-ptr-line"></span><span class="ld-ptr-tag">${pointerLabel}</span></div>` : ''}
        </div>
      `);
    }
    const bracketPx = Math.min(winSize, 5) * 26;
    return `
      <div class="ld-buf ld-buf-${side}">
        <div class="ld-buf-slots">${slots.join('')}</div>
        <div class="ld-buf-bracket" style="width:${bracketPx}px;"></div>
      </div>
    `;
  }

  // ── Animated diagonal arrow SVG ──
  _arrowSVG(direction, isLost, isRetry, isDashed, label, ackLabel) {
    const id = ++this._arrowId;
    const markerId = `arrowMk${id}`;
    const pathId = `arrowPth${id}`;

    // direction: 'fwd' (sender→receiver, top-left → bottom-right)
    //            'rev' (receiver→sender, top-right → bottom-left)
    let x1, y1, x2, y2;
    const W = 400, H = 60;
    if (direction === 'fwd') {
      x1 = 2; y1 = 8; x2 = W - 2; y2 = H - 8;
    } else {
      x1 = W - 2; y1 = 8; x2 = 2; y2 = H - 8;
    }

    const pathLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const color = isLost ? '#FF3B30' : (isRetry ? '#FF9500' : (isDashed ? '#34C759' : '#0071E3'));
    const dashArray = isDashed ? '8,5' : 'none';

    // For lost frames, midpoint
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;

    // Arrow label position: midpoint
    const lx = (x1 + x2) / 2;
    const ly = (y1 + y2) / 2 - 6;

    let pathD, markerDef, animClass;

    if (isLost) {
      // Draw only to midpoint, then zigzag
      const zx1 = mx - 8, zy1 = my - 8;
      const zx2 = mx + 4, zy2 = my + 8;
      const zx3 = mx + 10, zy3 = my - 4;
      pathD = `M ${x1} ${y1} L ${mx} ${my}`;
      markerDef = '';
      animClass = 'ld-arrow-anim-half';
      return `
        <svg class="ld-arrow-svg ld-arrow-${direction}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <path id="${pathId}-1" d="${pathD}" fill="none" stroke="${color}" stroke-width="2" class="${animClass}" style="--pathlen:${pathLen / 2}"/>
          <polyline points="${zx1},${zy1} ${zx2},${zy2} ${zx3},${zy3}" fill="none" stroke="${color}" stroke-width="2.5" style="opacity:0;animation:ldFadeIn 0.3s 0.7s forwards"/>
          <text x="${lx}" y="${ly - 4}" class="ld-arrow-label" fill="${color}" text-anchor="middle" font-size="10">${label}</text>
          <text x="${mx + 18}" y="${my + 4}" class="ld-arrow-label" fill="${color}" text-anchor="start" font-size="10" style="opacity:0;animation:ldFadeIn 0.3s 0.7s forwards">&#x2715; Lost</text>
        </svg>
      `;
    } else {
      pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
      markerDef = `
        <defs>
          <marker id="${markerId}" markerWidth="7" markerHeight="7" refX="${direction === 'fwd' ? 5 : 2}" refY="3.5" orient="auto">
            <polygon points="${direction === 'fwd' ? '0 0, 7 3.5, 0 7' : '7 0, 0 3.5, 7 7'}" fill="${color}"/>
          </marker>
        </defs>
      `;
      return `
        <svg class="ld-arrow-svg ld-arrow-${direction}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          ${markerDef}
          <path id="${pathId}" d="${pathD}" fill="none" stroke="${color}" stroke-width="${isDashed ? 1.5 : 2}" stroke-dasharray="${dashArray}" marker-end="url(#${markerId})" class="ld-arrow-anim-full" style="--pathlen:${pathLen}"/>
          <text x="${lx}" y="${ly}" class="ld-arrow-label" fill="${color}" text-anchor="middle" font-size="10.5" style="opacity:0;animation:ldFadeIn 0.3s 0.6s forwards">${label}</text>
        </svg>
      `;
    }
  }

  _addRow(leftHTML, arrowHTML, rightHTML, extraClass = '') {
    const row = document.createElement('div');
    row.className = `ld-row ${extraClass}`;
    row.innerHTML = `
      <div class="ld-col-left">${leftHTML}</div>
      <div class="ld-col-center">${arrowHTML}</div>
      <div class="ld-col-right">${rightHTML}</div>
    `;
    row.style.opacity = '0';
    this._stepsEl.appendChild(row);
    requestAnimationFrame(() => {
      row.style.transition = 'opacity 0.3s ease';
      row.style.opacity = '1';
    });
    // Auto-scroll
    this.container.scrollTop = this.container.scrollHeight;
  }

  addFrameTx(txData, snapshot) {
    this._init();
    const readyEl = this._stepsEl ? this._stepsEl.querySelector('.ld-ready-row') : null;
    if (readyEl) readyEl.remove();

    const proto = this.protocolType;
    const winSize = snapshot?.windowSize ?? (proto === 'one-bit' ? 1 : this.windowSize);
    const sendBase = snapshot?.sendBase ?? txData.frameId;
    const frameLabel = txData.isRetry ? `Frame ${txData.frameId} (Resent)` : `Frame ${txData.frameId}`;
    const leftHTML = this._bufferHTML(sendBase, txData.frameId, winSize, 'S', 'sender', proto);
    const arrowHTML = this._arrowSVG('fwd', txData.isLost, txData.isRetry, false, frameLabel, null);
    let rightHTML;
    if (txData.isLost) {
      rightHTML = `<div class="ld-buf-empty"></div>`;
    } else {
      const recvBase = snapshot?.recvBase ?? snapshot?.expectedSeq ?? txData.frameId;
      rightHTML = this._bufferHTML(recvBase, txData.frameId, winSize, 'R', 'receiver', proto);
    }
    this._addRow(leftHTML, arrowHTML, rightHTML, txData.isLost ? 'ld-row-lost' : (txData.isRetry ? 'ld-row-retry' : 'ld-row-ok'));
  }

  addAckTx(rxData, snapshot) {
    this._init();
    const proto = this.protocolType;
    const winSize = snapshot?.windowSize ?? (proto === 'one-bit' ? 1 : this.windowSize);
    const recvBase = snapshot?.recvBase ?? snapshot?.expectedSeq ?? rxData.ackSeq;
    const ackLabel = rxData.ackLost ? `NAK ${rxData.ackSeq}` : `ACK ${rxData.ackSeq}`;
    const rightHTML = this._bufferHTML(recvBase, rxData.ackSeq, winSize, 'R', 'receiver', proto);
    const arrowHTML = this._arrowSVG('rev', rxData.ackLost, false, true, ackLabel, null);
    let leftHTML;
    if (rxData.ackLost) {
      leftHTML = `<div class="ld-buf-empty"></div>`;
    } else {
      const sendBase = snapshot?.sendBase ?? rxData.ackSeq;
      leftHTML = this._bufferHTML(sendBase, rxData.ackSeq, winSize, 'S', 'sender', proto);
    }
    this._addRow(leftHTML, arrowHTML, rightHTML, rxData.ackLost ? 'ld-row-lost' : 'ld-row-ack');
  }

  addTimeoutCallout(protoType, frameId, framesToRetransmit) {
    this._init();
    const banner = document.createElement('div');
    banner.className = 'ld-callout';
    let actionHTML = '';
    if (protoType === 'gbn') {
      const list = framesToRetransmit?.length > 0 ? framesToRetransmit.join(' \u2192 ') : `${frameId}`;
      actionHTML = `
        <span class="ld-callout-proto">Go-Back-N</span>
        <span class="ld-callout-loss">Frame ${frameId} LOST</span>
        <span class="ld-callout-arrow-down">\u2193</span>
        <span class="ld-callout-retx">Retransmit: <strong>${list}</strong></span>
      `;
    } else if (protoType === 'sr') {
      actionHTML = `
        <span class="ld-callout-proto">Selective Repeat</span>
        <span class="ld-callout-loss">Frame ${frameId} LOST</span>
        <span class="ld-callout-arrow-down">\u2193</span>
        <span class="ld-callout-retx">Retransmit: <strong>Frame ${frameId} only</strong> (others buffered)</span>
      `;
    } else {
      actionHTML = `
        <span class="ld-callout-proto">One-Bit Stop-and-Wait</span>
        <span class="ld-callout-loss">Frame ${frameId} LOST</span>
        <span class="ld-callout-arrow-down">\u2193</span>
        <span class="ld-callout-retx">Retransmit: <strong>Frame ${frameId} only</strong></span>
      `;
    }
    banner.innerHTML = actionHTML;
    banner.style.opacity = '0';
    this._stepsEl.appendChild(banner);
    requestAnimationFrame(() => {
      banner.style.transition = 'opacity 0.3s ease';
      banner.style.opacity = '1';
    });
    this.container.scrollTop = this.container.scrollHeight;
  }
}


/* ─── File: js/app.js ─── */
/**
 * DEVNET — app.js (Interactive Protocol Simulator Orchestrator)
 * Connects the configuration panel, the Fixed-Stage visualizer, the Space-Time ladder,
 * discrete event simulation engine, and multi-protocol performance benchmarks.
 */








/* ══════════════════════════════════════════════════════════════════
   COMPARISON RUNNER (Headless Simulation for all 3 protocols)
══════════════════════════════════════════════════════════════════ */

function runHeadless(protocolType, config) {
  return new Promise(resolve => {
    const cfg = {
      ...config,
      protocolType,
      deterministic: true,
      randomSeed: 42
    };

    const core = new SimulationCore(cfg);
    let metrics = null;

    core.onFinished = (m) => { metrics = m; };

    core.state = 'IDLE';
    core.simTime = 0;
    core.queue.clear();
    core.prng.reset();
    core.protocol = core._createProtocolInstance();
    core.state = 'RUNNING';
    core.protocol.metrics.startTime = 0;
    core._handleTransmitWindow();

    let safetyLimit = 200000;
    while (!core.queue.isEmpty() && core.state === 'RUNNING' && safetyLimit-- > 0) {
      const event = core.queue.pop();
      if (event) {
        core.simTime = event.time;
        core._processEvent(event);
        if (core.protocol.isComplete) {
          core._finishSimulation();
          break;
        }
      }
    }

    if (!metrics && core.protocol) {
      core.protocol.finalizeMetrics(core.simTime);
      metrics = core.protocol.metrics;
    }

    resolve(metrics);
  });
}

/* ══════════════════════════════════════════════════════════════════
   MAIN APPLICATION ORCHESTRATION
══════════════════════════════════════════════════════════════════ */

// ── DOM References ──
const protocolSelect = document.getElementById('protocol-select');
const windowSlider   = document.getElementById('window-slider');
const windowVal      = document.getElementById('window-val');
const windowGroup    = document.getElementById('window-group');
const framesSlider   = document.getElementById('frames-slider');
const framesVal      = document.getElementById('frames-val');
const pktlossSlider  = document.getElementById('pktloss-slider');
const pktlossVal     = document.getElementById('pktloss-val');
const acklossSlider  = document.getElementById('ackloss-slider');
const acklossVal     = document.getElementById('ackloss-val');
const timeoutSlider  = document.getElementById('timeout-slider');
const timeoutVal     = document.getElementById('timeout-val');
const txdelaySlider  = document.getElementById('txdelay-slider');
const txdelayVal     = document.getElementById('txdelay-val');
const speedPills     = document.querySelectorAll('.speed-pill');
const runBtn         = document.getElementById('run-btn');
const stepBtn        = document.getElementById('step-btn');
const resetBtn       = document.getElementById('reset-btn');
const compareBtn     = document.getElementById('compare-btn');

const caseSelect     = document.getElementById('case-select');
const caseBriefDesc  = document.getElementById('case-brief-desc');

const stageViewportEl  = document.getElementById('stage-viewport');
const ladderViewportEl = document.getElementById('ladder-viewport');
const stageTabBtn      = document.getElementById('stage-tab-btn');
const ladderTabBtn     = document.getElementById('ladder-tab-btn');
const protocolBadge    = document.getElementById('protocol-badge');
const simStateEl       = document.getElementById('sim-state');

const metricsReportEl = document.getElementById('metrics-report');
const metricsGridEl   = document.getElementById('metrics-grid');
const metricsIdleEl   = document.getElementById('metrics-idle');
const eventFeedList   = document.getElementById('event-feed-list');
const feedStatusBadgeEl = document.getElementById('feed-status-badge');

const compSection      = document.getElementById('comparison-section');
const compTbody        = document.getElementById('comparison-tbody');
const compAsciiBody    = document.getElementById('comparison-ascii-body');

// ── Visualizer Instances ──
let stage = null;
let ladder = null;
if (stageViewportEl) stage = new StageVisualizer(stageViewportEl);
if (ladderViewportEl) ladder = new LadderVisualizer(ladderViewportEl);

let core = null;
let currentSpeed = 0.5; // Default slow speed as requested by user

// ── View Switcher: Fixed Stage vs Ladder Diagram ──
if (stageTabBtn && ladderTabBtn) {
  stageTabBtn.addEventListener('click', () => {
    stageTabBtn.classList.add('active');
    ladderTabBtn.classList.remove('active');
    if (stageViewportEl) stageViewportEl.style.display = '';
    if (ladderViewportEl) ladderViewportEl.style.display = 'none';
  });

  ladderTabBtn.addEventListener('click', () => {
    ladderTabBtn.classList.add('active');
    stageTabBtn.classList.remove('active');
    if (stageViewportEl) stageViewportEl.style.display = 'none';
    if (ladderViewportEl) ladderViewportEl.style.display = '';
  });
}

// ── Slider Sync ──
function syncSliders() {
  if (windowVal)   windowVal.textContent   = windowSlider.value;
  if (framesVal)   framesVal.textContent   = framesSlider.value;
  if (pktlossVal)  pktlossVal.textContent  = pktlossSlider.value + '%';
  if (acklossVal)  acklossVal.textContent  = acklossSlider.value + '%';
  if (timeoutVal)  timeoutVal.textContent  = timeoutSlider.value + 'ms';
  if (txdelayVal)  txdelayVal.textContent  = txdelaySlider.value + 'ms';
}

[windowSlider, framesSlider, pktlossSlider, acklossSlider, timeoutSlider, txdelaySlider]
  .filter(Boolean)
  .forEach(s => s.addEventListener('input', syncSliders));

// ── Operational Cases Data (Textbook Standard Cases) ──
const PROTOCOL_CASES = {
  'one-bit': [
    {
      id: 'normal',
      num: 1,
      name: 'Normal Operation',
      tagline: 'Alternating 0/1 sequence numbers without loss',
      desc: 'Frame 0 sent &rarr; ACK 1 received &rarr; Frame 1 sent. Alternating sequence bits (0/1) without channel loss or timeouts.',
      config: { window: 1, frames: 8, pktLoss: 0, ackLoss: 0, timeout: 300, txDelay: 100, seed: 100 }
    },
    {
      id: 'frame-lost',
      num: 2,
      name: 'The Frame is Lost',
      tagline: 'Timeout & automatic sender retransmission',
      desc: 'Frame is dropped by the physical link. Sender timer expires and automatically triggers a retransmission of the lost frame.',
      config: { window: 1, frames: 8, pktLoss: 30, ackLoss: 0, timeout: 300, txDelay: 100, seed: 42 }
    },
    {
      id: 'ack-lost',
      num: 3,
      name: 'The ACK is Lost',
      tagline: 'Duplicate sequence detection & re-ACK',
      desc: 'Frame delivered, but ACK lost in transit. Sender times out; receiver detects duplicate sequence, discards data, and re-sends ACK.',
      config: { window: 1, frames: 8, pktLoss: 0, ackLoss: 40, timeout: 300, txDelay: 100, seed: 77 }
    },
    {
      id: 'ack-delayed',
      num: 4,
      name: 'The ACK is Delayed',
      tagline: 'Premature timeout & late ACK handling',
      desc: 'Channel delay exceeds sender timeout. Sender prematurely retransmits; delayed ACK arrives later and duplicate is safely absorbed.',
      config: { window: 1, frames: 8, pktLoss: 0, ackLoss: 0, timeout: 180, txDelay: 140, seed: 50 }
    }
  ],
  'gbn': [
    {
      id: 'normal',
      num: 1,
      name: 'Normal Operation',
      tagline: 'Continuous pipelining with cumulative ACKs',
      desc: 'Sender transmits window of N frames continuously without pausing. Cumulative ACKs smoothly advance the sliding window.',
      config: { window: 4, frames: 12, pktLoss: 0, ackLoss: 0, timeout: 350, txDelay: 90, seed: 100 }
    },
    {
      id: 'frame-lost',
      num: 2,
      name: 'The Frame is Lost',
      tagline: 'Out-of-order discard & window rollback',
      desc: 'Frame 1 lost. Receiver discards subsequent out-of-order frames (2, 3), repeating ACK 0. Sender times out on 1 and rolls back to retransmit window.',
      config: { window: 4, frames: 12, pktLoss: 25, ackLoss: 0, timeout: 300, txDelay: 100, seed: 42 }
    },
    {
      id: 'ack-lost',
      num: 3,
      name: 'The ACK is Lost',
      tagline: 'Cumulative ACK loss absorption',
      desc: 'ACK for Frame 0 lost, but cumulative ACK 1 arrives safely. Cumulative nature absorbs losses without triggering rollback.',
      config: { window: 4, frames: 12, pktLoss: 0, ackLoss: 35, timeout: 380, txDelay: 100, seed: 65 }
    },
    {
      id: 'ack-delayed',
      num: 4,
      name: 'Delayed ACK & Timeout',
      tagline: 'Full window retransmission penalty',
      desc: 'High channel delay causes base frame timer expiry. Sender rolls back and retransmits all unacknowledged frames in window.',
      config: { window: 4, frames: 12, pktLoss: 0, ackLoss: 0, timeout: 220, txDelay: 140, seed: 50 }
    }
  ],
  'sr': [
    {
      id: 'normal',
      num: 1,
      name: 'Normal Operation',
      tagline: 'Independent sliding windows & individual ACKs',
      desc: 'Sender pipelines N frames; receiver acknowledges each individually. Windows advance independently as frames arrive.',
      config: { window: 4, frames: 12, pktLoss: 0, ackLoss: 0, timeout: 350, txDelay: 90, seed: 100 }
    },
    {
      id: 'frame-lost',
      num: 2,
      name: 'The Frame is Lost',
      tagline: 'Out-of-order receiver buffering & selective retransmit',
      desc: 'Frame 1 lost. Receiver buffers frames 2 and 3 into window. Sender retransmits ONLY lost frame 1, avoiding redundant retransmission.',
      config: { window: 4, frames: 12, pktLoss: 25, ackLoss: 0, timeout: 300, txDelay: 100, seed: 42 }
    },
    {
      id: 'ack-lost',
      num: 3,
      name: 'The ACK is Lost',
      tagline: 'Isolated single-frame timer retransmission',
      desc: 'Individual ACK 1 lost. Only Frame 1 timer expires; sender selectively retransmits it without re-sending already-ACKed frames.',
      config: { window: 4, frames: 12, pktLoss: 0, ackLoss: 35, timeout: 320, txDelay: 100, seed: 88 }
    },
    {
      id: 'window-constraint',
      num: 4,
      name: 'Window Size Constraint',
      tagline: 'Max window size W ≤ 2^(m-1)',
      desc: 'Demonstrates why Selective Repeat window cannot exceed half sequence space to prevent sequence overlap ambiguity under ACK loss.',
      config: { window: 4, frames: 12, pktLoss: 15, ackLoss: 15, timeout: 300, txDelay: 100, seed: 21 }
    }
  ]
};

let activeCaseSeed = null;

function populateCaseSelector(proto) {
  if (!caseSelect) return;
  const cases = PROTOCOL_CASES[proto] || PROTOCOL_CASES['gbn'];
  caseSelect.innerHTML = cases.map(c => `
    <option value="${c.id}">Case ${c.num}: ${c.name}</option>
  `).join('');
  applyCase(proto, cases[0].id, false);
}

function applyCase(proto, caseId, notify = true) {
  const cases = PROTOCOL_CASES[proto] || PROTOCOL_CASES['gbn'];
  const c = cases.find(item => item.id === caseId) || cases[0];
  if (!c) return;

  if (protocolSelect && protocolSelect.value !== proto) {
    protocolSelect.value = proto;
    const isOneBit = proto === 'one-bit';
    if (windowGroup) windowGroup.style.opacity = isOneBit ? '0.4' : '1';
    if (windowSlider) windowSlider.disabled = isOneBit;
    if (stage) stage.protocolType = proto;
    if (ladder) ladder.protocolType = proto;
    populateCaseSelector(proto);
  }

  if (caseSelect && caseSelect.value !== c.id) {
    caseSelect.value = c.id;
  }

  if (caseBriefDesc) caseBriefDesc.innerHTML = c.desc;

  if (windowSlider && proto !== 'one-bit') {
    windowSlider.value = c.config.window;
  } else if (windowSlider && proto === 'one-bit') {
    windowSlider.value = 1;
  }
  if (framesSlider)  framesSlider.value  = c.config.frames;
  if (pktlossSlider) pktlossSlider.value = c.config.pktLoss;
  if (acklossSlider) acklossSlider.value = c.config.ackLoss;
  if (timeoutSlider) timeoutSlider.value = c.config.timeout;
  if (txdelaySlider) txdelaySlider.value = c.config.txDelay;
  activeCaseSeed = c.config.seed;
  syncSliders();
  updateBadge();

  if (core) core.stop();
  if (stage) {
    stage.protocolType = proto;
    stage.windowSize = proto === 'one-bit' ? 1 : parseInt(windowSlider.value);
    stage.clear();
  }
  if (ladder) {
    ladder.protocolType = proto;
    ladder.clear();
  }
  setSimState('idle');
  core = null;
  if (runBtn) runBtn.textContent = 'Run Simulation';

  if (notify) {
    logFeedItem(`Loaded Case ${c.num}: ${c.name} (${proto.toUpperCase()})`, 'info');
  }
}

if (caseSelect) {
  caseSelect.addEventListener('change', () => {
    const proto = protocolSelect ? protocolSelect.value : 'gbn';
    applyCase(proto, caseSelect.value, true);
  });
}

if (protocolSelect) {
  protocolSelect.addEventListener('change', () => {
    const isOneBit = protocolSelect.value === 'one-bit';
    if (windowGroup) windowGroup.style.opacity = isOneBit ? '0.4' : '1';
    if (windowSlider) {
      windowSlider.disabled = isOneBit;
      if (isOneBit) { windowSlider.value = 1; if (windowVal) windowVal.textContent = '1'; }
    }
    if (stage) {
      stage.protocolType = protocolSelect.value;
      stage.windowSize = isOneBit ? 1 : parseInt(windowSlider.value);
      stage.renderInitialStage();
    }
    if (ladder) ladder.protocolType = protocolSelect.value;
    populateCaseSelector(protocolSelect.value);
    updateBadge();
  });
}

// ── Protocol Card Tabs & "Simulate Case" Handlers ──
document.querySelectorAll('.proto-tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const card = btn.closest('.proto-info-card');
    if (!card) return;
    const targetId = btn.dataset.target;
    card.querySelectorAll('.proto-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    card.querySelectorAll('.proto-tab-pane').forEach(pane => {
      pane.style.display = (pane.id === targetId) ? '' : 'none';
    });
  });
});

document.querySelectorAll('.btn-case-run').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const proto = btn.dataset.proto;
    const caseId = btn.dataset.case;
    applyCase(proto, caseId, true);
    const mainViewport = document.querySelector('.main-viewport-tile');
    if (mainViewport) {
      mainViewport.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── Speed Pills (0.5x Slow, 1x Normal, 2x Fast) ──
speedPills.forEach(pill => {
  pill.addEventListener('click', () => {
    speedPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentSpeed = Number(pill.dataset.speed) || 0.5;
    if (core) core.setSpeed(currentSpeed);
    if (stage) stage.setSpeed(currentSpeed);
  });
});

// ── Badge & State ──
function updateBadge() {
  if (!protocolBadge || !protocolSelect) return;
  const proto = protocolSelect.options[protocolSelect.selectedIndex].text.split('(')[0].trim();
  const win   = protocolSelect.value === 'one-bit' ? 1 : windowSlider.value;
  const frames = framesSlider ? framesSlider.value : 20;
  protocolBadge.textContent = `${proto} · Window: ${win} · ${frames} frames`;
}
updateBadge();
if (windowSlider) windowSlider.addEventListener('input', updateBadge);
if (framesSlider) framesSlider.addEventListener('input', updateBadge);

function setSimState(s) {
  if (simStateEl) {
    simStateEl.textContent = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    simStateEl.className = 'sim-state ' + s.toLowerCase();
  }
  if (feedStatusBadgeEl) {
    if (s === 'running') {
      feedStatusBadgeEl.style.display = 'inline-block';
      feedStatusBadgeEl.textContent = 'Live';
      feedStatusBadgeEl.className = 'feed-status-badge running';
    } else if (s === 'paused') {
      feedStatusBadgeEl.style.display = 'inline-block';
      feedStatusBadgeEl.textContent = 'Paused';
      feedStatusBadgeEl.className = 'feed-status-badge paused';
    } else if (s === 'finished') {
      feedStatusBadgeEl.style.display = 'inline-block';
      feedStatusBadgeEl.textContent = 'Complete';
      feedStatusBadgeEl.className = 'feed-status-badge finished';
    } else {
      feedStatusBadgeEl.style.display = 'none';
      feedStatusBadgeEl.textContent = '';
    }
  }
}

// ── Event Feed Logger (Fixed, does not expand screen) ──
function logFeedItem(text, type = 'info') {
  if (!eventFeedList) return;
  const li = document.createElement('li');
  li.className = `feed-item feed-${type}`;
  const timeStr = core ? `${Math.round(core.simTime)}ms` : '0ms';
  li.innerHTML = `<span class="feed-time">[${timeStr}]</span> <span class="feed-text">${text}</span>`;
  eventFeedList.insertBefore(li, eventFeedList.firstChild);

  // Keep only the last 6 items so layout stays fixed
  while (eventFeedList.children.length > 6) {
    eventFeedList.removeChild(eventFeedList.lastChild);
  }
}

// ── Build Config from Form ──
function getConfig() {
  return {
    protocolType:  protocolSelect ? protocolSelect.value : 'gbn',
    windowSize:    windowSlider ? parseInt(windowSlider.value) : 4,
    totalFrames:   framesSlider ? parseInt(framesSlider.value) : 20,
    pktLossProb:   pktlossSlider ? parseInt(pktlossSlider.value) / 100 : 0.1,
    ackLossProb:   acklossSlider ? parseInt(acklossSlider.value) / 100 : 0.05,
    timeout:       timeoutSlider ? parseInt(timeoutSlider.value) : 300,
    txDelay:       txdelaySlider ? parseInt(txdelaySlider.value) : 100,
    ackDelay:      txdelaySlider ? Math.round(parseInt(txdelaySlider.value) * 0.5) : 50,
    deterministic: true,
    randomSeed:    activeCaseSeed !== null ? activeCaseSeed : 42
  };
}

// ── Post-Simulation Metrics Display ──
function displayMetricsReport(metrics) {
  if (!metricsReportEl || !metricsGridEl) return;
  if (metricsIdleEl) metricsIdleEl.style.display = 'none';
  metricsReportEl.style.display = 'flex';

  const total = metrics.totalFramesTx || 1;
  const delivPct = Math.min(100, Math.round(((metrics.acksReceived || 0) / total) * 100));
  const retxPct = Math.min(100, Math.round(((metrics.retransmissions || 0) / total) * 100));
  const lostPct = Math.max(0, 100 - delivPct - retxPct);

  metricsGridEl.innerHTML = `
    <div class="metrics-hero-card">
      <div class="mhero-top">
        <span class="mhero-label">Efficiency</span>
        <span class="mhero-badge ${metrics.efficiency >= 80 ? 'good' : 'warn'}">${metrics.efficiency}%</span>
      </div>
      <div class="mhero-val-row">
        <span class="mhero-val">${metrics.throughput}</span>
        <span class="mhero-unit">fps throughput</span>
      </div>
      <div class="mhero-sub">${metrics.totalDuration} ms elapsed · ${metrics.totalFramesTx} frames transmitted</div>
    </div>

    <div class="metrics-channel-card">
      <div class="mcard-header">
        <span class="mcard-title">Transmission Breakdown</span>
        <span class="mcard-sub">${metrics.acksReceived} ACKed</span>
      </div>
      <div class="summary-progress-bar">
        <div class="prog-segment seg-delivered" style="width: ${delivPct}%" title="Delivered: ${metrics.acksReceived}"></div>
        <div class="prog-segment seg-retry" style="width: ${retxPct}%" title="Retransmitted: ${metrics.retransmissions}"></div>
        <div class="prog-segment seg-lost" style="width: ${lostPct}%" title="Lost: ${metrics.packetsLost}"></div>
      </div>
      <div class="bar-legend">
        <span class="leg-item leg-delivered"><span class="leg-dot dot-delivered"></span>${metrics.acksReceived} Delivered</span>
        <span class="leg-item leg-retry"><span class="leg-dot dot-retry"></span>${metrics.retransmissions} Retx</span>
        <span class="leg-item leg-lost"><span class="leg-dot dot-lost"></span>${metrics.packetsLost} Lost</span>
      </div>
    </div>

    <div class="metrics-stats-grid">
      <div class="mstat-tile">
        <span class="mstat-num">${metrics.uniqueDelivered}</span>
        <span class="mstat-name">Delivered</span>
      </div>
      <div class="mstat-tile">
        <span class="mstat-num">${metrics.retransmissions}</span>
        <span class="mstat-name">Retries</span>
      </div>
      <div class="mstat-tile">
        <span class="mstat-num">${metrics.timeoutsTriggered || 0}</span>
        <span class="mstat-name">Timeouts</span>
      </div>
      <div class="mstat-tile">
        <span class="mstat-num">${metrics.acksLost || 0}</span>
        <span class="mstat-name">ACK Drops</span>
      </div>
    </div>
  `;
}

// ── Initialize Simulation Instance ──
function initCore() {
  const cfg = getConfig();
  if (stage) {
    stage.protocolType = cfg.protocolType;
    stage.windowSize = cfg.windowSize;
    stage.totalFrames = cfg.totalFrames;
    stage.setSpeed(currentSpeed);
  }
  if (ladder) {
    ladder.protocolType = cfg.protocolType;
    ladder.windowSize = cfg.windowSize;
    ladder.totalFrames = cfg.totalFrames;
  }

  core = new SimulationCore(cfg);
  core.setSpeed(currentSpeed);

  core.onLogMessage = (entry) => {
    if (entry.type === 'TIMEOUT') {
      const data = entry.data || {};
      const fId = data.frameId ?? entry.message.match(/Frame (\d+)/)?.[1] ?? '?';
      if (stage) stage.showTimeoutAlert(cfg.protocolType, fId, data.framesToRetransmit);
      if (ladder) ladder.addTimeoutCallout(cfg.protocolType, fId, data.framesToRetransmit);
      logFeedItem(`Timeout on Frame ${fId}! Retransmitting.`, 'timeout');
    } else if (entry.type === 'LOSS') {
      logFeedItem(entry.message, 'loss');
    } else if (entry.type === 'DROP') {
      logFeedItem(entry.message, 'loss');
    }
  };

  core.onEventProcessed = (ev) => {
    const snap = core.protocol ? core.protocol.getStateSnapshot() : null;
    if (ev.type === 'FRAME_TX') {
      if (stage) stage.animateFrameTransmission(ev.payload, snap);
      if (ladder) ladder.addFrameTx(ev.payload, snap);
      logFeedItem(`Frame ${ev.payload.frameId} sent ${ev.payload.isRetry ? '(Resend)' : ''}${ev.payload.isLost ? ' — [Loss]' : ''}`, ev.payload.isLost ? 'loss' : 'transmit');
    } else if (ev.type === 'ACK_TX') {
      if (stage) stage.animateAckTransmission(ev.payload, snap);
      if (ladder) ladder.addAckTx(ev.payload, snap);
      logFeedItem(`Receiver sent ACK ${ev.payload.ackSeq}${ev.payload.ackLost ? ' — [ACK Loss]' : ''}`, ev.payload.ackLost ? 'loss' : 'success');
    }
  };

  core.onFinished = (metrics) => {
    setSimState('finished');
    if (runBtn) runBtn.textContent = 'Run Simulation';
    if (stage) stage.showSimulationComplete(metrics);
    displayMetricsReport(metrics);
    logFeedItem(`Simulation finished successfully!`, 'success');
  };
}

// ── Run / Pause / Resume Button ──
if (runBtn) {
  runBtn.addEventListener('click', () => {
    if (core && core.state === 'RUNNING') {
      core.pause();
      if (stage) stage.stopTimer();
      runBtn.textContent = 'Resume';
      setSimState('paused');
      logFeedItem('Simulation paused by user', 'info');
      return;
    }

    if (core && core.state === 'PAUSED') {
      core.start();
      runBtn.textContent = 'Pause';
      setSimState('running');
      logFeedItem('Simulation resumed', 'info');
      return;
    }

    // Fresh Start
    if (stage) stage.clear();
    if (ladder) ladder.clear();
    if (eventFeedList) eventFeedList.innerHTML = '';
    if (metricsReportEl) metricsReportEl.style.display = 'none';
    if (metricsIdleEl) metricsIdleEl.style.display = '';

    initCore();
    core.start();
    runBtn.textContent = 'Pause';
    setSimState('running');
    logFeedItem('Simulation started', 'info');
    updateBadge();
  });
}

// ── Step Forward Button ──
if (stepBtn) {
  stepBtn.addEventListener('click', () => {
    if (!core || core.state === 'FINISHED') {
      if (stage) stage.clear();
      if (ladder) ladder.clear();
      initCore();
      core.step();
      setSimState('paused');
      if (runBtn) runBtn.textContent = 'Resume';
      return;
    }

    if (core.state === 'RUNNING') {
      core.pause();
    }

    core.step();
    setSimState('paused');
    if (runBtn) runBtn.textContent = 'Resume';
  });
}

// ── Reset Button ──
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    if (core) core.stop();
    if (stage) stage.clear();
    if (ladder) ladder.clear();
    if (eventFeedList) eventFeedList.innerHTML = '';
    if (metricsReportEl) metricsReportEl.style.display = 'none';
    if (metricsIdleEl) metricsIdleEl.style.display = '';
    if (runBtn) runBtn.textContent = 'Run Simulation';
    setSimState('idle');
    core = null;
    logFeedItem('Simulator reset to initial state', 'info');
  });
}

// ── Compare All 3 Protocols Button ──
if (compareBtn) {
  compareBtn.addEventListener('click', async () => {
    compareBtn.disabled = true;
    compareBtn.textContent = 'Running Benchmark…';

    const cfg = getConfig();
    const cfgNoProto = { ...cfg };
    delete cfgNoProto.protocolType;

    const currentWin = parseInt(windowSlider ? windowSlider.value : 4);
    const benchmarkWin = currentWin > 1 ? currentWin : 4;

    try {
      const [mOneBit, mGbn, mSr] = await Promise.all([
        runHeadless('one-bit', { ...cfgNoProto, windowSize: 1 }),
        runHeadless('gbn',     { ...cfgNoProto, windowSize: benchmarkWin }),
        runHeadless('sr',      { ...cfgNoProto, windowSize: benchmarkWin })
      ]);

      renderComparison(mOneBit, mGbn, mSr);
      if (compSection) {
        compSection.classList.remove('hidden');
        compSection.style.display = '';
        // Smooth scroll to comparison tile in page
        setTimeout(() => {
          compSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }
    } catch (e) {
      console.error('Comparison failed:', e);
    }

    compareBtn.disabled = false;
    compareBtn.innerHTML = 'Compare All Three Protocols &rarr;';
  });
}

function renderComparison(ob, gbn, sr) {
  // 1. Exact user-formatted text comparison output
  if (compAsciiBody) {
    compAsciiBody.textContent = [
      'PROTOCOL COMPARISON',
      `One-Bit SW: Retransmissions: ${ob.retransmissions}`,
      `Go-Back-N : Retransmissions: ${gbn.retransmissions}`,
      `Selective Repeat: Retransmissions: ${sr.retransmissions}`,
      '',
      'Throughput:',
      `One-Bit SW : ${ob.throughput} fps (${ob.efficiency}%)`,
      `Go-Back-N : ${gbn.throughput} fps (${gbn.efficiency}%)`,
      `Selective Repeat: ${sr.throughput} fps (${sr.efficiency}%)`,
      '',
      'Total frames transmitted:',
      `One-Bit SW : ${ob.totalFramesTx} frames`,
      `Go-Back-N  : ${gbn.totalFramesTx} frames`,
      `Selective Repeat : ${sr.totalFramesTx} frames`,
      '',
      'Packets lost:',
      `One-Bit SW : ${ob.packetsLost} packets`,
      `Go-Back-N  : ${gbn.packetsLost} packets`,
      `Selective Repeat : ${sr.packetsLost} packets`,
      '',
      'ACKs received:',
      `One-Bit SW : ${ob.acksReceived} ACKs`,
      `Go-Back-N  : ${gbn.acksReceived} ACKs`,
      `Selective Repeat : ${sr.acksReceived} ACKs`,
      '',
      'Total transmission time:',
      `One-Bit SW : ${ob.totalDuration} ms`,
      `Go-Back-N  : ${gbn.totalDuration} ms`,
      `Selective Repeat : ${sr.totalDuration} ms`
    ].join('\n');
  }

  // 2. Structured HTML Table with Medals & Badges
  if (compTbody) {
    const fmt = (v, decimals = 1) => v != null ? Number(v).toFixed(decimals) : '—';
    const pct = (v) => v != null ? Number(v).toFixed(1) + '%' : '—';

    const rows = [
      {
        label: 'Retransmissions',
        badge: 'Lower is better',
        vals: [ob?.retransmissions, gbn?.retransmissions, sr?.retransmissions],
        bestValFn: (vals) => Math.min(...vals.filter(v => v != null)),
        fmt: (v) => String(v ?? '—')
      },
      {
        label: 'Throughput',
        badge: 'Higher is better',
        vals: [ob?.throughput, gbn?.throughput, sr?.throughput],
        bestValFn: (vals) => Math.max(...vals.filter(v => v != null)),
        fmt: (v) => v != null ? `${fmt(v)} fps` : '—'
      },
      {
        label: 'Link Efficiency',
        badge: 'Higher is better',
        vals: [ob?.efficiency, gbn?.efficiency, sr?.efficiency],
        bestValFn: (vals) => Math.max(...vals.filter(v => v != null)),
        fmt: pct
      },
      {
        label: 'Packets Lost',
        badge: 'Lower is better',
        vals: [ob?.packetsLost, gbn?.packetsLost, sr?.packetsLost],
        bestValFn: (vals) => Math.min(...vals.filter(v => v != null)),
        fmt: (v) => String(v ?? '—')
      },
      {
        label: 'ACKs Received',
        badge: 'Higher is better',
        vals: [ob?.acksReceived, gbn?.acksReceived, sr?.acksReceived],
        bestValFn: (vals) => Math.max(...vals.filter(v => v != null)),
        fmt: (v) => String(v ?? '—')
      },
      {
        label: 'Total Frames Sent',
        badge: 'Lower is better',
        vals: [ob?.totalFramesTx, gbn?.totalFramesTx, sr?.totalFramesTx],
        bestValFn: (vals) => Math.min(...vals.filter(v => v != null)),
        fmt: (v) => String(v ?? '—')
      },
      {
        label: 'Total Duration',
        badge: 'Faster is better',
        vals: [ob?.totalDuration, gbn?.totalDuration, sr?.totalDuration],
        bestValFn: (vals) => Math.min(...vals.filter(v => v != null)),
        fmt: (v) => v != null ? `${Math.round(v)} ms` : '—'
      }
    ];

    compTbody.innerHTML = rows.map(row => {
      const bestVal = row.bestValFn(row.vals);
      return `<tr>
        <td class="metric-cell">
          <div class="metric-info">
            <span class="metric-name">${row.label}</span>
            <span class="metric-badge">${row.badge}</span>
          </div>
        </td>
        ${row.vals.map((v) => {
          const isBest = v != null && v === bestVal;
          return `<td class="${isBest ? 'best' : ''}">${isBest ? `<span class="best-tag">${row.fmt(v)}</span>` : row.fmt(v)}</td>`;
        }).join('')}
      </tr>`;
    }).join('');
  }
}

// ── Startup ──
syncSliders();
populateCaseSelector(protocolSelect ? protocolSelect.value : 'gbn');
initAllLiquidGlass();
logFeedItem('Protocol Simulator ready', 'info');


})();
