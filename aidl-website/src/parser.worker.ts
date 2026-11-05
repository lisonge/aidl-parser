const parser = import("aidl-parser");
import type { Request, Response } from "./protocol.ts";
self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    const { parseAidl } = await parser;
    const start = performance.now();
    const result = parseAidl(data.source);
    self.postMessage({
      version: data.version,
      result,
      elapsed: performance.now() - start,
    } satisfies Response);
  } catch (error) {
    self.postMessage({
      version: data.version,
      error: String(error),
    } satisfies Response);
  }
};
