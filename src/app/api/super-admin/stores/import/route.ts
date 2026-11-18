import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import ExcelJS from 'exceljs';

async function checkSuperAdmin() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('bakery_session');
  if (!sessionCookie?.value) return null;
  try {
    const user = JSON.parse(Buffer.from(sessionCookie.value, 'base64').toString('utf-8'));
    return user.role === 'super_admin' ? user : null;
  } catch {
    return null;
  }
}

// セルの値から安全に文字列を取得
function getCellText(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if ('richText' in (val as any)) {
      return (val as any).richText.map((t: any) => t.text).join('').trim();
    }
    if ('text' in (val as any)) {
      return String((val as any).text ?? '').trim();
    }
    if ('result' in (val as any)) {
      return String((val as any).result ?? '').trim();
    }
  }
  return String(val).trim();
}

// POST: 店舗データのExcel一括登録
export async function POST(request: Request) {
  const admin = await checkSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: '最上位管理者（super_admin）の権限が必要です' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'Excelファイルが選択されていません' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return NextResponse.json({ error: 'ワークシートが見つかりません' }, { status: 400 });
    }

    const db = await getDb(admin);

    // テナント情報を取得してMap化（コードおよび名前の両方で引けるようにする）
    const tenants = await db.all(`SELECT id, tenant_code, tenant_name FROM tenants`);
    const tenantMap = new Map<string, number>();
    for (const t of tenants) {
      if (t.tenant_code) tenantMap.set(String(t.tenant_code).trim().toUpperCase(), t.id);
      if (t.tenant_name) tenantMap.set(String(t.tenant_name).trim(), t.id);
    }

    // 既存店舗のコード一覧を取得
    const existingStores = await db.all(`SELECT store_code FROM stores`);
    const existingCodes = new Set(existingStores.map((s: any) => String(s.store_code).trim().toUpperCase()));

    // 1行目のヘッダーから列番号を動的に特定
    const headerRow = worksheet.getRow(1);
    let tenantCol = 1;
    let codeCol = 2;
    let nameCol = 3;

    for (let c = 1; c <= headerRow.cellCount; c++) {
      const text = getCellText(headerRow.getCell(c).value).replace(/\s+/g, '');
      if (text.includes('会社') || text.includes('テナント')) tenantCol = c;
      else if (text.includes('店舗コード') || text === 'コード') codeCol = c;
      else if (text.includes('店舗名') || text === '店名') nameCol = c;
    }

    const rowsToInsert: { tenant_id: number; store_code: string; store_name: string }[] = [];
    const errors: string[] = [];
    const skipped: string[] = [];
    const seenInExcel = new Set<string>();

    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const tenantKey = getCellText(row.getCell(tenantCol).value);
      const storeCode = getCellText(row.getCell(codeCol).value).toUpperCase();
      const storeName = getCellText(row.getCell(nameCol).value);

      // 空行はスキップ
      if (!tenantKey && !storeCode && !storeName) continue;

      if (!tenantKey || !storeCode || !storeName) {
        errors.push(`${r}行目: 会社コード・店舗コード・店舗名はすべて必須です`);
        continue;
      }

      // 会社が存在するか確認
      const tenantId = tenantMap.get(tenantKey.toUpperCase()) || tenantMap.get(tenantKey);
      if (!tenantId) {
        errors.push(`${r}行目: 会社「${tenantKey}」が存在しません`);
        continue;
      }

      // 重複チェック（DB内およびExcel内）
      if (existingCodes.has(storeCode)) {
        skipped.push(`${storeCode}（${storeName}）: 既に登録済み`);
        continue;
      }
      if (seenInExcel.has(storeCode)) {
        errors.push(`${r}行目: 店舗コード「${storeCode}」がExcel内で重複しています`);
        continue;
      }

      seenInExcel.add(storeCode);
      rowsToInsert.push({ tenant_id: tenantId, store_code: storeCode, store_name: storeName });
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: `Excelデータに ${errors.length} 件の不備があります`,
          details: errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n...他 ${errors.length - 10} 件` : ''),
        },
        { status: 400 }
      );
    }

    if (rowsToInsert.length === 0) {
      return NextResponse.json(
        {
          error: '新規に登録できる店舗データがありませんでした',
          details: skipped.length > 0 ? `すべての店舗コードが既に登録済みです（${skipped.slice(0, 5).join('、')} など）` : 'データ行が見つかりませんでした',
        },
        { status: 400 }
      );
    }

    // トランザクションで一括登録
    await db.transaction(async (txDb) => {
      for (const item of rowsToInsert) {
        await txDb.run(
          `INSERT INTO stores (store_code, store_name, tenant_id) VALUES (?, ?, ?)`,
          [item.store_code, item.store_name, item.tenant_id]
        );
      }
    });

    return NextResponse.json({
      success: true,
      message: `${rowsToInsert.length} 件の店舗を正常に一括登録しました！`,
      count: rowsToInsert.length,
      skippedCount: skipped.length,
      skippedSample: skipped.slice(0, 5),
    });
  } catch (error: any) {
    console.error('Super-admin stores import error:', error);
    return NextResponse.json(
      { error: '店舗の一括登録に失敗しました', details: error.message },
      { status: 500 }
    );
  }
}
