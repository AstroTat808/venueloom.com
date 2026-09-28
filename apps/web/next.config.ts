import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@venueloom/importer", "@venueloom/integrations", "@venueloom/database", "@venueloom/jobs"]
};

export default nextConfig;
