import { SimulationCore } from '../js/engine/simulation-core.js';

for (const proto of ['one-bit', 'gbn', 'sr']) {
  const config = {
    protocolType: proto,
    windowSize: proto === 'one-bit' ? 1 : 4,
    totalFrames: 15,
    pktLossProb: 0.25,
    ackLossProb: 0.15,
    timeout: 300,
    txDelay: 100,
    ackDelay: 50,
    deterministic: true,
    randomSeed: 99
  };

  const core = new SimulationCore(config);
  core.state = 'RUNNING';
  core._handleTransmitWindow();

  let steps = 0;
  while (!core.queue.isEmpty() && steps++ < 20000) {
    const ev = core.queue.pop();
    core.simTime = ev.time;
    core._processEvent(ev);
    if (core.protocol.isComplete) {
      core._finishSimulation();
      break;
    }
  }

  const m = core.protocol.metrics;
  console.log(`[${proto.toUpperCase()}] Retransmissions: ${m.retransmissions}, Lost: ${m.packetsLost}, Time: ${m.totalDuration}ms, Throughput: ${m.throughput} fps, Efficiency: ${m.efficiency}%`);
}

