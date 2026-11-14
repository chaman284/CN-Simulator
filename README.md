# DEVNET — Interactive Computer Networks Protocol Simulator

> **Visualize. Simulate. Optimize.**  
> An academic-grade, responsive discrete-event network simulator for reliable data transmission protocols featuring an Apple-inspired Liquid Glass interface.

---

## 1. Project Overview

**DEVNET** is an interactive web-based networking laboratory engineered for Computer Networks assignments and demonstrations. It models, simulates, and benchmarks three fundamental sliding-window transport/data-link protocols:

1. **One-Bit Sliding Window (Stop-and-Wait ARQ)**
2. **Go-Back-N (GBN)**
3. **Selective Repeat (SR)**

Powered by a **deterministic discrete-event simulation (DES) engine** decoupled from the UI, DEVNET features priority-queue event scheduling, pseudo-random channel noise injection, circular sliding window mechanics, individual/cumulative ACK processing, and dynamic retransmission timers.

---

## 2. Key Features

- **Apple Liquid Glass Design Language**:
  - Translucent frosted-glass panels (`backdrop-filter: blur(28px) saturate(160%)`)
  - Specular edge highlights and depth layering over a bold, saturated pastel aurora canvas
  - High-contrast typography and clean SVG line icons matching modern design standards
  - Smooth animated transitions for sliders, view switches, and controls

- **Dual Interactive Visualizers**:
  - **Space-Time Ladder Diagram (MSC)**: Textbook-grade Message Sequence Chart with vertical Sender/Receiver lifelines, diagonal data/ACK transmission arrows, in-flight packet loss breaks, and live sequence buffer strips.
  - **Horizontal Network Stage**: Live Sender and Receiver stations with sliding window brackets, animated channel traversal tracks, and real-time protocol callout banners.

- **4 Standard Operational Cases per Protocol**:
  Each protocol includes 4 pre-configured textbook operational scenarios:
  1. **Normal Operation**: Clean transmission and ACK progression without loss or timeouts.
  2. **The Frame is Lost**: Packet drop detection, timer expiry, and sender retransmission.
  3. **The ACK is Lost**: Detection of lost ACKs, duplicate frame handling, and duplicate ACKs.
  4. **Delayed ACK / Window Constraint**: Premature timeouts, delayed ACK absorption, and window size bounds ($W \le 2^{m-1}$).

- **Automated Tri-Protocol Benchmark Suite**:
  - Runs all 3 protocols under identical channel conditions (same frame count, transmission delays, loss probabilities, and PRNG seed).
  - Side-by-side empirical performance table with optimal score indicators (`★`) and tie resolution.
  - Metrics tracked: **Retransmissions**, **Throughput (fps)**, **Link Efficiency (%)**, **Packets Lost**, **ACKs Received**, **Total Frames Sent**, and **Total Duration**.
  - Collapsible raw report drawer for detailed terminal logs.

- **Strict Academic Correctness**:
  - **One-Bit**: Alternating 1-bit sequence space (`0` and `1`), strict stop-and-wait, duplicate ACK recovery.
  - **Go-Back-N**: Sender window $N$, receiver window $1$, cumulative ACKs, out-of-order drop policy, whole-window rewind on timeout.
  - **Selective Repeat**: Sender window $N$, receiver window $N$, out-of-order buffer tracking, individual ACKs, selective retransmission of lost frames only.
  - **Sequence Space Bound Enforcement**: $N \le 2^{m-1}$ for Selective Repeat and $N < 2^m$ for Go-Back-N.

---

## 3. Technology Stack

- **Frontend**: Vanilla HTML5, CSS3 (Custom Apple Liquid Glass Design System), Vanilla JavaScript.
- **Bundler**: Lightweight native Node.js bundler (`scripts/build-bundle.js` → `js/app.bundle.js`).
- **Simulation Core**: Discrete-Event Simulation (Priority Queue / Min-Heap, Mulberry32 PRNG).
- **Zero Dependencies / Completely Offline**: Runs directly in any web browser without any server, Python, or npm runtime requirements.

---

## 4. Folder Structure

```
d:/CN-Simulation/
├── index.html                   # Single-Page Multi-View Application
├── README.md                    # Project Documentation & Academic Guide
├── package.json                 # Project metadata & build scripts
├── css/
│   └── app.css                  # Apple liquid glass design system & layout styles
├── js/
│   ├── app.js                   # Application entry point & UI orchestrator
│   ├── app.bundle.js            # Standalone distribution bundle (pre-built)
│   ├── engine/
│   │   ├── event-queue.js       # Discrete Event Priority Queue (Min-Heap)
│   │   ├── prng.js              # Mulberry32 Seedable Pseudo-Random Generator
│   │   └── simulation-core.js   # Discrete-Event Simulation Engine runner
│   ├── protocols/
│   │   ├── base-protocol.js     # Abstract protocol metrics & snapshot interface
│   │   ├── stop-and-wait.js     # One-Bit Sliding Window implementation
│   │   ├── go-back-n.js         # Go-Back-N implementation
│   │   └── selective-repeat.js  # Selective Repeat implementation
│   └── ui/
│       ├── ladder-visualizer.js # Space-Time Ladder Message Sequence Chart
│       ├── stage-visualizer.js  # Horizontal Fixed-Stage Station visualizer
│       └── liquid-glass.js      # Liquid glass visual helpers
├── scripts/
│   └── build-bundle.js          # Standalone bundle generator
└── tests/
    ├── test-protocols.js        # Automated test suite (28 test assertions)
    ├── test-comparison-output.js# Tri-protocol benchmark headless test
    └── test-sim-events.js       # Discrete-event engine unit tests
```

---

## 5. Execution & Testing Instructions

### Option A: Launch Directly in Browser (Recommended)

Simply open **`index.html`** in any modern web browser:
- Double-click **`index.html`** in your file manager, or
- Right-click **`index.html`** → **Open With** → Google Chrome / Microsoft Edge / Mozilla Firefox / Safari.

> *No web server or Python installation is required.*

### Option B: Run Automated Test Suite

To verify all protocol edge cases, loss scenarios, and the assignment case study:
```bash
node tests/test-protocols.js
```
Expected output:
```
=================================================
 🎉 ALL TESTS PASSED: 28/28
=================================================
```

### Option C: Rebuild Application Bundle (Development)

If you modify files inside `js/`:
```bash
node scripts/build-bundle.js
```
This updates `js/app.bundle.js` for standalone browser execution.

---

## 6. Mathematical Formulas & Metric Definitions

### 1. Throughput ($\mathcal{T}$)
The rate of unique, useful frames successfully received and delivered to the upper layer per unit time:
$$\text{Throughput} = \frac{\text{Unique Frames Delivered}}{\text{Total Simulation Time (seconds)}} \quad [\text{frames/sec}]$$

### 2. Line Efficiency ($\eta$)
The percentage ratio of successfully delivered payload frames relative to the total number of frame transmission attempts over the physical channel (including dropped packets and retransmissions):
$$\text{Efficiency} = \left( \frac{\text{Unique Frames Delivered}}{\text{Total Frame Transmissions}} \right) \times 100\%$$

### 3. Retransmission Ratio
The average retransmission overhead incurred per delivered frame:
$$\text{Retransmission Ratio} = \frac{\text{Retransmissions}}{\text{Unique Frames Delivered}}$$

---

## 7. Configuration Parameters & Default Values

| Parameter | Default Value | Description |
|---|---|---|
| **Protocol** | Go-Back-N | One-Bit Sliding Window / Go-Back-N / Selective Repeat |
| **Window Size ($N$)** | `4` | Max unacknowledged frames in flight (locked to `1` for One-Bit) |
| **Total Frames** | `20` | Total discrete data frames to transmit |
| **Transmission Delay** | `100 ms` | Channel propagation + transmission time from Sender to Receiver |
| **ACK Delay** | `50 ms` | Channel propagation + transmission time from Receiver to Sender |
| **Packet Loss Rate** | `10%` | Stochastic probability of frame drop in forward channel |
| **ACK Loss Rate** | `5%` | Stochastic probability of ACK drop in reverse channel |
| **Timeout Duration** | `300 ms` | Sender retransmission timer (configured $> 2 \times \text{Delay}$) |
| **Deterministic Seed**| `42` | PRNG seed ensuring reproducible runs for grading |

---

## 8. Academic Project Metadata

- **Course**: Computer Networks and Its Applications (CS601 / CN)
- **Department**: Department of Computer Science and Engineering (Artificial Intelligence & Machine Learning)
- **Topic**: Simulation & Comparative Performance Analysis of Reliable Data Transmission Protocols
- **Compliance**: Verified against Kurose & Ross (*Computer Networking: A Top-Down Approach*) and Andrew S. Tanenbaum (*Computer Networks*).
