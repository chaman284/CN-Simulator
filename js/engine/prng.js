/**
 * DEVNET — Seedable Pseudo-Random Number Generator (PRNG)
 * Mulberry32 implementation for deterministic academic simulations.
 */
export class PRNG {
  /**
   * @param {number|null} seed Initial seed integer. If null, generates random seed.
   */
  constructor(seed = 42) {
    this.initialSeed = seed !== null ? Number(seed) : Math.floor(Math.random() * 2147483647);
    this.seed = this.initialSeed;
  }

  /**
   * Reset generator to initial seed.
   */
  reset() {
    this.seed = this.initialSeed;
  }

  /**
   * Set new seed and reset.
   * @param {number} seed 
   */
  setSeed(seed) {
    this.initialSeed = Number(seed);
    this.reset();
  }

  /**
   * Generate next 32-bit integer pseudo-random number.
   * @returns {number} Float in range [0, 1)
   */
  random() {
    let t = (this.seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Return boolean with probability p of being true.
   * @param {number} probability Float in range [0, 1]
   * @returns {boolean}
   */
  chance(probability) {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.random() < probability;
  }

  /**
   * Return integer in range [min, max] inclusive.
   */
  randInt(min, max) {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }
}

