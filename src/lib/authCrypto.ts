// Edge Runtime 互換の署名・検証ユーティリティ
const DEFAULT_DEV_SECRET = 'default_dev_secret_key_change_me_in_prod';

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

  // 本番環境（Vercelなど）での安全装置：SESSION_SECRETが未設定またはデフォルト値の場合は即座にエラー
  if (isProduction && (!secret || secret === DEFAULT_DEV_SECRET)) {
    throw new Error('【セキュリティ安全装置】本番環境では強力な SESSION_SECRET の設定が必須です。');
  }

  return secret || DEFAULT_DEV_SECRET;
}

export async function signSession(value: string): Promise<string> {
  const secret = getSessionSecret();
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', keyMaterial, encoder.encode(value));
  
  // ArrayBuffer to Hex string
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export async function verifySession(value: string, signature: string): Promise<boolean> {
  const expectedSignature = await signSession(value);
  return expectedSignature === signature;
}
