export interface WasmModule {
  _malloc(size: number): number;
  _free(pointer: number): void;
  _aidl_parse(source: number, filename: number): number;
  _aidl_free(pointer: number): void;
  lengthBytesUTF8(value: string): number;
  stringToUTF8(value: string, pointer: number, length: number): void;
  UTF8ToString(pointer: number): string;
}
export function allocate(module: WasmModule, text: string) {
  const size = module.lengthBytesUTF8(text) + 1;
  const pointer = module._malloc(size);
  module.stringToUTF8(text, pointer, size);
  return pointer;
}
