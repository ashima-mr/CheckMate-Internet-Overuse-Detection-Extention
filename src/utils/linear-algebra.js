export function cholUpdate(S, p) {
  // naive Cholesky for symmetric positive-definite S (row-major)
  const L = new Float64Array(S);      // will be overwritten
  for (let i=0;i<p;++i) {
    for (let j=0;j<i;++j) {
      let sum = L[i*p+j];
      for (let k=0;k<j;++k) sum -= L[i*p+k]*L[j*p+k];
      L[i*p+j] = sum / L[j*p+j];
    }
    let diag = L[i*p+i];
    for (let k=0;k<i;++k) diag -= L[i*p+k]**2;
    L[i*p+i] = Math.sqrt(Math.max(diag, 1e-10));
    // zero upper triangle
    for (let j=i+1;j<p;++j) L[i*p+j] = 0;
  }
  return L;
}

export function solveCholesky(L, b) {
  const p = b.length;
  const y = new Float64Array(b);
  // forward solve  L y = b
  for (let i=0;i<p;++i) {
    let sum = y[i];
    for (let k=0;k<i;++k) sum -= L[i*p+k]*y[k];
    y[i] = sum / L[i*p+i];
  }
  // back solve  Lᵀ x = y
  for (let i=p-1;i>=0;--i) {
    let sum = y[i];
    for (let k=i+1;k<p;++k) sum -= L[k*p+i]*y[k];
    y[i] = sum / L[i*p+i];
  }
  return y;
}
