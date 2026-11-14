/**
 * DEVNET — Simulation Controls & Configuration Panel Manager
 * Input validation, sliders, protocol switching & playback triggers.
 */

export class ControlsManager {
  /**
   * @param {import('../engine/simulation-core.js').SimulationCore} core 
   * @param {function} onConfigApplied 
   */
  constructor(core, onConfigApplied) {
    this.core = core;
    this.onConfigApplied = onConfigApplied;

    // Control Buttons
    this.btnStart = document.getElementById('btn-start');
    this.btnPause = document.getElementById('btn-pause');
    this.btnResume = document.getElementById('btn-resume');
    this.btnStep = document.getElementById('btn-step');
    this.btnReset = document.getElementById('btn-reset');
    this.speedSlider = document.getElementById('speed-slider');
    this.speedBadge = document.getElementById('speed-val-badge');

    // Config Form Inputs
    this.cfgProtocol = document.getElementById('cfg-protocol');
    this.cfgWindowSize = document.getElementById('cfg-window-size');
    this.valWindowSize = document.getElementById('val-window-size');
    this.groupWindowSize = document.getElementById('group-window-size');
    this.protocolHint = document.getElementById('protocol-hint');

    this.cfgFramesCount = document.getElementById('cfg-frames-count');
    this.valFramesCount = document.getElementById('val-frames-count');

    this.cfgTxDelay = document.getElementById('cfg-tx-delay');
    this.valTxDelay = document.getElementById('val-tx-delay');

    this.cfgAckDelay = document.getElementById('cfg-ack-delay');
    this.valAckDelay = document.getElementById('val-ack-delay');

    this.cfgPktLoss = document.getElementById('cfg-pkt-loss');
    this.valPktLoss = document.getElementById('val-pkt-loss');

    this.cfgAckLoss = document.getElementById('cfg-ack-loss');
    this.valAckLoss = document.getElementById('val-ack-loss');

    this.cfgTimeout = document.getElementById('cfg-timeout');
    this.valTimeout = document.getElementById('val-timeout');

    this.cfgDeterministic = document.getElementById('cfg-deterministic-toggle');
    this.cfgRandomSeed = document.getElementById('cfg-random-seed');
    this.seedBox = document.getElementById('seed-input-box');

    this.btnApplyConfig = document.getElementById('btn-apply-config');
    this.btnResetDefaults = document.getElementById('btn-reset-defaults');

    this._bindEvents();
    this._updateProtocolRestrictions();
  }

  _bindEvents() {
    // 1. Playback Button Handlers
    this.btnStart?.addEventListener('click', () => {
      this.core.start();
      this.updateButtonStates('RUNNING');
    });

    this.btnPause?.addEventListener('click', () => {
      this.core.pause();
      this.updateButtonStates('PAUSED');
    });

    this.btnResume?.addEventListener('click', () => {
      this.core.start();
      this.updateButtonStates('RUNNING');
    });

    this.btnStep?.addEventListener('click', () => {
      this.core.step();
    });

    this.btnReset?.addEventListener('click', () => {
      this.core.reset();
      this.updateButtonStates('IDLE');
    });

    // 2. Speed Slider
    this.speedSlider?.addEventListener('input', (e) => {
      const speed = parseFloat(e.target.value);
      this.speedBadge.textContent = `${speed.toFixed(2)}x`;
      this.core.setSpeed(speed);
    });

    // 3. Live Slider Badges
    this._syncSliderBadge(this.cfgWindowSize, this.valWindowSize, (v) => v);
    this._syncSliderBadge(this.cfgFramesCount, this.valFramesCount, (v) => v);
    this._syncSliderBadge(this.cfgTxDelay, this.valTxDelay, (v) => `${v} ms`);
    this._syncSliderBadge(this.cfgAckDelay, this.valAckDelay, (v) => `${v} ms`);
    this._syncSliderBadge(this.cfgPktLoss, this.valPktLoss, (v) => `${v}%`);
    this._syncSliderBadge(this.cfgAckLoss, this.valAckLoss, (v) => `${v}%`);
    this._syncSliderBadge(this.cfgTimeout, this.valTimeout, (v) => `${v} ms`);

    // 4. Protocol Selection Changes
    this.cfgProtocol?.addEventListener('change', () => {
      this._updateProtocolRestrictions();
      this._applyConfigFromForm();
    });

    // 5. Deterministic Toggle
    this.cfgDeterministic?.addEventListener('change', (e) => {
      if (this.seedBox) {
        this.seedBox.style.display = e.target.checked ? 'flex' : 'none';
      }
    });

    // 6. Apply Button
    this.btnApplyConfig?.addEventListener('click', () => {
      this._applyConfigFromForm();
    });

    // 7. Reset to Defaults Button
    this.btnResetDefaults?.addEventListener('click', () => {
      this.resetToDefaults();
    });
  }

  _syncSliderBadge(slider, badge, formatter) {
    if (!slider || !badge) return;
    slider.addEventListener('input', (e) => {
      badge.textContent = formatter(e.target.value);
    });
  }

  _updateProtocolRestrictions() {
    const proto = this.cfgProtocol.value;
    if (proto === 'one-bit') {
      this.cfgWindowSize.value = 1;
      this.cfgWindowSize.disabled = true;
      this.valWindowSize.textContent = '1 (Locked)';
      if (this.protocolHint) {
        this.protocolHint.textContent = 'One-Bit Sliding Window enforces Window Size = 1 (Stop-and-Wait).';
      }
    } else {
      this.cfgWindowSize.disabled = false;
      this.valWindowSize.textContent = this.cfgWindowSize.value;
      if (this.protocolHint) {
        this.protocolHint.textContent = proto === 'gbn'
          ? 'GBN: Transmits up to N frames. Discards out-of-order arrivals; rewinds window on timeout.'
          : 'Selective Repeat: Transmits up to N frames. Buffers out-of-order frames; retransmits lost frames only.';
      }
    }
  }

  _applyConfigFromForm() {
    const proto = this.cfgProtocol.value;
    const windowSize = proto === 'one-bit' ? 1 : parseInt(this.cfgWindowSize.value, 10);
    const totalFrames = parseInt(this.cfgFramesCount.value, 10);
    const txDelay = parseInt(this.cfgTxDelay.value, 10);
    const ackDelay = parseInt(this.cfgAckDelay.value, 10);
    const pktLossProb = parseInt(this.cfgPktLoss.value, 10) / 100.0;
    const ackLossProb = parseInt(this.cfgAckLoss.value, 10) / 100.0;
    const timeout = parseInt(this.cfgTimeout.value, 10);
    const deterministic = this.cfgDeterministic.checked;
    const randomSeed = parseInt(this.cfgRandomSeed.value, 10) || 42;

    const newConfig = {
      protocolType: proto,
      windowSize,
      totalFrames,
      txDelay,
      ackDelay,
      pktLossProb,
      ackLossProb,
      timeout,
      deterministic,
      randomSeed
    };

    this.core.updateConfig(newConfig);
    this.updateButtonStates('IDLE');

    if (this.onConfigApplied) {
      this.onConfigApplied(newConfig);
    }
  }

  resetToDefaults() {
    this.cfgProtocol.value = 'gbn';
    this.cfgWindowSize.value = 4;
    this.valWindowSize.textContent = '4';
    this.cfgFramesCount.value = 20;
    this.valFramesCount.textContent = '20';
    this.cfgTxDelay.value = 100;
    this.valTxDelay.textContent = '100 ms';
    this.cfgAckDelay.value = 50;
    this.valAckDelay.textContent = '50 ms';
    this.cfgPktLoss.value = 10;
    this.valPktLoss.textContent = '10%';
    this.cfgAckLoss.value = 5;
    this.valAckLoss.textContent = '5%';
    this.cfgTimeout.value = 300;
    this.valTimeout.textContent = '300 ms';
    this.cfgDeterministic.checked = true;
    this.cfgRandomSeed.value = 42;
    if (this.seedBox) this.seedBox.style.display = 'flex';

    this._updateProtocolRestrictions();
    this._applyConfigFromForm();
  }

  setProtocol(protocolKey) {
    if (this.cfgProtocol) {
      this.cfgProtocol.value = protocolKey;
      this._updateProtocolRestrictions();
      this._applyConfigFromForm();
    }
  }

  updateButtonStates(state) {
    if (state === 'RUNNING') {
      if (this.btnStart) this.btnStart.style.display = 'none';
      if (this.btnResume) this.btnResume.style.display = 'none';
      if (this.btnPause) {
        this.btnPause.style.display = 'inline-flex';
        this.btnPause.disabled = false;
      }
      if (this.btnStep) this.btnStep.disabled = true;
      if (this.btnReset) this.btnReset.disabled = false;
    } else if (state === 'PAUSED') {
      if (this.btnStart) this.btnStart.style.display = 'none';
      if (this.btnPause) this.btnPause.style.display = 'none';
      if (this.btnResume) this.btnResume.style.display = 'inline-flex';
      if (this.btnStep) this.btnStep.disabled = false;
      if (this.btnReset) this.btnReset.disabled = false;
    } else { // IDLE or FINISHED
      if (this.btnStart) {
        this.btnStart.style.display = 'inline-flex';
        this.btnStart.disabled = false;
      }
      if (this.btnPause) {
        this.btnPause.style.display = 'none';
        this.btnPause.disabled = true;
      }
      if (this.btnResume) this.btnResume.style.display = 'none';
      if (this.btnStep) this.btnStep.disabled = false;
      if (this.btnReset) this.btnReset.disabled = false;
    }
  }
}

