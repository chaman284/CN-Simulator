/**
 * DEVNET — Automated Protocol Verification & Unit Test Suite
 * Tests academic correctness, edge cases, loss scenarios, and the assignment's Frame 2 case study.
 */

import { PRNG } from '../js/engine/prng.js';
import { EventQueue, SimEvent } from '../js/engine/event-queue.js';
import { StopAndWaitProtocol } from '../js/protocols/stop-and-wait.js';
import { GoBackNProtocol } from '../js/protocols/go-back-n.js';
import { SelectiveRepeatProtocol } from '../js/protocols/selective-repeat.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(message);
  } else {
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  }
}

function runHeadlessSimulation(protocolType, config) {
  const prng = new PRNG(config.randomSeed !== undefined ? config.randomSeed : 42);
  const protoConfig = {
    windowSize: protocolType === 'one-bit' ? 1 : (config.windowSize !== undefined ? config.windowSize : 4),
    totalFrames: config.totalFrames !== undefined ? config.totalFrames : 10,
    txDelay: config.txDelay !== undefined ? config.txDelay : 100,
    ackDelay: config.ackDelay !== undefined ? config.ackDelay : 50,
    pktLossProb: config.pktLossProb !== undefined ? config.pktLossProb : 0,
    ackLossProb: config.ackLossProb !== undefined ? config.ackLossProb : 0,
    timeout: config.timeout !== undefined ? config.timeout : 300
  };

  let protocol;
  if (protocolType === 'one-bit') protocol = new StopAndWaitProtocol(protoConfig, prng);
  else if (protocolType === 'sr') protocol = new SelectiveRepeatProtocol(protoConfig, prng);
  else protocol = new GoBackNProtocol(protoConfig, prng);

  const queue = new EventQueue();
  let simTime = 0;
  protocol.metrics.startTime = 0;

  const transmitSingle = (fId, isRetry) => {
    const txRes = protocol.onSendFrame(simTime, isRetry ? fId : null);
    queue.push(new SimEvent(txRes.arrivalTime, 'FRAME_ARRIVE', {
      frameId: txRes.frameId,
      seq: txRes.seq,
      isLost: txRes.isLost
    }));
    queue.push(new SimEvent(txRes.timeoutTime, 'TIMEOUT', { frameId: txRes.frameId }));
  };

  const transmitWindow = () => {
    let nextFrame = protocol.canTransmit();
    while (nextFrame) {
      transmitSingle(nextFrame.id, false);
      if (protocolType === 'one-bit') break;
      nextFrame = protocol.canTransmit();
    }
  };

  transmitWindow();

  let maxSteps = 20000;
  while (!queue.isEmpty() && maxSteps-- > 0) {
    const event = queue.pop();
    simTime = event.time;

    switch (event.type) {
      case 'FRAME_ARRIVE': {
        const payload = event.payload;
        if (payload.isLost) {
          protocol.metrics.packetsLost++;
          break;
        }
        const rxRes = protocol.onReceiveFrame(simTime, payload);
        if (rxRes.shouldSendAck !== false && rxRes.ackSeq !== -1) {
          queue.push(new SimEvent(rxRes.ackArrivalTime, 'ACK_ARRIVE', {
            frameId: payload.frameId,
            ackSeq: rxRes.ackSeq,
            ackLost: rxRes.ackLost
          }));
        }
        break;
      }

      case 'ACK_ARRIVE': {
        const payload = event.payload;
        if (payload.ackLost) {
          protocol.metrics.acksLost++;
          break;
        }
        const ackRes = protocol.onReceiveAck(simTime, payload);
        if (ackRes.valid) {
          transmitWindow();
        }
        break;
      }

      case 'TIMEOUT': {
        const { frameId } = event.payload;
        const timeoutRes = protocol.onTimeout(simTime, frameId);
        if (timeoutRes.shouldRetransmit) {
          if (timeoutRes.framesToRetransmit) {
            for (let i = 0; i < timeoutRes.framesToRetransmit.length; i++) {
              transmitSingle(timeoutRes.framesToRetransmit[i], true);
            }
          } else {
            transmitSingle(frameId, true);
          }
        }
        break;
      }
    }

    if (protocol.isComplete) {
      break;
    }
  }

  protocol.finalizeMetrics(simTime);
  return { protocol, metrics: protocol.metrics, finalSimTime: simTime };
}

console.log("=================================================");
console.log(" DEVNET PROTOCOL TEST SUITE");
console.log("=================================================");

// TEST 1: PRNG Determinism
{
  const p1 = new PRNG(12345);
  const p2 = new PRNG(12345);
  const v1 = [p1.random(), p1.random(), p1.random()];
  const v2 = [p2.random(), p2.random(), p2.random()];
  assert(JSON.stringify(v1) === JSON.stringify(v2), "PRNG produces identical sequence for same seed");
}

// TEST 2: Stop-and-Wait Zero Loss
{
  const res = runHeadlessSimulation('one-bit', { totalFrames: 10, pktLossProb: 0, ackLossProb: 0 });
  assert(res.metrics.uniqueDelivered === 10, "One-Bit delivers 10/10 frames under ideal link");
  assert(res.metrics.retransmissions === 0, "One-Bit has 0 retransmissions under zero loss");
  assert(res.metrics.efficiency === 100, "One-Bit achieves 100% efficiency under zero loss");
}

// TEST 3: Go-Back-N Zero Loss
{
  const res = runHeadlessSimulation('gbn', { totalFrames: 15, windowSize: 4, pktLossProb: 0, ackLossProb: 0 });
  assert(res.metrics.uniqueDelivered === 15, "GBN delivers 15/15 frames under ideal link");
  assert(res.metrics.retransmissions === 0, "GBN has 0 retransmissions under zero loss");
  assert(res.metrics.efficiency === 100, "GBN achieves 100% efficiency under zero loss");
  assert(res.protocol.sendBase === 15, "GBN advances sendBase to totalFrames");
}

// TEST 4: Selective Repeat Zero Loss
{
  const res = runHeadlessSimulation('sr', { totalFrames: 15, windowSize: 4, pktLossProb: 0, ackLossProb: 0 });
  assert(res.metrics.uniqueDelivered === 15, "SR delivers 15/15 frames under ideal link");
  assert(res.metrics.retransmissions === 0, "SR has 0 retransmissions under zero loss");
  assert(res.metrics.efficiency === 100, "SR achieves 100% efficiency under zero loss");
  assert(res.protocol.recvBase === 15, "SR advances recvBase to totalFrames");
}

// TEST 5: Go-Back-N Loss & Retransmission Recovery
{
  const res = runHeadlessSimulation('gbn', { totalFrames: 20, windowSize: 4, pktLossProb: 0.15, ackLossProb: 0.1, randomSeed: 99 });
  assert(res.metrics.uniqueDelivered === 20, "GBN reliably delivers all 20 frames despite 15% packet loss and 10% ACK loss");
  assert(res.metrics.retransmissions > 0, "GBN triggers retransmissions on loss");
  assert(res.metrics.packetsLost > 0 || res.metrics.acksLost > 0, "GBN recorded channel drops");
}

// TEST 6: Selective Repeat Loss & Selective Recovery
{
  const res = runHeadlessSimulation('sr', { totalFrames: 20, windowSize: 4, pktLossProb: 0.15, ackLossProb: 0.1, randomSeed: 99 });
  assert(res.metrics.uniqueDelivered === 20, "SR reliably delivers all 20 frames under loss");
  assert(res.metrics.retransmissions > 0, "SR triggers retransmissions on loss");
}

// TEST 7: Comparative Efficiency between GBN and SR under Loss
{
  const gbnRes = runHeadlessSimulation('gbn', { totalFrames: 25, windowSize: 4, pktLossProb: 0.2, ackLossProb: 0.05, randomSeed: 777 });
  const srRes = runHeadlessSimulation('sr', { totalFrames: 25, windowSize: 4, pktLossProb: 0.2, ackLossProb: 0.05, randomSeed: 777 });

  console.log(`GBN Retransmissions: ${gbnRes.metrics.retransmissions}, SR Retransmissions: ${srRes.metrics.retransmissions}`);
  assert(srRes.metrics.retransmissions <= gbnRes.metrics.retransmissions, "Selective Repeat produces fewer or equal retransmissions than GBN under high packet loss due to buffering");
}

// TEST 8: Explicit Assignment Case Study Test: Frame 2 is Lost
{
  console.log("\n--- Executing Assignment Case Study: Frame 2 is Lost ---");
  const prngMock = new PRNG(42);
  const gbn = new GoBackNProtocol({ windowSize: 4, totalFrames: 6, txDelay: 50, ackDelay: 50, pktLossProb: 0, ackLossProb: 0, timeout: 200 }, prngMock);
  
  // Transmit frames 0, 1, 2, 3
  gbn.onSendFrame(0);  // Frame 0
  gbn.onSendFrame(10); // Frame 1
  gbn.onSendFrame(20); // Frame 2
  gbn.onSendFrame(30); // Frame 3

  // Receiver receives Frame 0 and Frame 1
  gbn.onReceiveFrame(50, { frameId: 0, seq: 0, isLost: false });
  gbn.onReceiveFrame(60, { frameId: 1, seq: 1, isLost: false });
  
  // Receiver gets Frame 2 LOST!
  const lossRes = gbn.onReceiveFrame(70, { frameId: 2, seq: 2, isLost: true });
  assert(lossRes.packetLost === true, "GBN marks Frame 2 as lost");

  // Frames 3 arrives at receiver, but receiver expects 2!
  const outOfOrderRes = gbn.onReceiveFrame(80, { frameId: 3, seq: 3, isLost: false });
  assert(outOfOrderRes.accepted === false, "GBN receiver discards Frame 3 because it arrived out of order");
  assert(outOfOrderRes.ackSeq === 1, "GBN receiver re-sends cumulative ACK for Frame 1");

  // Sender receives ACK 0 and ACK 1
  gbn.onReceiveAck(100, { ackSeq: 0, ackLost: false });
  gbn.onReceiveAck(110, { ackSeq: 1, ackLost: false });
  assert(gbn.sendBase === 2, "GBN sender base advanced to 2");

  // Now Frame 2 times out at sender!
  const timeoutAction = gbn.onTimeout(220, 2);
  assert(timeoutAction.shouldRetransmit === true, "GBN triggers retransmission on timeout of Frame 2");
  assert(JSON.stringify(timeoutAction.framesToRetransmit) === JSON.stringify([2, 3]), "GBN rolls back and retransmits BOTH Frame 2 AND Frame 3 (all unacked frames in window)!");

  // For Selective Repeat:
  const sr = new SelectiveRepeatProtocol({ windowSize: 4, totalFrames: 6, txDelay: 50, ackDelay: 50, pktLossProb: 0, ackLossProb: 0, timeout: 200 }, prngMock);
  sr.onSendFrame(0);
  sr.onSendFrame(10);
  sr.onSendFrame(20);
  sr.onSendFrame(30);

  sr.onReceiveFrame(50, { frameId: 0, seq: 0, isLost: false });
  sr.onReceiveFrame(60, { frameId: 1, seq: 1, isLost: false });

  // Frame 2 is LOST
  sr.onReceiveFrame(70, { frameId: 2, seq: 2, isLost: true });

  // Frame 3 arrives at receiver!
  const srOutOfOrderRes = sr.onReceiveFrame(80, { frameId: 3, seq: 3, isLost: false });
  assert(srOutOfOrderRes.accepted === true, "SR receiver ACCEPTS and BUFFERS Frame 3!");
  assert(sr.receiverBuffer.has(3), "SR receiver buffer contains Frame 3");

  // Frame 2 times out at sender!
  const srTimeoutAction = sr.onTimeout(220, 2);
  assert(srTimeoutAction.shouldRetransmit === true, "SR triggers retransmission on timeout of Frame 2");
  assert(srTimeoutAction.frameId === 2, "SR retransmits ONLY Frame 2, avoiding redundant retransmission of Frame 3!");
}

console.log("\n=================================================");
console.log(` 🎉 ALL TESTS PASSED: ${passedTests}/${totalTests}`);
console.log("=================================================");
