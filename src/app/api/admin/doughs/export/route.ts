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

export async function GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: '認証エラー' }, { status: 401 });

    const db = await getDb();
    let rows;
    if (user.role === 'super_admin') {
      rows = await db.all('SELECT * FROM doughs ORDER BY dough_id ASC, ingredient_code ASC');
    } else {
      rows = await db.all('SELECT * FROM doughs WHERE tenant_id = ? ORDER BY dough_id ASC, ingredient_code ASC', [user.tenant_id]);
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('生地マスタ');

    sheet.columns = [
      { header: '生地コード', key: 'dough_id', width: 15 },
      { header: '生地名', key: 'dough_name', width: 30 },
      { header: '材料コード', key: 'ingredient_code', width: 15 },
      { header: '材料名', key: 'ingredient_name', width: 30 },
      { header: 'Bakers(%)', key: 'bakers_percent', width: 15 }
    ];

    // ヘッダーのスタイル
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };

    rows.forEach(row => {
      sheet.addRow({
        dough_id: row.dough_id,
        dough_name: row.dough_name,
        ingredient_code: row.ingredient_code,
        ingredient_name: row.ingredient_name,
        bakers_percent: row.bakers_percent
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="doughs_master.xlsx"',
      },
    });
  } catch (error) {
    console.error('Export Error:', error);
    return NextResponse.json({ error: 'Excelの生成に失敗しました' }, { status: 500 });
  }
}
