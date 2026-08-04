import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The design system ships TypeScript source, not a build step.
  transpilePackages: ['@reliance/ui'],
  typedRoutes: true,
  experimental: {
    // The repo is pinned to TypeScript 7, whose compiler API Next cannot drive in-process
    // ("does not provide the compiler API required by Next.js"). Shelling out to the `tsc`
    // CLI is the supported alternative and produces the same diagnostics.
    useTypeScriptCli: true,
  },
};

export default config;
