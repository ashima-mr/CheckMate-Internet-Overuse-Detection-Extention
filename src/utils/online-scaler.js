export class OnlineScaler {
  constructor(alpha = 0.01) {
    this.alpha = alpha;
    this.mean = 0;
    this.var = 1;
  }
  update(x) {
    const delta = x - this.mean;
    this.mean += this.alpha * delta;
    this.var = (1 - this.alpha) * (this.var + this.alpha * delta * delta);
  }
  normalize(x) {
    this.update(x);
    return (x - this.mean) / Math.sqrt(this.var + 1e-6);
  }
}
