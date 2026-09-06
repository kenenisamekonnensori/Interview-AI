import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@interviewer-ai/config",
    "@interviewer-ai/shared",
    "@interviewer-ai/types",
    "@interviewer-ai/ui",
  ],
};

export default nextConfig;
