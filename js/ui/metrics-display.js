/**
 * DEVNET — Performance Analytics & Telemetry Display Manager
 * Updates live status bar, telemetry cards, and detailed analytics view.
 */

export class MetricsDisplayManager {
  constructor() {
    // Simulator Top Status Bar
    this.statusTime = document.getElementById('status-time');
    this.statusProtocol = document.getElementById('status-protocol-badge');
    this.statusState = document.getElementById('status-engine-state');
    this.statusProgressText = document.getElementById('status-progress-text');
    this.statusProgressBar = document.getElementById('status-progress-bar');

    // Simulator Live Telemetry Box
    this.liveTx = document.getElementById('live-stat-tx');
    this.liveDelivered = document.getElementById('live-stat-delivered');
    this.liveRetries = document.getElementById('live-stat-retries');
    this.liveLost = document.getElementById('live-stat-lost');

    // Analytics View Hero Numbers
    this.analyticsTput = document.getElementById('analytics-tput');
    this.analyticsEff = document.getElementById('analytics-eff');
    this.analyticsTime = document.getElementById('analytics-time');
    this.analyticsRetryRatio = document.getElementById('analytics-retry-ratio');

    // Analytics Detailed Breakdowns
    this.analyticsDelivered = document.getElementById('analytics-delivered');
    this.barDelivered = document.getElementById('bar-delivered');
    this.analyticsRetries = document.getElementById('analytics-retries');
    this.barRetries = document.getElementById('bar-retries');
    this.analyticsPktLost = document.getElementById('analytics-pkt-lost');
    this.barPktLost = document.getElementById('bar-pkt-lost');

    this.analyticsAckRec = document.getElementById('analytics-ack-rec');
    this.barAckRec = document.getElementById('bar-ack-rec');
    this.analyticsAckLost = document.getElementById('analytics-ack-lost');
    this.barAckLost = document.getElementById('bar-ack-lost');
    this.analyticsTimeouts = document.getElementById('analytics-timeouts');
    this.barTimeouts = document.getElementById('bar-timeouts');
  }

  /**
   * Update real-time counters during execution.
   * @param {object} stateData 
   */
  update(stateData) {
    if (!stateData) return;
    const { simTime, state, snapshot } = stateData;
    const m = snapshot.metrics;

    // Status Bar
    if (this.statusTime) this.statusTime.textContent = `${simTime} ms`;
    if (this.statusProtocol) this.statusProtocol.textContent = snapshot.protocolName;

    if (this.statusState) {
      this.statusState.textContent = state;
      this.statusState.className = `state-pill state-${state.toLowerCase()}`;
    }

    const delivered = m.uniqueDelivered || 0;
    const total = snapshot.totalFrames || 20;
    const pct = Math.min(100, Math.round((delivered / total) * 100));

    if (this.statusProgressText) this.statusProgressText.textContent = `${delivered} / ${total}`;
    if (this.statusProgressBar) this.statusProgressBar.style.width = `${pct}%`;

    // Live Telemetry Box
    if (this.liveTx) this.liveTx.textContent = m.totalFramesTx || 0;
    if (this.liveDelivered) this.liveDelivered.textContent = delivered;
    if (this.liveRetries) this.liveRetries.textContent = m.retransmissions || 0;
    if (this.liveLost) this.liveLost.textContent = (m.packetsLost || 0) + (m.acksLost || 0);

    // Analytics View
    if (this.analyticsTput) this.analyticsTput.textContent = m.throughput ? m.throughput.toFixed(2) : '0.00';
    if (this.analyticsEff) this.analyticsEff.textContent = `${m.efficiency || 0}%`;
    if (this.analyticsTime) this.analyticsTime.textContent = `${simTime}`;

    const ratio = delivered > 0 ? (m.retransmissions / delivered).toFixed(2) : '0.00';
    if (this.analyticsRetryRatio) this.analyticsRetryRatio.textContent = ratio;

    // Analytics Breakdowns
    if (this.analyticsDelivered) this.analyticsDelivered.textContent = delivered;
    if (this.barDelivered) this.barDelivered.style.width = `${pct}%`;

    if (this.analyticsRetries) this.analyticsRetries.textContent = m.retransmissions || 0;
    const retryPct = m.totalFramesTx > 0 ? Math.min(100, Math.round((m.retransmissions / m.totalFramesTx) * 100)) : 0;
    if (this.barRetries) this.barRetries.style.width = `${retryPct}%`;

    if (this.analyticsPktLost) this.analyticsPktLost.textContent = m.packetsLost || 0;
    const lossPct = m.totalFramesTx > 0 ? Math.min(100, Math.round((m.packetsLost / m.totalFramesTx) * 100)) : 0;
    if (this.barPktLost) this.barPktLost.style.width = `${lossPct}%`;

    if (this.analyticsAckRec) this.analyticsAckRec.textContent = m.acksReceived || 0;
    const ackRecPct = delivered > 0 ? Math.min(100, Math.round((m.acksReceived / (delivered * 1.5)) * 100)) : 0;
    if (this.barAckRec) this.barAckRec.style.width = `${ackRecPct}%`;

    if (this.analyticsAckLost) this.analyticsAckLost.textContent = m.acksLost || 0;
    const ackLossPct = (m.acksReceived + m.acksLost) > 0 ? Math.min(100, Math.round((m.acksLost / (m.acksReceived + m.acksLost)) * 100)) : 0;
    if (this.barAckLost) this.barAckLost.style.width = `${ackLossPct}%`;

    if (this.analyticsTimeouts) this.analyticsTimeouts.textContent = m.timeoutsTriggered || 0;
    const timeoutPct = m.totalFramesTx > 0 ? Math.min(100, Math.round((m.timeoutsTriggered / m.totalFramesTx) * 100)) : 0;
    if (this.barTimeouts) this.barTimeouts.style.width = `${timeoutPct}%`;
  }
}

