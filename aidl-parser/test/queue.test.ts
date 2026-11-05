import { test } from "node:test";
import assert from "node:assert/strict";
import { LatestRequest } from "../../aidl-website/src/latest-request.ts";

test("slow worker only receives the latest pending edit", () => {
  const sent: number[] = [];
  const queue = new LatestRequest<number>((value) => sent.push(value));
  queue.submit(1);
  queue.submit(2);
  queue.submit(3);
  assert.deepEqual(sent, [1]);
  queue.complete();
  assert.deepEqual(sent, [1, 3]);
  queue.submit(4);
  queue.discardPending();
  queue.complete();
  assert.deepEqual(sent, [1, 3]);
  queue.submit(5);
  queue.complete();
  queue.submit(6);
  assert.deepEqual(sent, [1, 3, 5, 6]);
});
