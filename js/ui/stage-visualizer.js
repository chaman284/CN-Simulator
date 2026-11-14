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

export class StageVisualizer {
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

