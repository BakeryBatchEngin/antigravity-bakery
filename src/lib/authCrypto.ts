// Edge Runtime 互換の署名・検証ユーティリティ
const SECRET = process.env.SESSION_SECRET || 'default_dev_secret_key_change_me_in_prod';

export async function signSession(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SECRET),
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
