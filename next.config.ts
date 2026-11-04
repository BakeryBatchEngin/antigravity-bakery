import type { NextConfig } from "next";
import path from "path";
import os from "os";

const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

// ローカルネットワーク内の端末（スマホ・タブレット等）からのアクセスを許可するIP一覧
function getLocalDevOrigins(): string[] {
  const origins = new Set<string>([
    'localhost',
    '127.0.0.1',
    '192.168.11.44', // 現在のローカルIP
    '192.168.*.*',
    '10.*.*.*',
    '172.*.*.*',
  ]);

  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          origins.add(net.address);
        }
      }
    }
  } catch {
    // 取得失敗時はデフォルトリストを使用
  }

  return Array.from(origins);
}

const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  agentRules: false,
  // スマホやLAN内タブレットから開発サーバーへ安全に接続できるよう許可オリジンを設定
  allowedDevOrigins: getLocalDevOrigins(),
  async headers() {
    // 開発環境（ローカルIPやスマホ検証）ではHSTS等のセキュリティヘッダーによるブラウザのブロックを防ぐため、本番のみ適用
    if (!isProduction) {
      return [];
    }
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
