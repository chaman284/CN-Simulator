/**
 * DEVNET — Discrete Event Simulation Core Engine
 * Coordinates the Event Queue, Protocol logic, Time advancement, and UI dispatching.
 */

import { EventQueue, SimEvent } from './event-queue.js';
import { PRNG } from './prng.js';
import { StopAndWaitProtocol } from '../protocols/stop-and-wait.js';
import { GoBackNProtocol } from '../protocols/go-back-n.js';
import { SelectiveRepeatProtocol } from '../protocols/selective-repeat.js';

export class SimulationCore {
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
