/**
 * DEVNET — Multi-Protocol Head-to-Head Comparison & Benchmark Suite
 * Runs One-Bit, GBN, and SR under identical network conditions, computes metrics,
 * dynamically generates responsive SVG charts, and synthesizes academic takeaways.
 */

import { PRNG } from '../engine/prng.js';
import { EventQueue, SimEvent } from '../engine/event-queue.js';
import { StopAndWaitProtocol } from '../protocols/stop-and-wait.js';
import { GoBackNProtocol } from '../protocols/go-back-n.js';
import { SelectiveRepeatProtocol } from '../protocols/selective-repeat.js';

export class ComparisonViewManager {
  /**
   * @param {object} baseConfig 
   */
  constructor(baseConfig) {
    this.config = { ...baseConfig };

    // DOM Controls
    this.btnRunBenchmark = document.getElementById('btn-run-benchmark');
    this.benchProgressBar = document.getElementById('bench-progress-bar');
    this.benchProgressBox = document.getElementById('bench-progress-box');
    this.synthesisText = document.getElementById('benchmark-synthesis-text');

    // Benchmark Meta Info
    this.paramFrames = document.getElementById('bench-param-frames');
    this.paramWin = document.getElementById('bench-param-win');
    this.paramDelay = document.getElementById('bench-param-delay');
    this.paramLoss = document.getElementById('bench-param-loss');
    this.paramSeed = document.getElementById('bench-param-seed');

    // Chart Containers
    this.chartThroughput = document.getElementById('chart-throughput-box');
    this.chartEfficiency = document.getElementById('chart-efficiency-box');
    this.chartRetries = document.getElementById('chart-retries-box');
    this.chartTime = document.getElementById('chart-time-box');

    this._bindEvents();
    this.updateParamDisplays();
  }

  _bindEvents() {
    this.btnRunBenchmark?.addEventListener('click', () => {
      this.runBenchmark();
    });
  }

  updateParamDisplays() {
    if (this.paramFrames) this.paramFrames.textContent = this.config.totalFrames;
    if (this.paramWin) this.paramWin.textContent = this.config.windowSize;
    if (this.paramDelay) this.paramDelay.textContent = `${this.config.txDelay}ms / ${this.config.ackDelay}ms`;
    if (this.paramLoss) this.paramLoss.textContent = `${Math.round(this.config.pktLossProb * 100)}% Pkt / ${Math.round(this.config.ackLossProb * 100)}% ACK`;
    if (this.paramSeed) this.paramSeed.textContent = this.config.randomSeed;
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.updateParamDisplays();
  }

  /**
   * Headless simulation runner for a protocol under exact seed & params.
   * @param {string} protoType 'one-bit' | 'gbn' | 'sr'
   * @returns {object} Final metrics
   */
  _simulateProtocolHeadless(protoType) {
    const prng = new PRNG(this.config.randomSeed);
    const protoConfig = {
      windowSize: protoType === 'one-bit' ? 1 : this.config.windowSize,
      totalFrames: this.config.totalFrames,
      txDelay: this.config.txDelay,
      ackDelay: this.config.ackDelay,
      pktLossProb: this.config.pktLossProb,
      ackLossProb: this.config.ackLossProb,
      timeout: this.config.timeout
    };

    let protocol;
    if (protoType === 'one-bit') protocol = new StopAndWaitProtocol(protoConfig, prng);
    else if (protoType === 'sr') protocol = new SelectiveRepeatProtocol(protoConfig, prng);
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
        if (protoType === 'one-bit') break;
        nextFrame = protocol.canTransmit();
      }
    };

    // Trigger initial transmission
    transmitWindow();

    let maxSteps = 15000;
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
    return protocol.metrics;
  }

  /**
   * Run benchmark across all three protocols.
   */
  runBenchmark() {
    if (this.btnRunBenchmark) this.btnRunBenchmark.disabled = true;
    if (this.benchProgressBox) this.benchProgressBox.style.display = 'flex';
    if (this.benchProgressBar) this.benchProgressBar.style.width = '20%';

    setTimeout(() => {
      const resultsOneBit = this._simulateProtocolHeadless('one-bit');
      if (this.benchProgressBar) this.benchProgressBar.style.width = '60%';

      setTimeout(() => {
        const resultsGbn = this._simulateProtocolHeadless('gbn');
        if (this.benchProgressBar) this.benchProgressBar.style.width = '85%';

        setTimeout(() => {
          const resultsSr = this._simulateProtocolHeadless('sr');
          if (this.benchProgressBar) this.benchProgressBar.style.width = '100%';

          setTimeout(() => {
            if (this.benchProgressBox) this.benchProgressBox.style.display = 'none';
            if (this.btnRunBenchmark) this.btnRunBenchmark.disabled = false;

            this._populateTable(resultsOneBit, resultsGbn, resultsSr);
            this._renderCharts(resultsOneBit, resultsGbn, resultsSr);
            this._generateSynthesis(resultsOneBit, resultsGbn, resultsSr);
          }, 300);
        }, 150);
      }, 150);
    }, 150);
  }

  _populateTable(ob, gbn, sr) {
    // Populate Cells
    document.getElementById('tbl-onebit-tx').textContent = ob.totalFramesTx;
    document.getElementById('tbl-gbn-tx').textContent = gbn.totalFramesTx;
    document.getElementById('tbl-sr-tx').textContent = sr.totalFramesTx;

    document.getElementById('tbl-onebit-retries').textContent = ob.retransmissions;
    document.getElementById('tbl-gbn-retries').textContent = gbn.retransmissions;
    document.getElementById('tbl-sr-retries').textContent = sr.retransmissions;

    document.getElementById('tbl-onebit-pktlost').textContent = ob.packetsLost;
    document.getElementById('tbl-gbn-pktlost').textContent = gbn.packetsLost;
    document.getElementById('tbl-sr-pktlost').textContent = sr.packetsLost;

    document.getElementById('tbl-onebit-ackrec').textContent = ob.acksReceived;
    document.getElementById('tbl-gbn-ackrec').textContent = gbn.acksReceived;
    document.getElementById('tbl-sr-ackrec').textContent = sr.acksReceived;

    document.getElementById('tbl-onebit-acklost').textContent = ob.acksLost;
    document.getElementById('tbl-gbn-acklost').textContent = gbn.acksLost;
    document.getElementById('tbl-sr-acklost').textContent = sr.acksLost;

    document.getElementById('tbl-onebit-time').textContent = `${ob.totalDuration} ms`;
    document.getElementById('tbl-gbn-time').textContent = `${gbn.totalDuration} ms`;
    document.getElementById('tbl-sr-time').textContent = `${sr.totalDuration} ms`;

    document.getElementById('tbl-onebit-tput').textContent = `${ob.throughput} fps`;
    document.getElementById('tbl-gbn-tput').textContent = `${gbn.throughput} fps`;
    document.getElementById('tbl-sr-tput').textContent = `${sr.throughput} fps`;

    document.getElementById('tbl-onebit-eff').textContent = `${ob.efficiency}%`;
    document.getElementById('tbl-gbn-eff').textContent = `${gbn.efficiency}%`;
    document.getElementById('tbl-sr-eff').textContent = `${sr.efficiency}%`;

    // Dynamic Winner Badges
    this._setWinnerBadge('tbl-win-tx', this._findMin([['One-Bit', ob.totalFramesTx], ['GBN', gbn.totalFramesTx], ['SR', sr.totalFramesTx]]));
    this._setWinnerBadge('tbl-win-retries', this._findMin([['One-Bit', ob.retransmissions], ['GBN', gbn.retransmissions], ['SR', sr.retransmissions]]));
    this._setWinnerBadge('tbl-win-pktlost', '-');
    this._setWinnerBadge('tbl-win-ackrec', '-');
    this._setWinnerBadge('tbl-win-acklost', '-');
    this._setWinnerBadge('tbl-win-time', this._findMin([['One-Bit', ob.totalDuration], ['GBN', gbn.totalDuration], ['SR', sr.totalDuration]]));
    this._setWinnerBadge('tbl-win-tput', this._findMax([['One-Bit', ob.throughput], ['GBN', gbn.throughput], ['SR', sr.throughput]]));
    this._setWinnerBadge('tbl-win-eff', this._findMax([['One-Bit', ob.efficiency], ['GBN', gbn.efficiency], ['SR', sr.efficiency]]));
  }

  _findMin(pairs) {
    pairs.sort((a, b) => a[1] - b[1]);
    return pairs[0][0];
  }

  _findMax(pairs) {
    pairs.sort((a, b) => b[1] - a[1]);
    return pairs[0][0];
  }

  _setWinnerBadge(elemId, winnerName) {
    const el = document.getElementById(elemId);
    if (!el) return;
    if (winnerName === '-') {
      el.innerHTML = '<span class="badge-neutral">-</span>';
    } else {
      el.innerHTML = `<span class="badge-winner">${winnerName}</span>`;
    }
  }

  /**
   * Render High-DPI Interactive SVG Bar Charts.
   */
  _renderCharts(ob, gbn, sr) {
    this._renderBarChart(this.chartThroughput, [
      { label: 'One-Bit', value: ob.throughput, color: '#29b6f6' },
      { label: 'Go-Back-N', value: gbn.throughput, color: '#0071e3' },
      { label: 'Selective Repeat', value: sr.throughput, color: '#34c759' }
    ], 'fps');

    this._renderBarChart(this.chartEfficiency, [
      { label: 'One-Bit', value: ob.efficiency, color: '#29b6f6' },
      { label: 'Go-Back-N', value: gbn.efficiency, color: '#0071e3' },
      { label: 'Selective Repeat', value: sr.efficiency, color: '#34c759' }
    ], '%');

    this._renderBarChart(this.chartRetries, [
      { label: 'One-Bit', value: ob.retransmissions, color: '#29b6f6' },
      { label: 'Go-Back-N', value: gbn.retransmissions, color: '#ff9500' },
      { label: 'Selective Repeat', value: sr.retransmissions, color: '#34c759' }
    ], 'retries');

    this._renderBarChart(this.chartTime, [
      { label: 'One-Bit', value: ob.totalDuration, color: '#29b6f6' },
      { label: 'Go-Back-N', value: gbn.totalDuration, color: '#0071e3' },
      { label: 'Selective Repeat', value: sr.totalDuration, color: '#34c759' }
    ], 'ms');
  }

  _renderBarChart(container, items, unit) {
    if (!container) return;
    const width = 360;
    const height = 180;
    const maxVal = Math.max(...items.map(d => d.value), 1);

    const barWidth = 60;
    const spacing = (width - items.length * barWidth) / (items.length + 1);

    let barsSvg = '';
    items.forEach((item, idx) => {
      const x = spacing + idx * (barWidth + spacing);
      const barHeight = Math.max(8, (item.value / maxVal) * 110);
      const y = height - 40 - barHeight;

      barsSvg += `
        <g class="svg-bar-group">
          <!-- Bar -->
          <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="6" fill="${item.color}" opacity="0.9" />
          <!-- Top Value -->
          <text x="${x + barWidth / 2}" y="${y - 8}" fill="currentColor" font-size="11" font-weight="700" text-anchor="middle" font-family="monospace">${item.value}${unit === '%' ? '%' : ''}</text>
          <!-- Bottom Label -->
          <text x="${x + barWidth / 2}" y="${height - 18}" fill="currentColor" opacity="0.75" font-size="10.5" font-weight="600" text-anchor="middle">${item.label}</text>
        </g>
      `;
    });

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:100%; overflow:visible;">
        <!-- Base line -->
        <line x1="10" y1="${height - 35}" x2="${width - 10}" y2="${height - 35}" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
        ${barsSvg}
      </svg>
    `;
  }

  _generateSynthesis(ob, gbn, sr) {
    if (!this.synthesisText) return;

    let synthesis = '';
    const winner = sr.throughput >= gbn.throughput ? 'Selective Repeat' : 'Go-Back-N';

    synthesis += `<p><strong>Empirical Benchmark Conclusion:</strong> Under the tested conditions (${this.config.totalFrames} frames, ${Math.round(this.config.pktLossProb * 100)}% packet loss, ${this.config.timeout}ms timeout), <strong>${winner}</strong> achieved the superior transmission performance.</p>`;

    synthesis += `<p style="margin-top: 8px;"><strong>Analysis &amp; Theoretical Alignment:</strong><br>`;
    synthesis += `&bull; <strong>One-Bit Sliding Window</strong> is strictly bounded by the round-trip latency ($T_{\\text{RTT}} \\approx ${this.config.txDelay + this.config.ackDelay}\\text{ ms}$). Because it stops after each frame, its channel utilization was limited to ${(ob.throughput).toFixed(2)} fps with a total duration of ${ob.totalDuration} ms.<br>`;

    if (sr.retransmissions < gbn.retransmissions) {
      synthesis += `&bull; <strong>Go-Back-N</strong> suffered from retransmission cascading: when packet loss occurred, all subsequent unacknowledged frames in the window had to be retransmitted, racking up ${gbn.retransmissions} retransmission events.<br>`;
      synthesis += `&bull; <strong>Selective Repeat</strong> preserved channel capacity by independently buffering out-of-order packets at the receiver, requiring only ${sr.retransmissions} individual retransmissions and delivering an efficiency of ${sr.efficiency}%.`;
    } else {
      synthesis += `&bull; <strong>Go-Back-N</strong> performed competitively because packet loss was minimal, allowing pipelining to saturate the link with lower receiver complexity.<br>`;
      synthesis += `&bull; <strong>Selective Repeat</strong> demonstrated high individual delivery accuracy with an efficiency of ${sr.efficiency}%.`;
    }

    synthesis += `</p>`;

    this.synthesisText.innerHTML = synthesis;
  }
}
