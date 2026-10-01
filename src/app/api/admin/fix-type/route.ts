import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const db = await getDb();
    
    // 1. まず現在のカラムを確認する
    let columns = [];
    try {
      const res = await db.all(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'ingredients'
      `);
      columns = res.map((r: any) => r.column_name);
    } catch (e: any) {
      return NextResponse.json({ error: 'Failed to query columns: ' + e.message }, { status: 500 });
    }

    if (columns.includes('type')) {
      return NextResponse.json({ success: true, message: 'Column type already exists', columns });
    }

    // 2. カラムを追加する
    try {
      await db.run("ALTER TABLE ingredients ADD COLUMN type TEXT DEFAULT 'material'");
      columns.push('type');
      return NextResponse.json({ success: true, message: 'Added column type', columns });
    } catch (e: any) {
      return NextResponse.json({ error: 'Failed to add column: ' + e.message }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
