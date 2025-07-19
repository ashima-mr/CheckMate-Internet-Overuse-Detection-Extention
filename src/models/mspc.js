/* ---------------------------------------------------------
   Incremental Hotelling T² multivariate SPC
--------------------------------------------------------- */

import { CircularBuffer } from './utils/circular-buffer.js';
import { cholUpdate, cholDowndate, solveCholesky } from './utils/linear-algebra.js';

// --- CONFIG ------------------------------------------------
const ALPHA = 0.001;                 // 0.1 % false alarm
const WINDOW_N  = 1000;              // obs retained for limits
const MAX_P     = 6;                 // # variables monitored
// -----------------------------------------------------------

export class MSPC {
  constructor(p = MAX_P) {
    this.p          = p;
    this.n          = 0;                     // samples seen
    this.mean       = new Float64Array(p);   // μ̂
    this.cov        = new Float64Array(p*p); // Ŝ (row-major)
    this.chol       = null;                  // Cholesky factor L
    this.buf        = new CircularBuffer(WINDOW_N);
    this.ucl        = Infinity;              // updated after burn-in
  }

  /* ---- add one p-vector observation --------------------- */
  ingest(obs) {
    const x = obs;                           // Float64Array length p
    this.updateMoments(x);        // Updates mean and covariance incrementally
    const t2 = this.hotellingT2(x); // Compute Hotelling T²
    const signal = (this.n > this.p) && (t2 > this.ucl); // Signal if threshold exceeded
    this.buf.push({ t2, ts: Date.now(), signal });
    if (signal) console.warn('MSPC alarm', { t2, ucl: this.ucl });
    return signal;
  }

  /* ---- Welford incremental mean/cov update -------------- */
  updateMoments(x) {
    this.n += 1;
    const p = this.p;
    const n = this.n;
    // Δ = x – μ_prev
    const delta = new Float64Array(p);
    for (let j=0;j<p;++j) delta[j] = x[j] - this.mean[j];
    // μ̂ update
    for (let j=0;j<p;++j) this.mean[j] += delta[j] / n;
    // Ŝ update  (upper half only)
    const factor = (n-1)/n;
    for (let r=0;r<p;++r) {
      for (let c=r;c<p;++c) {
        const idx = r*p + c;
        const prod = delta[r]*delta[c]*factor;
        this.cov[idx] += prod;
        if (r !== c) this.cov[c*p+r] = this.cov[idx]; // symmetry
      }
    }
    // lazy-update Cholesky every 50 samples for speed
    if (n % 50 === 0) this.refreshCholesky();
    // refresh UCL after burn-in
    if (n === WINDOW_N) this.updateUCL();
  }

  refreshCholesky() {
    const p = this.p;
    // build covariance / (n-1)
    const S = new Float64Array(this.cov.length);
    const scale = 1/(this.n - 1);
    for (let i=0;i<S.length;++i) S[i] = this.cov[i] * scale;
    this.chol = cholUpdate(S, p);   // returns lower-triangular L
  }

  /* ---- Hotelling statistic ------------------------------ */
  hotellingT2(x) {
    if (!this.chol) this.refreshCholesky();
    // v = x – μ̂
    const v = new Float64Array(this.p);
    for (let j=0;j<this.p;++j) v[j] = x[j] - this.mean[j];
    // solve S⁻¹/2 v  via forward/back substitution
    const y = solveCholesky(this.chol, v);   // L y = v
    // T² = yᵀ y
    let t2 = 0;
    for (let j=0;j<this.p;++j) t2 += y[j]*y[j];
    return t2;
  }

  /* ---- Control limit for Phase II ----------------------- */
  updateUCL() {
    const p = this.p;
    const n = this.n;
    // F quantile via Wilson-Hilferty approx (avoid heavy lib)
    const f_alpha = this.fQuantile(p, n-p, 1-ALPHA);
    this.ucl = (p*(n-1)/(n-p)) * f_alpha;
  }

  /* ---- F distribution quantile (simple approximation) --- */
  fQuantile(d1, d2, prob) {
    // for α small, Wilson-Hilferty gives adequate accuracy[54]
    // F(d1,d2) ≈ χ²(d1)/d1  scaled; use inverse χ² approximation
    const chi = this.chi2Inv(prob, d1);
    return (d2*chi)/(d1*(d2-d1+chi));
  }

  chi2Inv(prob, df) {
    // Rational approximation (Abramowitz & Stegun 26.4.17)
    const p = prob;
    const t = Math.sqrt(-2*Math.log( (p<0.5)?p:1-p ));
    const c0 = 2.515517, c1=0.802853, c2=0.010328;
    const d1 = 1.432788, d2=0.189269, d3=0.001308;
    const num = (c2*t + c1)*t + c0;
    const den = ((d3*t + d2)*t + d1)*t + 1;
    const z = t - num/den;
    const chi = df * Math.pow(1 - 2/(9*df) + z*Math.sqrt(2/(9*df)), 3);
    return (p<0.5)? chi : df*2 - chi;        // symmetry
  }

  /* ---- expose stats snapshot ---------------------------- */
  getSnapshot() {
    return { n: this.n, mean: [...this.mean], ucl: this.ucl };
  }
}
