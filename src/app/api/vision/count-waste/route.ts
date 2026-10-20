import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId } from '@/lib/lossStore';

// Data URI (data:image/jpeg;base64,...) から mimeType と純粋な Base64 文字列を抽出するヘルパー
function extractBase64AndMime(dataUri: string): { mimeType: string; base64Data: string } {
  const match = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64Data: match[2] };
  }
  return {
    mimeType: 'image/jpeg',
    base64Data: dataUri.replace(/^data:image\/\w+;base64,/, ''),
  };
}

export async function POST(req: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー：ログインし直してください。' }, { status: 401 });
    }

    const { imageBase64, products } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: '画像が提供されていません。' }, { status: 400 });
    }

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { error: '対象日の販売商品リストが空です。先にオーダー表を取り込んでください。' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'サーバーに GEMINI_API_KEY が設定されていません。管理者にお問い合わせください。' },
        { status: 500 }
      );
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const db = await getDb();

    // 操作対象の店舗を決定（学習データをその店舗に絞るため）
    const resolved = await resolveLossStoreId(db, user);
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const storeId = resolved.storeId;

    // 過去の学習データ：通信速度を落とさないよう、500KB以下の軽量な直近1件のみ画像を取得し、
    // 過去3件分の正解JSONはテキスト参考資料として高速に読み込む
    const pastLogs = await db.all(
      `SELECT
         CASE WHEN LENGTH(image_base64) <= 500000 THEN image_base64 ELSE NULL END AS image_base64,
         results_json
       FROM waste_photo_logs
       WHERE store_id = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [storeId]
    );

    const { mimeType, base64Data } = extractBase64AndMime(imageBase64);

    const productListText = products
      .map((p: any) => `- "${p.product_code}": ${p.product_name}`)
      .join('\n');

    const prompt = `あなたはベーカリー店舗のロス管理スタッフです。
画像に写っているパンの種類と個数を素早く正確に数えてください。
対象は以下のリストに含まれる商品のみです。パンの見た目や値札（プライスカード）の文字を手がかりに判定し、写っている商品（1個以上）のみをJSON配列で返してください。

【対象商品リスト】
${productListText}

【出力形式（JSON配列のみ）】
[{"product_code": "商品コード", "product_name": "商品名", "count": 数値}]`;

    const contents: any[] = [];

    // 速度と精度のバランスを最大化するため、直近1件の軽量画像があればお手本として添付
    const latestWithImage = pastLogs?.find((log: any) => log.image_base64 && log.results_json);
    if (latestWithImage) {
      const pastImg = extractBase64AndMime(latestWithImage.image_base64);
      contents.push({
        role: 'user',
        parts: [
          { text: 'この店舗の棚画像からロスパンの種類と個数をカウントしてJSON配列で返してください。' },
          { inlineData: { data: pastImg.base64Data, mimeType: pastImg.mimeType } },
        ],
      });
      contents.push({
        role: 'model',
        parts: [{ text: latestWithImage.results_json }],
      });
    }

    // 今回の撮影画像とプロンプトを追加
    contents.push({
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { data: base64Data, mimeType } },
      ],
    });

    // Gemini REST API を直接呼び出し、thinkingLevel: 'LOW' を確実に適用して応答速度を最大化する
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            thinkingConfig: {
              thinkingLevel: 'LOW',
            },
          },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      throw new Error(geminiData?.error?.message || `Gemini API error (${geminiRes.status})`);
    }

    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    // JSONのパース（万が一 Markdown コードブロックが含まれていても安全に除去）
    const jsonStr = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(jsonStr);

    // 配列形式のバリデーションと正規化
    const validCodes = new Set(products.map((p: any) => String(p.product_code)));
    const normalized = Array.isArray(parsedData)
      ? parsedData
          .filter(
            (item: any) =>
              item &&
              typeof item.product_code === 'string' &&
              validCodes.has(item.product_code) &&
              Number(item.count) > 0
          )
          .map((item: any) => ({
            product_code: String(item.product_code),
            product_name: String(item.product_name || ''),
            count: Math.max(0, Math.round(Number(item.count) || 0)),
          }))
      : [];

    return NextResponse.json({ result: normalized });
  } catch (error: any) {
    console.error('Gemini Vision API Error:', error);
    return NextResponse.json(
      { error: 'AIによる画像の解析に失敗しました。', details: error.message },
      { status: 500 }
    );
  }
}
