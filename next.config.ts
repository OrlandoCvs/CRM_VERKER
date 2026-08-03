import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Prisma se carga desde node_modules en runtime (no empaquetado en el bundle),
  // que es lo recomendado para que resuelva su engine nativo correctamente.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
