export type TaskTicket = {
  id: number;
  signal: AbortSignal;
  isCurrent: () => boolean;
};
/** One operation channel. Tickets also reject late results from providers ignoring abort. */
export class LatestTask {
  private version = 0;
  private controller: AbortController | null = null;
  get pending() {
    return this.controller !== null;
  }
  begin(): TaskTicket {
    this.cancel();
    const id = this.version,
      controller = (this.controller = new AbortController());
    return {
      id,
      signal: controller.signal,
      isCurrent: () => id === this.version && !controller.signal.aborted,
    };
  }
  finish(ticket: TaskTicket) {
    if (ticket.isCurrent()) this.controller = null;
  }
  cancel() {
    this.version++;
    this.controller?.abort();
    this.controller = null;
  }
}
