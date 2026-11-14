# DEVNET — Interactive Computer Networks Protocol Simulator

> **Visualize. Simulate. Optimize.**  
> An academic-grade, responsive discrete-event network simulator for reliable data transmission protocols featuring an Apple-inspired Liquid Glass interface.

---

## 1. Project Overview

**DEVNET** is an interactive web-based networking laboratory engineered for Computer Networks assignments and demonstrations. It models, simulates, and benchmarks three fundamental sliding-window transport/data-link protocols:

1. **One-Bit Sliding Window (Stop-and-Wait ARQ)**
2. **Go-Back-N (GBN)**
3. **Selective Repeat (SR)**

Unlike static visual mockups, DEVNET is powered by a **deterministic discrete-event simulation (DES) engine** decoupled from the UI, featuring event scheduling, pseudo-random channel noise injection, circular sliding window mechanics, individual/cumulative ACK processing, and dynamic retransmission timers.

---

## 2. Key Features

- **Apple Liquid Glass Design Language**:
  - Translucent frosted-glass panels (`backdrop-filter: blur(24px) saturate(190%)`)
  - Specular edge highlights, ambient lighting glows, and depth layering
  - Adaptive system-aware **Dark Mode** and **Light Mode** with smooth crossfade
  - Apple SF Pro / system-ui typography hierarchy
  - Smooth 60 FPS Canvas particle topology and packet animations

- **Strict Academic Correctness**:
  - **One-Bit**: Alternating 1-bit sequence space (`0` and `1`), strict stop-and-wait, duplicate ACK recovery.
  - **Go-Back-N**: Sender window $N$, receiver window $1$, cumulative ACKs, out-of-order drop policy, whole-window rewind on timeout.
  - **Selective Repeat**: Sender window $N$, receiver window $N$, out-of-order buffer tracking, individual ACKs, selective retransmission of lost frames only.
  - **Nyquist Window Bound Enforcement**: Sequence space and window limits ($N \le 2^{k-1}$) clearly visualized and documented.

- **Real-Time Physical Channel Visualization**:
  - **Sender & Receiver Buffer Tracks**: Real-time sequence slot badges (`WAIT`, `TX`, `RETRY`, `BUFF`, `ACK`).
  - **Animated Window Brackets**: Dynamic blue/green glass brackets gliding smoothly across buffer tracks as base pointers advance.
  - **Bi-directional Channel Lanes**: Blue data frames ($\to$), purple ACKs ($\leftarrow$), red packet drops ($\times$), and orange retransmissions ($\circlearrowright$).
  - **Timer Gauges**: Live countdown indicators for active unacknowledged frame timers.

- **Automated Tri-Protocol Benchmark Suite**:
  - Runs all 3 protocols simultaneously under identical network conditions (same frame count, delays, loss probabilities, and PRNG seed).
  - Side-by-side empirical performance table.
  - Interactive SVG bar charts for **Throughput**, **Protocol Efficiency**, **Retransmissions Overhead**, and **Total Duration**.
  - Auto-generated academic performance synthesis dynamically evaluating why the winner won.

- **Assignment Case Study Demonstration (Frame 2 Loss)**:
  - Step-by-step comparative walkthrough of what happens when Frame 2 is dropped while Frames 3 and 4 arrive safely.
  - Highlights why GBN rewinds and retransmits frames 2, 3, and 4, whereas Selective Repeat buffers 3 and 4 and retransmits Frame 2 only.

---

## 3. Technology Stack

- **Frontend**: Vanilla HTML5, CSS3 (Custom Apple Liquid Glass Design System), Modern JavaScript (ES Modules).
- **Simulation Core**: Discrete-Event Simulation (Priority Queue / Min-Heap, Mulberry32 PRNG).
- **Backend / Runner**: Python 3 standard library (`http.server`) with zero external dependencies.
- **Portability**: Runs 100% locally and completely offline. Requires no npm installations, node modules, paid APIs, or external CDNs.

---

## 4. Folder Structure

```
d:/CN-Simulation/
├── index.html                   # Single-Page Multi-View Application
├── server.py                    # Zero-dependency Python 3 HTTP runner
├── README.md                    # Project Documentation & Academic Guide
├── css/
│   ├── liquid-glass.css         # Apple design system, theme variables, glassmorphism
│   ├── simulator.css            # Console layout, buffer slots, window brackets, canvas
│   └── guide.css                # Case study, benchmark tables, SVG charts & reference
├── js/
│   ├── app.js                   # Application entry point & orchestrator
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
│       ├── network-visualizer.js # Canvas channel renderer & buffer DOM updater
│       ├── controls.js          # Sliders, protocol selector, and button handlers
│       ├── event-log.js         # Filterable, auto-scrolling activity log
│       ├── metrics-display.js   # Live telemetry and analytics cards
│       ├── comparison-view.js   # Tri-protocol benchmark runner & SVG charts
│       ├── theme.js             # Light/dark mode manager with system preference
│       └── hero-network.js      # Interactive hero topology canvas animation
└── tests/
    └── test-protocols.js        # Automated test suite (28 test assertions)
```

---

## 5. Installation & Execution Instructions

### Option A: Launch with Python (Recommended)

1. Open your terminal or PowerShell in the project directory:
   ```bash
   cd d:\CN-Simulation
   ```
2. Start the local server:
   ```bash
   python server.py
   ```
3. Your default web browser will automatically open to `http://localhost:8000`.

*Custom port option:*
```bash
python server.py --port 8080
```

### Option B: Direct Python Module

You can also run Python's built-in HTTP server:
```bash
python -m http.server 8000
```
Then visit `http://localhost:8000` in Google Chrome, Microsoft Edge, Safari, or Firefox.

### Option C: Run Automated Test Suite

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

#   C N - S i m u l a t o r  
 