import type { NextConfig } from "next"

const localIp = process.env.LOCAL_DEV_IP || ""
const httpsDev = process.env.HTTPS_DEV || ""

const nextConfig: NextConfig = {
  // Allow the ngrok tunnel host to access dev resources (HMR, etc.).
  allowedDevOrigins: [localIp, httpsDev],
}

export default nextConfig
