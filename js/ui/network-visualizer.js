/**
 * DEVNET — Real-Time Network Visualizer
 * Animates packets in physical channel (Canvas), sliding window brackets,
 * and sender/receiver buffer slot states.
 */

export class NetworkVisualizer {
  constructor() {
    this.canvas = document.getElementById('network-animation-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.container = document.getElementById('channel-canvas-container');

    // DOM Elements
    this.senderTrack = document.getElementById('sender-buffer-track');
    this.receiverTrack = document.getElementById('receiver-buffer-track');
    this.senderBracket = document.getElementById('sender-window-bracket');
    this.receiverBracket = document.getElementById('receiver-window-bracket');
    this.timersList = document.getElementById('active-timers-list');
    this.senderWindowCoords = document.getElementById('sender-window-coords');
    this.receiverWindowCoords = document.getElementById('receiver-window-coords');

    // Flying packets collection: { id, type, frameId, seq, isRetry, isLost, progress, startX, startY, endX, endY, ... }
    this.packets = [];

    // Resize handling & Canvas High-DPI
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());

    // Animation Loop
    this.lastRenderTime = performance.now();
    this.isRendering = false;
    this._startRenderLoop();
  }

  _resizeCanvas() {
    if (!this.canvas || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
    }
    this.width = rect.width;
    this.height = rect.height;
  }

  _startRenderLoop() {
    const loop = (timestamp) => {
      this._render(timestamp);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /**
   * Add a flying packet to the canvas channel.
   * @param {object} packet 
   */
  addPacket(packet) {
    this.packets.push({
      ...packet,
      createdAt: performance.now(),
      progress: 0,
      opacity: 1,
      lostAnimTime: 0
    });
  }

  /**
   * Main Canvas render frame.
   */
  _render(timestamp) {
    if (!this.ctx || !this.width || !this.height) return;

    this.ctx.clearRect(0, 0, this.width, this.height);

    // Dynamic Packet Animation
    const now = performance.now();
    const activePackets = [];

    for (const pkt of this.packets) {
      const elapsed = now - pkt.createdAt;
      const duration = pkt.duration || 1000;
      pkt.progress = Math.min(1, elapsed / duration);

      // Packet Loss Behavior: stops halfway and dissolves with an "X"
      if (pkt.isLost && pkt.progress >= 0.5) {
        pkt.lostAnimTime += 0.05;
        pkt.opacity = Math.max(0, 1 - (pkt.lostAnimTime / 1.5));
      }

      this._drawPacket(pkt);

      // Keep packet alive until it reaches destination or dissolves
      if (pkt.progress < 1 && pkt.opacity > 0) {
        activePackets.push(pkt);
      }
    }

    this.packets = activePackets;
  }

  _drawPacket(pkt) {
    const isAck = pkt.type === 'ACK';
    const startX = isAck ? this.width - 40 : 40;
    const endX = isAck ? 40 : this.width - 40;
    const yLane = isAck ? this.height * 0.72 : this.height * 0.28;

    // Current interpolated coordinate
    const currentProgress = pkt.isLost && pkt.progress >= 0.5 ? 0.5 : pkt.progress;
    const currentX = startX + (endX - startX) * currentProgress;
    const currentY = yLane + Math.sin(currentProgress * Math.PI) * (isAck ? -6 : 6);

    this.ctx.save();
    this.ctx.globalAlpha = pkt.opacity;

    if (pkt.isLost && pkt.progress >= 0.5) {
      // Draw Lost Packet Marker
      this.ctx.beginPath();
      this.ctx.arc(currentX, currentY, 18, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(255, 59, 48, 0.2)';
      this.ctx.fill();
      this.ctx.strokeStyle = '#ff3b30';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      // Draw "X"
      const xSize = 7;
      this.ctx.beginPath();
      this.ctx.moveTo(currentX - xSize, currentY - xSize);
      this.ctx.lineTo(currentX + xSize, currentY + xSize);
      this.ctx.moveTo(currentX + xSize, currentY - xSize);
      this.ctx.lineTo(currentX - xSize, currentY + xSize);
      this.ctx.strokeStyle = '#ff3b30';
      this.ctx.lineWidth = 2.5;
      this.ctx.stroke();

      // Label
      this.ctx.font = 'bold 9px sans-serif';
      this.ctx.fillStyle = '#ff3b30';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('DROPPED', currentX, currentY + 28);
    } else {
      // Draw In-Transit Glowing Packet
      const pktWidth = 42;
      const pktHeight = 26;
      const radius = 6;

      // Glow shadow
      this.ctx.shadowBlur = 12;
      if (isAck) {
        this.ctx.shadowColor = '#af52de';
        this.ctx.fillStyle = '#af52de';
      } else if (pkt.isRetry) {
        this.ctx.shadowColor = '#ff9500';
        this.ctx.fillStyle = '#ff9500';
      } else {
        this.ctx.shadowColor = '#0071e3';
        this.ctx.fillStyle = '#0071e3';
      }

      // Rounded Box
      this._drawRoundedRect(currentX - pktWidth / 2, currentY - pktHeight / 2, pktWidth, pktHeight, radius);
      this.ctx.fill();

      // Border highlight
      this.ctx.shadowBlur = 0;
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      // Text label
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 11px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      const label = isAck ? `ACK ${pkt.ackSeq}` : `F${pkt.frameId}`;
      this.ctx.fillText(label, currentX, currentY);
    }

    this.ctx.restore();
  }

  _drawRoundedRect(x, y, w, h, r) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  /**
   * Update sender and receiver buffer tracks and window bracket overlays.
   * @param {object} snapshot Protocol state snapshot
   */
  updateState(snapshot) {
    if (!snapshot) return;

    // 1. Render Sender Buffer Track
    if (this.senderTrack) {
      this.senderTrack.innerHTML = '';
      snapshot.frames.forEach((frame) => {
        const slot = document.createElement('div');
        let statusClass = 'slot-unsent';
        let statusIcon = 'WAIT';

        if (frame.status === 'acked') {
          statusClass = 'slot-acked';
          statusIcon = 'ACK';
        } else if (frame.status === 'in-flight') {
          statusClass = 'slot-in-flight';
          statusIcon = 'TX';
        } else if (frame.status === 'retrying') {
          statusClass = 'slot-in-flight';
          statusIcon = 'RETRY';
        }

        slot.className = `frame-slot ${statusClass}`;
        slot.innerHTML = `
          <span class="slot-seq">${frame.id}</span>
          <span class="slot-status-icon">${statusIcon}</span>
        `;
        this.senderTrack.appendChild(slot);
      });

      // Update Sender Window Bracket Position & Dimensions
      if (this.senderBracket) {
        const slotWidth = 44 + 8; // 44px slot + 8px gap
        const left = snapshot.sendBase * slotWidth;
        const width = Math.min(snapshot.windowSize, snapshot.totalFrames - snapshot.sendBase) * slotWidth - 8;
        this.senderBracket.style.left = `${Math.max(0, left)}px`;
        this.senderBracket.style.width = `${Math.max(44, width)}px`;
      }
    }

    // 2. Render Receiver Buffer Track
    if (this.receiverTrack) {
      this.receiverTrack.innerHTML = '';
      const bufferedSet = new Set(snapshot.bufferedFrames || []);

      for (let i = 0; i < snapshot.totalFrames; i++) {
        const slot = document.createElement('div');
        let statusClass = 'slot-unsent';
        let statusIcon = 'EXP';

        if (i < snapshot.receiverWindow.base) {
          statusClass = 'slot-acked';
          statusIcon = 'DONE';
        } else if (bufferedSet.has(i)) {
          statusClass = 'slot-buffered';
          statusIcon = 'BUFF';
        } else if (i === snapshot.receiverWindow.expectedSeq) {
          statusClass = 'slot-expected';
          statusIcon = 'NEXT';
        }

        slot.className = `frame-slot ${statusClass}`;
        slot.innerHTML = `
          <span class="slot-seq">${i}</span>
          <span class="slot-status-icon">${statusIcon}</span>
        `;
        this.receiverTrack.appendChild(slot);
      }

      // Update Receiver Window Bracket Position
      if (this.receiverBracket) {
        const slotWidth = 44 + 8;
        const base = snapshot.receiverWindow.base || 0;
        const size = snapshot.receiverWindow.size || 1;
        const left = base * slotWidth;
        const width = Math.min(size, snapshot.totalFrames - base) * slotWidth - 8;
        this.receiverBracket.style.left = `${Math.max(0, left)}px`;
        this.receiverBracket.style.width = `${Math.max(44, width)}px`;
      }
    }

    // 3. Update Window Metadata Strings
    if (this.senderWindowCoords) {
      this.senderWindowCoords.textContent = `Base: ${snapshot.sendBase} | NextSeq: ${snapshot.nextSeqNum} | Win: ${snapshot.windowSize}`;
    }
    if (this.receiverWindowCoords) {
      this.receiverWindowCoords.textContent = `Expected: ${snapshot.receiverWindow.expectedSeq} | Window Size: ${snapshot.receiverWindow.size}`;
    }

    // 4. Update Active Timers Strip
    if (this.timersList) {
      if (!snapshot.activeTimers || snapshot.activeTimers.length === 0) {
        this.timersList.innerHTML = '<span class="empty-timers-hint">No active unacknowledged frame timers</span>';
      } else {
        this.timersList.innerHTML = '';
        snapshot.activeTimers.forEach(t => {
          const pill = document.createElement('div');
          pill.className = 'timer-pill';
          pill.innerHTML = `
            <svg class="timer-circular-gauge" viewBox="0 0 24 24" fill="none" stroke="#ffcc00" stroke-width="3">
              <circle cx="12" cy="12" r="9" stroke="rgba(255,204,0,0.3)"></circle>
              <path d="M12 3 A 9 9 0 0 1 21 12" stroke-linecap="round"></path>
            </svg>
            <span>F${t.frameId} (${t.expiresAt}ms)</span>
          `;
          this.timersList.appendChild(pill);
        });
      }
    }
  }
}

