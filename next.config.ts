import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // 'standalone' genera un servidor Node autónomo en .next/standalone, que es
  // lo que necesita Passenger (el motor de cPanel) para arrancar la app.
  output: "standalone",
};

export default nextConfig;
