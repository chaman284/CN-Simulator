/**
 * DEVNET — Discrete Event Priority Queue (Min-Heap)
 * Events are ordered strictly by simulation timestamp `event.time`.
 * Ties broken by deterministic sequential event ID.
 */

let globalEventId = 0;

export class SimEvent {
  /**
   * @param {number} time Discrete simulation time (ms)
   * @param {string} type 'FRAME_TX' | 'FRAME_ARRIVE' | 'ACK_TX' | 'ACK_ARRIVE' | 'TIMEOUT'
   * @param {object} payload Arbitrary event payload
   */
  constructor(time, type, payload = {}) {
    this.id = ++globalEventId;
    this.time = Number(time);
    this.type = type;
    this.payload = payload;
    this.cancelled = false;
  }
}

export class EventQueue {
  constructor() {
    /** @type {SimEvent[]} */
    this.heap = [];
  }

  /**
   * Insert event into priority queue.
   * @param {SimEvent} event 
   */
  push(event) {
    this.heap.push(event);
    this._bubbleUp(this.heap.length - 1);
  }

  /**
   * Remove and return the earliest event.
   * Skips cancelled events automatically.
   * @returns {SimEvent|null}
   */
  pop() {
    while (this.heap.length > 0) {
      const top = this.heap[0];
      const last = this.heap.pop();
      if (this.heap.length > 0) {
        this.heap[0] = last;
        this._bubbleDown(0);
      }
      if (!top.cancelled) {
        return top;
      }
    }
    return null;
  }

  /**
   * Peek next active event without removing.
   * @returns {SimEvent|null}
   */
  peek() {
    while (this.heap.length > 0 && this.heap[0].cancelled) {
      this.pop();
    }
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  /**
   * Cancel events matching a predicate function.
   * @param {function(SimEvent): boolean} predicate 
   * @returns {number} Count of cancelled events
   */
  cancel(predicate) {
    let count = 0;
    for (const ev of this.heap) {
      if (!ev.cancelled && predicate(ev)) {
        ev.cancelled = true;
        count++;
      }
    }
    return count;
  }

  /**
   * Total number of pending active events.
   */
  size() {
    let active = 0;
    for (const ev of this.heap) {
      if (!ev.cancelled) active++;
    }
    return active;
  }

  isEmpty() {
    return this.size() === 0;
  }

  clear() {
    this.heap = [];
  }

  /* Internal Min-Heap Methods */
  _bubbleUp(idx) {
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      if (this._compare(this.heap[idx], this.heap[parentIdx]) < 0) {
        this._swap(idx, parentIdx);
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  _bubbleDown(idx) {
    const length = this.heap.length;
    while (true) {
      let smallest = idx;
      const leftChild = 2 * idx + 1;
      const rightChild = 2 * idx + 2;

      if (leftChild < length && this._compare(this.heap[leftChild], this.heap[smallest]) < 0) {
        smallest = leftChild;
      }
      if (rightChild < length && this._compare(this.heap[rightChild], this.heap[smallest]) < 0) {
        smallest = rightChild;
      }

      if (smallest !== idx) {
        this._swap(idx, smallest);
        idx = smallest;
      } else {
        break;
      }
    }
  }

  _compare(a, b) {
    if (a.time !== b.time) {
      return a.time - b.time;
    }
    return a.id - b.id;
  }

  _swap(i, j) {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}

