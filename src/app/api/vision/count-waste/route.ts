import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId } from '@/lib/lossStore';

export async function POST(req: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const { imageBase64, products } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: '画像が提供されていません。' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'サーバーに GEMINI_API_KEY が設定されていません。' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

    const db = await getDb();
    
    // 操作対象の店舗を決定（学習データをその店舗に絞るため）
    const resolved = await resolveLossStoreId(db, user);
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const storeId = resolved.storeId;

    // 過去の学習データ（正解済みの画像と結果）を最大3件取得
    const pastLogs = await db.all(
      `SELECT image_base64, results_json FROM waste_photo_logs WHERE store_id = $1 ORDER BY created_at DESC LIMIT 3`,
      [storeId]
    );

    // Base64 からプレフィックス (例: data:image/jpeg;base64,) を削除
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const productListText = products.map((p: any) => `- ${p.product_code}: ${p.product_name}`).join('\n');

    let prompt = `
あなたは優秀なベーカリーの販売スタッフです。
画像に写っている売れ残ったパンの種類と数を正確にカウントしてください。
対象となるパンは以下のリストに含まれるもののみです。

対象リスト:
${productListText}

【重要】
結果は以下の形式のJSON配列のみで返してください（Markdownのバッククォートなどの修飾は一切不要です）。
[
  { "product_code": "P001", "product_name": "パンの名前", "count": 2 }
]
`;

    // Few-shot Prompting: 過去の画像を履歴（文脈）として渡す
    const contents: any[] = [];

    // 学習データがあれば、User(画像)->Model(JSON) の対話履歴として追加する
    if (pastLogs && pastLogs.length > 0) {
      for (const log of pastLogs) {
        const pastBase64 = log.image_base64.replace(/^data:image\/\w+;base64,/, "");
        
        // 過去の画像をUserからの入力として扱う
        contents.push({
          role: "user",
          parts: [
            { text: "この画像のロスパンをカウントしてJSONで返して。" },
            { inlineData: { data: pastBase64, mimeType: "image/jpeg" } }
          ]
        });
        // その時の正解データをModelの返答として扱う
        contents.push({
          role: "model",
          parts: [
            { text: log.results_json }
          ]
        });
      }
    }

    // 今回のリクエストを追加
    contents.push({
      role: "user",
      parts: [
        { text: prompt },
        { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
      ]
    });

    const result = await model.generateContent({ contents });
    const text = result.response.text();
    
    // JSONのパース（Markdownのコードブロックが含まれている場合の対処）
    const jsonStr = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(jsonStr);

    return NextResponse.json({ result: parsedData });
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: '画像の解析に失敗しました。', details: error.message }, { status: 500 });
  }
}
