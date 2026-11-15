`next build --webpack` now fails with a WebAssembly-related webpack error after someone "cleaned up" next.config.js. Fix the config. We must stay on webpack (`--webpack`); don't switch to Turbopack.
