export class TransferMeter {
  private time = 0;
  private bytes = 0;
  private rate = 0;
  private idle = 0;
  sample(bytes: number, time: number, active = true) {
    if (!active) {
      this.idle = 0;
      this.time = time;
      this.bytes = bytes;
      this.rate = 0;
      return 0;
    }
    if (!this.time) {
      this.time = time;
      this.bytes = bytes;
      return 0;
    }
    const elapsed = (time - this.time) / 1000;
    if (elapsed <= 0) return this.rate;
    const delta = Math.max(0, bytes - this.bytes);
    const instant = delta / elapsed;
    this.idle = delta === 0 ? this.idle + elapsed : 0;
    this.rate =
      this.idle >= 2.5
        ? 0
        : this.rate === 0
          ? instant
          : 0.35 * instant + 0.65 * this.rate;
    this.time = time;
    this.bytes = bytes;
    return this.rate;
  }
}
export function remainingSeconds(
  total: number,
  received: number,
  speed: number,
) {
  return total > 0 && speed > 0
    ? Math.max(0, (total - received) / speed)
    : null;
}
