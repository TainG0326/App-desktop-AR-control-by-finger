/**
 * One Euro Filter — a low-pass filter with adaptive cutoff.
 *
 * Reference: Casiez et al., "1€ Filter: A Simple Speed-based Low-pass Filter
 * for Noisy Input in Interactive Systems", CHI 2012.
 *
 *   minCutoff  — lower bound on the cutoff frequency. Lower = smoother
 *                but laggier at rest. Default: 1.0 Hz.
 *   beta       — speed coefficient. Higher = less lag during fast motion.
 *                Default: 0.007.
 *   dCutoff    — cutoff for the derivative filter (speed estimation).
 *                Default: 1.0 Hz.
 */
export interface OneEuroOptions {
  minCutoff?: number;
  beta?: number;
  dCutoff?: number;
}

const DEFAULT_OPTIONS: Required<OneEuroOptions> = {
  minCutoff: 1.0,
  beta: 0.007,
  dCutoff: 1.0
};

class LowpassFilter {
  private yPrev = 0;
  private _hasValue = false;

  get hasValue(): boolean {
    return this._hasValue;
  }

  filter(value: number, alpha: number): number {
    if (!this._hasValue) {
      this._hasValue = true;
      this.yPrev = value;
      return value;
    }
    const y = alpha * value + (1 - alpha) * this.yPrev;
    this.yPrev = y;
    return y;
  }

  reset(): void {
    this._hasValue = false;
    this.yPrev = 0;
  }
}

function smoothingFactor(te: number, cutoff: number): number {
  const r = 2 * Math.PI * cutoff * te;
  return r / (r + 1);
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private x = new LowpassFilter();
  private dx = new LowpassFilter();
  private tPrev = 0;
  private initialized = false;

  constructor(opts: OneEuroOptions = {}) {
    const o = { ...DEFAULT_OPTIONS, ...opts };
    this.minCutoff = o.minCutoff;
    this.beta = o.beta;
    this.dCutoff = o.dCutoff;
  }

  filter(value: number, tMs: number): number {
    if (!this.initialized) {
      this.initialized = true;
      this.tPrev = tMs;
      return this.x.filter(value, 1);
    }
    const te = Math.max(1e-6, (tMs - this.tPrev) / 1000);
    const dx = (value - this.x.filter(value, 1)) / te;
    const edx = this.dx.filter(dx, smoothingFactor(te, this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const alpha = smoothingFactor(te, cutoff);
    const result = this.x.filter(value, alpha);
    this.tPrev = tMs;
    return result;
  }

  reset(): void {
    this.x.reset();
    this.dx.reset();
    this.initialized = false;
  }

  setMinCutoff(v: number): void {
    this.minCutoff = v;
  }

  setBeta(v: number): void {
    this.beta = v;
  }
}