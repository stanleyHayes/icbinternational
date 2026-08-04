import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The design system ships TypeScript source, not a build step.
  transpilePackages: ['@reliance/ui'],
  typedRoutes: true,
  experimental: {
    // The repo is on TypeScript 7, whose compiler API Next cannot drive directly: without
    // this the build stops at "TypeScript 7.0.2 does not provide the compiler API required
    // by Next.js". The flag makes Next shell out to `tsc` instead, which 7 does provide.
    useTypeScriptCli: true,
  },
};

export default config;
