/**
 * DEVNET — Refined Glassmorphism UI (Clean, Minimal, No Wobble)
 * Completely eliminates erratic 3D tilts, mouse-following spotlights, and unwanted hovering gestures.
 * Provides clean Apple-style dark glass surfaces with crisp borders and subtle ambient depth.
 */

export function ensureLiquidGlassFilter() {
  // Silent fallback - no invasive SVG warping
}

export function applyLiquidGlass(element) {
  if (!element) return;
  element.classList.add('glass-card');
}

export function initAllLiquidGlass() {
  // Ensures rock-solid stable cards without mouse-hover wobble
  document.querySelectorAll('.glass-card, .btn-primary, .btn-secondary, .comparison-ascii-card').forEach(el => {
    el.style.transform = 'none';
    el.style.willChange = 'auto';
  });
}
