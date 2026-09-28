import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@venueloom/importer", "@venueloom/integrations"]
};

export default nextConfig;
