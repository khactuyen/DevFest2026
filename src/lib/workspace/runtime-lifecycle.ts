type Disposable = { destroy(): void };
/** An async initializer may finish after unmount or after a newer scene owns the slot. */
export class RuntimeOwner<T extends Disposable> {
  private value: T | undefined;
  private closed = false;
  get active() {
    return this.value;
  }
  attach(value: T): boolean {
    if (this.closed) {
      value.destroy();
      return false;
    }
    if (this.value === value) return true;
    this.value?.destroy();
    this.value = value;
    return true;
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    const value = this.value;
    this.value = undefined;
    value?.destroy();
  }
}
