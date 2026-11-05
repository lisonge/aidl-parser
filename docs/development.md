# Development

All paths and commands below are relative to the repository root.

## Local development (Windows / Linux x64)

Requirements: Git and mise 2026.10.24 or newer. Project tool versions are declared in `mise.toml`; `mise.lock` pins downloads for Windows x64 and Linux x64.

```powershell
mise trust
mise install --locked
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm upstream:sync
mise exec -- pnpm dev
```

Open http://127.0.0.1:5173. The editor parses after a short debounce and displays a structure tree, JSON and clickable diagnostics. Input persists in browser local storage. Website edits use Vite HMR; package and C++ changes rebuild and reload the page after completion.

mise installs Node.js, pnpm, Python, CMake, Ninja and Emscripten in its user-level tool store without changing global version settings. Windows uses WinFlexBison 2.5.25 (Bison 3.8.2 / Flex 2.6.4); Linux uses the same upstream versions through mise's Conda backend. The Conda backend does not require a separate Conda installation. `mise.lock` also records the Linux tools' dependencies; refresh both platforms with `mise lock --platform windows-x64,linux-x64`.

Emscripten 6.0.13 uses mise's HTTP backend with the official versioned emsdk archive. `mise.lock` verifies that archive's SHA-256 on both platforms; the postinstall hook installs and activates the matching compiler using the archive's SDK manifest. These additional SDK downloads are managed by emsdk, not individually checksummed in `mise.lock`. mise supplies `EMSDK` and `EM_CONFIG`; builds use mise's Python and a project-local compiler cache. Prefix the commands below with `mise exec --` when running without mise shell activation.

## Commands

```powershell
pnpm build:wasm       # C++ → aidl.mjs + aidl.wasm
pnpm build:parser     # WASM + npm package
pnpm build            # npm package + production website
pnpm typecheck
pnpm test             # API tests + 52 pinned upstream fixtures
pnpm test:package     # Pack, extract, import and typecheck actual npm contents
pnpm test:browser     # Test unpacked package in Vite dev/production and module Workers
pnpm benchmark        # Warm parse latency, wire bytes, JS stages, process memory/GC
```

Build before typechecking/tests on a fresh checkout. Outputs live in each package's `build/` / `dist/`. Package tests write only to root `build/package-test/`.

Browser integration tests use a separate headless profile under `build/package-test/`.
Set `BROWSER_EXECUTABLE` to a Chromium browser path; Windows defaults to Microsoft
Edge. Run `test:package` first. Tests cover main-thread loading, immediate and
concurrent Worker requests, and rejected WASM loading without hanging requests.

## Native CPU sampling

```powershell
mise exec -- node aidl-cpp/scripts/build.ts --profile
node scripts/profile-native.ts
```

The separate profiling artifact retains WASM function names. The script warms
the native entry point, then uses Node's CPU profiler at a requested 100 µs
sampling interval. It excludes JS wire decoding and writes a DevTools-compatible
`.cpuprofile` plus a JSON summary under `build/benchmarks/`. The runtime/OS may
sample less frequently than requested. Inclusive sample counts overlap and are
not additive; use non-instrumented paired benchmarks for performance claims.
`PROFILE_CASE` selects `methods5000` (default), `chains20x500`, or `official`;
`PROFILE_ITERATIONS` defaults to 200 and `PROFILE_OUTPUT` selects the output path.
