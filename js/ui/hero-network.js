/**
 * DEVNET — Hero Interactive Network Topology Canvas
 * Animated particle graph with packet pulses, connecting edges, and mouse interactivity.
 */

export class HeroNetworkCanvas {
  constructor() {
    this.canvas = document.getElementById('hero-network-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.nodes = [];
    this.pulses = [];
    this.mouse = { x: -1000, y: -1000, radius: 120 };

    this._resize();
    this._initNodes();
    this._bindEvents();
    this._animate();
  }

  _resize() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.parentElement.clientWidth;
    this.height = this.canvas.parentElement.clientHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  _initNodes() {
    this.nodes = [];
    const count = Math.floor((this.width * this.height) / 18000);
    const nodeCount = Math.min(45, Math.max(18, count));

    for (let i = 0; i < nodeCount; i++) {
      this.nodes.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        radius: Math.random() * 2.5 + 2,
        baseColor: Math.random() > 0.4 ? '#0071e3' : '#af52de'
      });
    }
  }

  _bindEvents() {
    window.addEventListener('resize', () => {
      this._resize();
      this._initNodes();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });

    window.addEventListener('mouseleave', () => {
      this.mouse.x = -1000;
      this.mouse.y = -1000;
    });
  }

  _animate() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update & draw nodes
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];

      node.x += node.vx;
      node.y += node.vy;

      if (node.x < 0 || node.x > this.width) node.vx *= -1;
      if (node.y < 0 || node.y > this.height) node.vy *= -1;

      // Mouse gentle repulsion
      const dx = this.mouse.x - node.x;
      const dy = this.mouse.y - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < this.mouse.radius) {
        const force = (this.mouse.radius - dist) / this.mouse.radius;
        node.x -= (dx / dist) * force * 1.5;
        node.y -= (dy / dist) * force * 1.5;
      }

      // Draw node circle
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = node.baseColor;
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = node.baseColor;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;

      // Connect nearby nodes
      for (let j = i + 1; j < this.nodes.length; j++) {
        const other = this.nodes[j];
        const ndx = other.x - node.x;
        const ndy = other.y - node.y;
        const nDist = Math.sqrt(ndx * ndx + ndy * ndy);

        if (nDist < 140) {
          const alpha = 1 - (nDist / 140);
          this.ctx.beginPath();
          this.ctx.moveTo(node.x, node.y);
          this.ctx.lineTo(other.x, other.y);
          this.ctx.strokeStyle = `rgba(0, 113, 227, ${alpha * 0.22})`;
          this.ctx.lineWidth = 1;
          this.ctx.stroke();

          // Chance to spawn pulse along line
          if (Math.random() < 0.0008 && this.pulses.length < 12) {
            this.pulses.push({
              x1: node.x, y1: node.y,
              x2: other.x, y2: other.y,
              t: 0,
              speed: 0.015,
              color: node.baseColor
            });
          }
        }
      }
    }

    // Update and draw traveling pulses
    const activePulses = [];
    for (const pulse of this.pulses) {
      pulse.t += pulse.speed;
      if (pulse.t <= 1) {
        const px = pulse.x1 + (pulse.x2 - pulse.x1) * pulse.t;
        const py = pulse.y1 + (pulse.y2 - pulse.y1) * pulse.t;

        this.ctx.beginPath();
        this.ctx.arc(px, py, 3, 0, Math.PI * 2);
        this.ctx.fillStyle = pulse.color;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = pulse.color;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;

        activePulses.push(pulse);
      }
    }
    this.pulses = activePulses;

    requestAnimationFrame(() => this._animate());
  }
}

