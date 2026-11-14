/**
 * DEVNET — Space-Time Ladder Diagram Visualizer
 * Implements an animated textbook-style MSC (Message Sequence Chart) with:
 * - Vertical Sender/Receiver lifelines
 * - Animated diagonal arrows (data = solid, ACK = dashed)
 * - Sliding window buffer strips with brackets and pointers
 * - Mid-channel packet loss breaks
 * - Retransmission callout banners
 */

export class LadderVisualizer {
  constructor(containerEl) {
    this.container = containerEl;
    this.windowSize = 4;
    this.totalFrames = 20;
    this.protocolType = 'gbn';
    this._arrowId = 0;
    this._initialized = false;
    this._stepsEl = null;
    this.clear();
  }

  clear() {
    this._initialized = false;
    this._stepsEl = null;
    this._arrowId = 0;
    this._init();

    // Initial ready state: show initial buffer strips and channel cue so window is never empty
    const readyRow = document.createElement('div');
    readyRow.className = 'ld-row ld-ready-row';
    const proto = this.protocolType;
    const winSize = this.windowSize;
    const leftHTML = this._bufferHTML(0, 0, winSize, 'S', 'sender', proto);
    const rightHTML = this._bufferHTML(0, 0, winSize, 'R', 'receiver', proto);

    readyRow.innerHTML = `
      <div class="ld-col-left">${leftHTML}</div>
      <div class="ld-col-center">
        <div class="ld-ready-cue">
          <span class="ld-ready-icon">⚡</span>
          <span>Physical Channel Ready · Click <strong>▶ Run Simulation</strong> to begin</span>
        </div>
      </div>
      <div class="ld-col-right">${rightHTML}</div>
    `;
    this._stepsEl.appendChild(readyRow);
  }

  _init() {
    if (this._initialized) return;
    this._initialized = true;
    this.container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'ld-wrap';

    // Header row
    const header = document.createElement('div');
    header.className = 'ld-header';
    header.innerHTML = `
      <div class="ld-hcol ld-hcol-left"><span class="ld-col-title ld-title-sender">Sender</span></div>
      <div class="ld-hcol ld-hcol-center"><span class="ld-channel-label">Physical Channel</span></div>
      <div class="ld-hcol ld-hcol-right"><span class="ld-col-title ld-title-receiver">Receiver</span></div>
    `;
    wrap.appendChild(header);

    // Steps container (grows downward, auto-scrolls)
    this._stepsEl = document.createElement('div');
    this._stepsEl.className = 'ld-steps';
    wrap.appendChild(this._stepsEl);

    // Time arrow footer
    const footer = document.createElement('div');
    footer.className = 'ld-footer';
    footer.innerHTML = `<div class="ld-time-arrow"><span>◄</span><span class="ld-time-line"></span><span class="ld-time-text">Time</span><span class="ld-time-line"></span><span>►</span></div>`;
    wrap.appendChild(footer);

    this.container.appendChild(wrap);
  }

  // ── Buffer Strip HTML ──
  _bufferHTML(base, activeSlot, winSize, pointerLabel, side, protoType) {
    const seqMod = (protoType === 'one-bit') ? 2 : Math.max(4, winSize * 2);
    const total = 7;
    const slots = [];
    for (let i = 0; i < total; i++) {
      const frameId = base - 1 + i;
      const seq = ((frameId % seqMod) + seqMod) % seqMod;
      const inWin = frameId >= base && frameId < base + winSize;
      const isPast = frameId < base;
      const isPtr = frameId === activeSlot;
      let cls = 'ld-slot';
      if (isPast) cls += ' ld-slot-past';
      else if (inWin) cls += ' ld-slot-win';
      slots.push(`
        <div class="${cls}">
          <span class="ld-slot-val">${seq}</span>
          ${isPtr ? `<div class="ld-slot-ptr"><span class="ld-ptr-line"></span><span class="ld-ptr-tag">${pointerLabel}</span></div>` : ''}
        </div>
      `);
    }
    const bracketPx = Math.min(winSize, 5) * 26;
    return `
      <div class="ld-buf ld-buf-${side}">
        <div class="ld-buf-slots">${slots.join('')}</div>
        <div class="ld-buf-bracket" style="width:${bracketPx}px;"></div>
      </div>
    `;
  }

  // ── Animated diagonal arrow SVG ──
  _arrowSVG(direction, isLost, isRetry, isDashed, label, ackLabel) {
    const id = ++this._arrowId;
    const markerId = `arrowMk${id}`;
    const pathId = `arrowPth${id}`;

    // direction: 'fwd' (sender→receiver, top-left → bottom-right)
    //            'rev' (receiver→sender, top-right → bottom-left)
    let x1, y1, x2, y2;
    const W = 400, H = 60;
    if (direction === 'fwd') {
      x1 = 2; y1 = 8; x2 = W - 2; y2 = H - 8;
    } else {
      x1 = W - 2; y1 = 8; x2 = 2; y2 = H - 8;
    }

    const pathLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const color = isLost ? '#FF3B30' : (isRetry ? '#FF9500' : (isDashed ? '#34C759' : '#0071E3'));
    const dashArray = isDashed ? '8,5' : 'none';

    // For lost frames, midpoint
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;

    // Arrow label position: midpoint
    const lx = (x1 + x2) / 2;
    const ly = (y1 + y2) / 2 - 6;

    let pathD, markerDef, animClass;

    if (isLost) {
      // Draw only to midpoint, then zigzag
      const zx1 = mx - 8, zy1 = my - 8;
      const zx2 = mx + 4, zy2 = my + 8;
      const zx3 = mx + 10, zy3 = my - 4;
      pathD = `M ${x1} ${y1} L ${mx} ${my}`;
      markerDef = '';
      animClass = 'ld-arrow-anim-half';
      return `
        <svg class="ld-arrow-svg ld-arrow-${direction}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <path id="${pathId}-1" d="${pathD}" fill="none" stroke="${color}" stroke-width="2" class="${animClass}" style="--pathlen:${pathLen / 2}"/>
          <polyline points="${zx1},${zy1} ${zx2},${zy2} ${zx3},${zy3}" fill="none" stroke="${color}" stroke-width="2.5" style="opacity:0;animation:ldFadeIn 0.3s 0.7s forwards"/>
          <text x="${lx}" y="${ly - 4}" class="ld-arrow-label" fill="${color}" text-anchor="middle" font-size="10">${label}</text>
          <text x="${mx + 18}" y="${my + 4}" class="ld-arrow-label" fill="${color}" text-anchor="start" font-size="10" style="opacity:0;animation:ldFadeIn 0.3s 0.7s forwards">&#x2715; Lost</text>
        </svg>
      `;
    } else {
      pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
      markerDef = `
        <defs>
          <marker id="${markerId}" markerWidth="7" markerHeight="7" refX="${direction === 'fwd' ? 5 : 2}" refY="3.5" orient="auto">
            <polygon points="${direction === 'fwd' ? '0 0, 7 3.5, 0 7' : '7 0, 0 3.5, 7 7'}" fill="${color}"/>
          </marker>
        </defs>
      `;
      return `
        <svg class="ld-arrow-svg ld-arrow-${direction}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          ${markerDef}
          <path id="${pathId}" d="${pathD}" fill="none" stroke="${color}" stroke-width="${isDashed ? 1.5 : 2}" stroke-dasharray="${dashArray}" marker-end="url(#${markerId})" class="ld-arrow-anim-full" style="--pathlen:${pathLen}"/>
          <text x="${lx}" y="${ly}" class="ld-arrow-label" fill="${color}" text-anchor="middle" font-size="10.5" style="opacity:0;animation:ldFadeIn 0.3s 0.6s forwards">${label}</text>
        </svg>
      `;
    }
  }

  _addRow(leftHTML, arrowHTML, rightHTML, extraClass = '') {
    const row = document.createElement('div');
    row.className = `ld-row ${extraClass}`;
    row.innerHTML = `
      <div class="ld-col-left">${leftHTML}</div>
      <div class="ld-col-center">${arrowHTML}</div>
      <div class="ld-col-right">${rightHTML}</div>
    `;
    row.style.opacity = '0';
    this._stepsEl.appendChild(row);
    requestAnimationFrame(() => {
      row.style.transition = 'opacity 0.3s ease';
      row.style.opacity = '1';
    });
    // Auto-scroll
    this.container.scrollTop = this.container.scrollHeight;
  }

  addFrameTx(txData, snapshot) {
    this._init();
    const readyEl = this._stepsEl ? this._stepsEl.querySelector('.ld-ready-row') : null;
    if (readyEl) readyEl.remove();

    const proto = this.protocolType;
    const winSize = snapshot?.windowSize ?? (proto === 'one-bit' ? 1 : this.windowSize);
    const sendBase = snapshot?.sendBase ?? txData.frameId;
    const frameLabel = txData.isRetry ? `Frame ${txData.frameId} (Resent)` : `Frame ${txData.frameId}`;
    const leftHTML = this._bufferHTML(sendBase, txData.frameId, winSize, 'S', 'sender', proto);
    const arrowHTML = this._arrowSVG('fwd', txData.isLost, txData.isRetry, false, frameLabel, null);
    let rightHTML;
    if (txData.isLost) {
      rightHTML = `<div class="ld-buf-empty"></div>`;
    } else {
      const recvBase = snapshot?.recvBase ?? snapshot?.expectedSeq ?? txData.frameId;
      rightHTML = this._bufferHTML(recvBase, txData.frameId, winSize, 'R', 'receiver', proto);
    }
    this._addRow(leftHTML, arrowHTML, rightHTML, txData.isLost ? 'ld-row-lost' : (txData.isRetry ? 'ld-row-retry' : 'ld-row-ok'));
  }

  addAckTx(rxData, snapshot) {
    this._init();
    const proto = this.protocolType;
    const winSize = snapshot?.windowSize ?? (proto === 'one-bit' ? 1 : this.windowSize);
    const recvBase = snapshot?.recvBase ?? snapshot?.expectedSeq ?? rxData.ackSeq;
    const ackLabel = rxData.ackLost ? `NAK ${rxData.ackSeq}` : `ACK ${rxData.ackSeq}`;
    const rightHTML = this._bufferHTML(recvBase, rxData.ackSeq, winSize, 'R', 'receiver', proto);
    const arrowHTML = this._arrowSVG('rev', rxData.ackLost, false, true, ackLabel, null);
    let leftHTML;
    if (rxData.ackLost) {
      leftHTML = `<div class="ld-buf-empty"></div>`;
    } else {
      const sendBase = snapshot?.sendBase ?? rxData.ackSeq;
      leftHTML = this._bufferHTML(sendBase, rxData.ackSeq, winSize, 'S', 'sender', proto);
    }
    this._addRow(leftHTML, arrowHTML, rightHTML, rxData.ackLost ? 'ld-row-lost' : 'ld-row-ack');
  }

  addTimeoutCallout(protoType, frameId, framesToRetransmit) {
    this._init();
    const banner = document.createElement('div');
    banner.className = 'ld-callout';
    let actionHTML = '';
    if (protoType === 'gbn') {
      const list = framesToRetransmit?.length > 0 ? framesToRetransmit.join(' \u2192 ') : `${frameId}`;
      actionHTML = `
        <span class="ld-callout-proto">Go-Back-N</span>
        <span class="ld-callout-loss">Frame ${frameId} LOST</span>
        <span class="ld-callout-arrow-down">\u2193</span>
        <span class="ld-callout-retx">Retransmit: <strong>${list}</strong></span>
      `;
    } else if (protoType === 'sr') {
      actionHTML = `
        <span class="ld-callout-proto">Selective Repeat</span>
        <span class="ld-callout-loss">Frame ${frameId} LOST</span>
        <span class="ld-callout-arrow-down">\u2193</span>
        <span class="ld-callout-retx">Retransmit: <strong>Frame ${frameId} only</strong> (others buffered)</span>
      `;
    } else {
      actionHTML = `
        <span class="ld-callout-proto">One-Bit Stop-and-Wait</span>
        <span class="ld-callout-loss">Frame ${frameId} LOST</span>
        <span class="ld-callout-arrow-down">\u2193</span>
        <span class="ld-callout-retx">Retransmit: <strong>Frame ${frameId} only</strong></span>
      `;
    }
    banner.innerHTML = actionHTML;
    banner.style.opacity = '0';
    this._stepsEl.appendChild(banner);
    requestAnimationFrame(() => {
      banner.style.transition = 'opacity 0.3s ease';
      banner.style.opacity = '1';
    });
    this.container.scrollTop = this.container.scrollHeight;
  }
}
