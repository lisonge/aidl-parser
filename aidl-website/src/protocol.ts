import type { AidlParseResult } from "aidl-parser";
export interface Request {
  version: number;
  source: string;
}
export type Response =
  | { version: number; result: AidlParseResult; elapsed: number }
  | { version: number; error: string };
