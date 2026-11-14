import { SimulationCore } from '../js/engine/simulation-core.js';

// Verify simulation runs and event hooks fire accurately
const config = {
  protocolType: 'gbn',
  windowSize: 4,
  totalFrames: 10,
  pktLossProb: 0.2,
  ackLossProb: 0.1,
  timeout: 300,
  txDelay: 100,
  ackDelay: 50,
  deterministic: true,
  randomSeed: 42
};

const core = new SimulationCore(config);
let frameTxCount = 0;
let ackTxCount = 0;
let timeoutCount = 0;

core.onEventProcessed = (ev) => {
  if (ev.type === 'FRAME_TX') frameTxCount++;
  if (ev.type === 'ACK_TX') ackTxCount++;
};

core.onLogMessage = (msg) => {
  if (msg.type === 'TIMEOUT') timeoutCount++;
};

core.state = 'RUNNING';
core._handleTransmitWindow();

let steps = 0;
while (!core.queue.isEmpty() && steps++ < 5000) {
  const ev = core.queue.pop();
  core.simTime = ev.time;
  core._processEvent(ev);
  if (core.protocol.isComplete) {
    core._finishSimulation();
    break;
  }
}

console.log(`Simulation finished in ${core.simTime}ms`);
console.log(`Frame TX: ${frameTxCount}, ACK TX: ${ackTxCount}, Timeouts: ${timeoutCount}`);
console.log(`Total transmitted: ${core.protocol.metrics.totalFramesTx}`);
console.log(`Retransmissions: ${core.protocol.metrics.retransmissions}`);
console.log(`Packets lost: ${core.protocol.metrics.packetsLost}`);
console.log(`Throughput: ${core.protocol.metrics.throughput} fps`);
console.log(`Efficiency: ${core.protocol.metrics.efficiency}%`);

