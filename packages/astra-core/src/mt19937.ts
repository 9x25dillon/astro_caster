// Python-compatible Mersenne Twister (MT19937).
//
// The tarot draw seeds `random.Random(int(sha256_hex, 16))` and consumes
// `.random()`. To reproduce a draw on-device we must match CPython's PRNG
// bit-for-bit: the same `init_by_array` seeding CPython uses for an integer
// seed, and the same 53-bit `genrand_res53` float. This is the crux of the
// tarot port — proven against `parity/mt19937.json` (Python-generated).
//
// All arithmetic is on uint32 via `>>> 0` and Math.imul.

const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

export class MT19937 {
  private mt = new Uint32Array(N);
  private mti = N + 1;

  /** Seed from a non-negative big integer, exactly as CPython's
   *  random_seed(): little-endian 32-bit words of the absolute value, then
   *  init_by_array. Accepts a bigint or a hex string. */
  constructor(seed: bigint | string) {
    const n = typeof seed === "bigint" ? seed : BigInt("0x" + seed.replace(/^0x/, ""));
    this.seedBigInt(n < 0n ? -n : n);
  }

  private initGenrand(s: number): void {
    this.mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
      // 1812433253 * prev + i, in uint32
      this.mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = N;
  }

  private initByArray(key: Uint32Array): void {
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    let k = Math.max(N, key.length);
    for (; k; k--) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
      this.mt[i] =
        (((this.mt[i] ^ Math.imul(prev, 1664525)) >>> 0) + key[j] + j) >>> 0;
      i++;
      j++;
      if (i >= N) {
        this.mt[0] = this.mt[N - 1];
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (k = N - 1; k; k--) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
      this.mt[i] =
        (((this.mt[i] ^ Math.imul(prev, 1566083941)) >>> 0) - i) >>> 0;
      i++;
      if (i >= N) {
        this.mt[0] = this.mt[N - 1];
        i = 1;
      }
    }
    this.mt[0] = 0x80000000;
  }

  private seedBigInt(n: bigint): void {
    // CPython splits the seed into 32-bit little-endian words; a zero seed
    // still uses one word. Word count follows the value's bit length.
    const words: number[] = [];
    let v = n;
    if (v === 0n) words.push(0);
    while (v > 0n) {
      words.push(Number(v & 0xffffffffn));
      v >>= 32n;
    }
    this.initByArray(Uint32Array.from(words));
  }

  /** Next 32 random bits. */
  genrandUint32(): number {
    let y: number;
    if (this.mti >= N) {
      const mt = this.mt;
      let kk = 0;
      for (; kk < N - M; kk++) {
        y = ((mt[kk] & UPPER_MASK) | (mt[kk + 1] & LOWER_MASK)) >>> 0;
        mt[kk] = (mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)) >>> 0;
      }
      for (; kk < N - 1; kk++) {
        y = ((mt[kk] & UPPER_MASK) | (mt[kk + 1] & LOWER_MASK)) >>> 0;
        mt[kk] = (mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)) >>> 0;
      }
      y = ((mt[N - 1] & UPPER_MASK) | (mt[0] & LOWER_MASK)) >>> 0;
      mt[N - 1] = (mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)) >>> 0;
      this.mti = 0;
    }
    y = this.mt[this.mti++];
    y ^= y >>> 11;
    y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0;
    y = (y ^ ((y << 15) & 0xefc60000)) >>> 0;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** 53-bit float in [0, 1) — CPython's genrand_res53. */
  random(): number {
    const a = this.genrandUint32() >>> 5; // 27 bits
    const b = this.genrandUint32() >>> 6; // 26 bits
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }
}
