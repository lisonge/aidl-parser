/** Send one request at a time; edits replace the pending request. */
export class LatestRequest<T> {
  private active = false;
  private pending: T | undefined;
  constructor(privateSend: (request: T) => void) {
    this.send = privateSend;
  }
  private readonly send: (request: T) => void;
  submit(request: T) {
    if (this.active) this.pending = request;
    else {
      this.active = true;
      this.send(request);
    }
  }
  discardPending() {
    this.pending = undefined;
  }
  complete() {
    this.active = false;
    const pending = this.pending;
    this.pending = undefined;
    if (pending !== undefined) this.submit(pending);
  }
}
