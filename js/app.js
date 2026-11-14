/**
 * DEVNET — app.js (Interactive Protocol Simulator Orchestrator)
 * Connects the configuration panel, the Fixed-Stage visualizer, the Space-Time ladder,
 * discrete event simulation engine, and multi-protocol performance benchmarks.
 */

import { SimulationCore } from './engine/simulation-core.js';
import { PRNG } from './engine/prng.js';
import { GoBackNProtocol } from './protocols/go-back-n.js';
import { StopAndWaitProtocol } from './protocols/stop-and-wait.js';
import { SelectiveRepeatProtocol } from './protocols/selective-repeat.js';
import { StageVisualizer } from './ui/stage-visualizer.js';
import { LadderVisualizer } from './ui/ladder-visualizer.js';
import { initAllLiquidGlass } from './ui/liquid-glass.js';

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
