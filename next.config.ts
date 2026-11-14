import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  // Legacy Channel webhooks carry a secret query token. Never print that URL.
  logging: { incomingRequests: { ignore: [/\/api\/webhooks\/channeltalk(?:[/?]|$)/] } },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ] }];
  },
};
export default nextConfig;
