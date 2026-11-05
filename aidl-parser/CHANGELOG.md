# What's Changed in 0.2.0

- Expose full UTF-16 source ranges and declaration name ranges, with `sourceText` for exact source recovery.
- Preserve explicit parentheses, literal token spelling, and package/import declaration nodes without synthesizing implicit defaults.
- Replace the previous AST `location` and expression `literal` fields with the source-oriented AST contract.
- Reduce native traversal, expression text reconstruction, JSON serialization, and source position decoding overhead.
- Use native WebAssembly exception handling; runtimes must support Wasm EH.
- Verify parsing and android-api-diff adapter output across 508 Android tags: 846,347 indexed AIDL records and 6,981 distinct source contents, with no failures or differences from the pre-optimization baseline.
- Test packaged Node.js usage and Vite development/production browser and Worker initialization, including WASM load failures.
