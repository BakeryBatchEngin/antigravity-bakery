import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import ExcelJS from 'exceljs';

async function getUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');
  if (!sessionCookie?.value) return null;
  try {
    return JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
  } catch { return null; }
}

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const tenantId = user.role === 'super_admin' ? null : user.tenant_id;

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.getWorksheet(1);
    if (!sheet) {
      return NextResponse.json({ error: 'Excelシートが見つかりません' }, { status: 400 });
    }

    const db = await getDb();
    
    // Excelからデータを読み取ってDough単位にまとめる
    const doughsMap = new Map<string, { dough_name: string, ingredients: any[] }>();

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // ヘッダーはスキップ
      
      const dough_id = row.getCell(1).text?.trim();
      const dough_name = row.getCell(2).text?.trim();
      const ingredient_code = row.getCell(3).text?.trim();
      const ingredient_name = row.getCell(4).text?.trim();
      const bakers_percent_text = row.getCell(5).text?.replace(/,/g, '').replace(/%/g, '')?.trim();

      if (!dough_id || !dough_name || !ingredient_code || !ingredient_name) return;

      const bakers_percent = bakers_percent_text ? parseFloat(bakers_percent_text) : 0;

      if (!doughsMap.has(dough_id)) {
        doughsMap.set(dough_id, { dough_name, ingredients: [] });
      }
      doughsMap.get(dough_id)?.ingredients.push({ ingredient_code, ingredient_name, bakers_percent });
    });

    let rowCount = 0;
    await db.run('BEGIN TRANSACTION');

    try {
      for (const [dough_id, data] of Array.from(doughsMap.entries())) {
        // 部分更新のため、Excelに存在する生地IDについてのみ一度削除して再挿入する
        if (tenantId) {
          await db.run('DELETE FROM doughs WHERE dough_id = ? AND tenant_id = ?', [dough_id, tenantId]);
        } else {
          await db.run('DELETE FROM doughs WHERE dough_id = ?', [dough_id]);
        }

        for (const ing of data.ingredients) {
          await db.run(`
            INSERT INTO doughs (dough_id, dough_name, ingredient_code, ingredient_name, bakers_percent, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            dough_id, data.dough_name, ing.ingredient_code, ing.ingredient_name, ing.bakers_percent, tenantId
          ]);
          rowCount++;
        }
      }

      await db.run('COMMIT');
      return NextResponse.json({ success: true, count: doughsMap.size });
    } catch (e) {
      await db.run('ROLLBACK');
      console.error('Database Error during import:', e);
      throw e;
    }
  } catch (error) {
    console.error('Import Excel Error:', error);
    return NextResponse.json({ error: 'Excelの読み込み・保存に失敗しました' }, { status: 500 });
  }
}
