import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The design system ships TypeScript source, not a build step.
  transpilePackages: ['@reliance/ui'],
  typedRoutes: true,
  experimental: {
    /**
     * The repo is pinned to TypeScript 7, whose compiler API Next 16 cannot drive in-process — the
     * build stops with "TypeScript 7.0.2 does not provide the compiler API required by Next.js".
     * This makes Next shell out to `tsc` instead, which TypeScript 7 does support. Remove it if the
     * repo ever moves back to TypeScript 6.
     */
    useTypeScriptCli: true,
  },
};

export default config;
