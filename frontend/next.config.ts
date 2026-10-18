import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/suppliers": ["../data/eval/source/supplier_risk_data.csv"],
    "/": ["../data/eval/source/supplier_risk_data.csv"],
  },
};

export default nextConfig;
