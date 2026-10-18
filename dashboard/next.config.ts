import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/suppliers": ["../data/brakes/source/real_brake_suppliers.csv"],
    "/api/research": ["../data/brakes/source/real_brake_suppliers.csv"],
    "/": ["../data/brakes/source/real_brake_suppliers.csv"],
  },
};

export default nextConfig;
