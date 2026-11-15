/** @type {import('next').NextConfig} */
// roots pinned to this dir: the workspace lives inside another repo (agentic-react) that has its own lockfile
const nextConfig = { outputFileTracingRoot: import.meta.dirname, turbopack: { root: import.meta.dirname } }

export default nextConfig
