/**
 * DEVNET — Discrete Event Activity Log Component
 * Filterable, timestamped, auto-scrolling log with icon badges.
 */

export class EventLogComponent {
  constructor() {
    this.container = document.getElementById('event-log-list');
    this.counterBadge = document.getElementById('log-count-badge');
    this.btnClear = document.getElementById('btn-clear-log');
    this.filterButtons = document.querySelectorAll('.log-filter-btn');

    this.logs = [];
    this.currentFilter = 'all';

    this._bindEvents();
  }

  _bindEvents() {
    this.btnClear?.addEventListener('click', () => this.clear());

    this.filterButtons?.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this._renderFiltered();
      });
    });
  }

  /**
   * Append new event log entry.
   * @param {object} entry 
   * @param {number} entry.time Simulation clock timestamp (ms)
   * @param {string} entry.type 'SYSTEM' | 'FRAME' | 'ACK_TX' | 'ACK_REC' | 'LOSS' | 'TIMEOUT' | 'RETRY' | 'RECV' | 'DROP'
   * @param {string} entry.message Detailed readable string
   * @param {string} entry.badgeClass CSS badge style
   */
  append(entry) {
    this.logs.push(entry);
    this._updateCounter();

    if (this._matchesFilter(entry, this.currentFilter)) {
      this._createLogElement(entry);
    }
  }

  _matchesFilter(entry, filter) {
    if (filter === 'all') return true;
    if (filter === 'tx') return entry.type === 'FRAME' || entry.type === 'RETRY' || entry.type === 'RECV';
    if (filter === 'ack') return entry.type === 'ACK_TX' || entry.type === 'ACK_REC';
    if (filter === 'loss') return entry.type === 'LOSS' || entry.type === 'DROP';
    if (filter === 'timeout') return entry.type === 'TIMEOUT';
    return true;
  }

  _createLogElement(entry) {
    if (!this.container) return;

    // Remove empty state placeholder if present
    const emptyState = this.container.querySelector('.log-empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    const row = document.createElement('div');
    row.className = 'log-entry';
    row.innerHTML = `
      <span class="log-time">${entry.time}ms</span>
      <span class="log-badge ${entry.badgeClass}">${entry.type}</span>
      <span class="log-msg">${this._escapeHtml(entry.message)}</span>
    `;

    this.container.appendChild(row);

    // Auto-scroll to latest
    this.container.scrollTop = this.container.scrollHeight;
  }

  _renderFiltered() {
    if (!this.container) return;
    this.container.innerHTML = '';

    const matching = this.logs.filter(l => this._matchesFilter(l, this.currentFilter));
    if (matching.length === 0) {
      this.container.innerHTML = '<div class="log-empty-state">No matching events for this filter.</div>';
      return;
    }

    matching.forEach(entry => this._createLogElement(entry));
  }

  _updateCounter() {
    if (this.counterBadge) {
      this.counterBadge.textContent = `${this.logs.length} events`;
    }
  }

  clear() {
    this.logs = [];
    if (this.container) {
      this.container.innerHTML = '<div class="log-empty-state">Event log cleared.</div>';
    }
    this._updateCounter();
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

