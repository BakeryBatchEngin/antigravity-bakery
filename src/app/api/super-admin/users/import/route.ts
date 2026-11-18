import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';

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

// 日本語のロール名・表記揺れをシステムロール値に変換
function normalizeRole(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  // 直接マッチ
  const validRoles = [
    'chef', 'manager', 'master', 'admin', 'super_admin',
    'store_loss_manager', 'company_loss_manager', 'area_loss_manager',
    'tokyo_store', 'regional_store', 'xmas_factory', 'xmas_headquarters', 'xmas_manager'
  ];
  if (validRoles.includes(s)) return s;

  // 日本語表記のマッピング
  if (s.includes('エリアロス') || s.includes('エリア統括') || s === 'area_loss_manager') return 'area_loss_manager';
  if (s.includes('企業ロス') || s.includes('ロス統括')) return 'company_loss_manager';
  if (s.includes('店舗ロス') || s.includes('ロス管理')) return 'store_loss_manager';
  if (s.includes('シェフ')) return 'chef';
  if (s.includes('店長') || s.includes('マネージャ')) return 'manager';
  if (s.includes('マスター')) return 'master';
  if (s.includes('スーパー') || s.includes('最上位')) return 'super_admin';
  if (s.includes('企業ロス') || s.includes('ロス統括')) return 'company_loss_manager';
  if (s.includes('店舗ロス') || s.includes('ロス管理')) return 'store_loss_manager';
  if (s.includes('東京')) return 'tokyo_store';
  if (s.includes('地方')) return 'regional_store';
  if (s.includes('工場')) return 'xmas_factory';
  if (s.includes('本部')) return 'xmas_headquarters';
  if (s.includes('クリスマス')) return 'xmas_manager';
  if (s === '管理者' || s === 'admin') return 'admin';

  return null;
}

// POST: ユーザーデータのExcel一括登録
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

    // テナント情報を取得（コードおよび名前の両方で引けるようにする）
    const tenants = await db.all(`SELECT id, tenant_code, tenant_name FROM tenants`);
    const tenantMap = new Map<string, number>();
    for (const t of tenants) {
      if (t.tenant_code) tenantMap.set(String(t.tenant_code).trim().toUpperCase(), t.id);
      if (t.tenant_name) tenantMap.set(String(t.tenant_name).trim(), t.id);
    }

    // 全店舗情報を取得（tenant_id + store_code -> store_id）
    const stores = await db.all(`SELECT id, store_code, store_name, tenant_id FROM stores`);
    const storeMap = new Map<string, number>();
    for (const s of stores) {
      const codeKey = `${s.tenant_id}_${String(s.store_code).trim().toUpperCase()}`;
      storeMap.set(codeKey, s.id);
      // コードのみでも一意に特定できる場合のフォールバック用
      storeMap.set(`CODE_${String(s.store_code).trim().toUpperCase()}`, s.id);
    }

    // 既存ユーザー名を取得
    const existingUsers = await db.all(`SELECT username FROM users`);
    const existingUsernames = new Set(existingUsers.map((u: any) => String(u.username).trim().toLowerCase()));

    // 1行目のヘッダーから列番号を動的に特定
    const headerRow = worksheet.getRow(1);
    let tenantCol = 1;
    let usernameCol = 2;
    let displayNameCol = 3;
    let roleCol = 4;
    let passwordCol = 5;
    let pinCol = 6;
    let storesCol = 7;

    for (let c = 1; c <= headerRow.cellCount; c++) {
      const text = getCellText(headerRow.getCell(c).value).replace(/\s+/g, '');
      if (text.includes('会社') || text.includes('テナント')) tenantCol = c;
      else if (text.includes('ユーザー名') || text.includes('ログインID') || text.includes('アカウント名')) usernameCol = c;
      else if (text.includes('表示名') || text.includes('氏名') || text.includes('名前')) displayNameCol = c;
      else if (text.includes('権限') || text.includes('ロール') || text.includes('役職')) roleCol = c;
      else if (text.includes('パスワード') || text.includes('PW')) passwordCol = c;
      else if (text.includes('PIN') || text.includes('ピン') || text.includes('暗証番号')) pinCol = c;
      else if (text.includes('店舗') || text.includes('担当店舗') || text.includes('所属店舗')) storesCol = c;
    }

    const rowsToInsert: {
      tenant_id: number | null;
      username: string;
      display_name: string;
      role: string;
      password_hash: string | null;
      pin_hash: string | null;
      store_ids: number[];
    }[] = [];

    const errors: string[] = [];
    const skipped: string[] = [];
    const seenUsernames = new Set<string>();

    for (let r = 2; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const tenantKey = getCellText(row.getCell(tenantCol).value);
      const username = getCellText(row.getCell(usernameCol).value);
      const displayName = getCellText(row.getCell(displayNameCol).value);
      const roleRaw = getCellText(row.getCell(roleCol).value);
      const password = getCellText(row.getCell(passwordCol).value);
      const pinCode = getCellText(row.getCell(pinCol).value);
      const storesText = getCellText(row.getCell(storesCol).value);

      // 空行はスキップ
      if (!tenantKey && !username && !displayName && !roleRaw) continue;

      if (!username || !displayName || !roleRaw) {
        errors.push(`${r}行目: ユーザー名・表示名・権限は必須です`);
        continue;
      }

      // ロールの検証
      const role = normalizeRole(roleRaw);
      if (!role) {
        errors.push(`${r}行目: 権限「${roleRaw}」は無効です（例: シェフ, 店長, 店舗ロス管理者, admin など）`);
        continue;
      }

      // 会社（テナント）の検証（super_admin以外は必須）
      let tenantId: number | null = null;
      if (role !== 'super_admin') {
        if (!tenantKey) {
          errors.push(`${r}行目: 権限「${roleRaw}」には所属会社の指定が必須です`);
          continue;
        }
        tenantId = tenantMap.get(tenantKey.toUpperCase()) || tenantMap.get(tenantKey) || null;
        if (!tenantId) {
          errors.push(`${r}行目: 会社「${tenantKey}」が存在しません`);
          continue;
        }
      }

      // 重複チェック
      const lowerUsername = username.toLowerCase();
      if (existingUsernames.has(lowerUsername)) {
        skipped.push(`${username}（${displayName}）: 既に登録済み`);
        continue;
      }
      if (seenUsernames.has(lowerUsername)) {
        errors.push(`${r}行目: ユーザー名「${username}」がExcel内で重複しています`);
        continue;
      }
      seenUsernames.add(lowerUsername);

      // 担当店舗コードの解決
      const storeIds: number[] = [];
      if (storesText && tenantId) {
        const rawStoreCodes = storesText.split(/[,、/;\s]+/).filter(Boolean);
        for (const sc of rawStoreCodes) {
          const upperSc = sc.trim().toUpperCase();
          const sid = storeMap.get(`${tenantId}_${upperSc}`) || storeMap.get(`CODE_${upperSc}`);
          if (sid) {
            storeIds.push(sid);
          } else {
            errors.push(`${r}行目: 指定された店舗コード「${sc}」が見つかりません`);
          }
        }
      }

      // パスワード & PIN のハッシュ化
      const passwordHash = password && password.length > 0
        ? await bcrypt.hash(password, 10)
        : null;
      const pinHash = pinCode && pinCode.length > 0
        ? await bcrypt.hash(pinCode, 10)
        : null;

      rowsToInsert.push({
        tenant_id: tenantId,
        username,
        display_name: displayName,
        role,
        password_hash: passwordHash,
        pin_hash: pinHash,
        store_ids: storeIds,
      });
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
          error: '新規に登録できるユーザーデータがありませんでした',
          details: skipped.length > 0 ? `すべてのユーザーが既に登録済みです（${skipped.slice(0, 5).join('、')} など）` : 'データ行が見つかりませんでした',
        },
        { status: 400 }
      );
    }

    // トランザクションで一括登録
    await db.transaction(async (txDb) => {
      for (const item of rowsToInsert) {
        await txDb.run(
          `INSERT INTO users (username, display_name, role, password, pin_code, tenant_id, failed_attempts, locked_until)
           VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
          [item.username, item.display_name, item.role, item.password_hash, item.pin_hash, item.tenant_id]
        );

        // 作成したユーザーのIDを取得して店舗を紐付け
        if (item.store_ids.length > 0) {
          const newUser = await txDb.get(`SELECT id FROM users WHERE username = ?`, [item.username]);
          if (newUser) {
            for (const sid of item.store_ids) {
              await txDb.run(
                `INSERT INTO user_stores (user_id, store_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
                [newUser.id, sid]
              );
            }
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `${rowsToInsert.length} 名のユーザーを正常に一括登録しました！`,
      count: rowsToInsert.length,
      skippedCount: skipped.length,
      skippedSample: skipped.slice(0, 5),
    });
  } catch (error: any) {
    console.error('Super-admin users import error:', error);
    return NextResponse.json(
      { error: 'ユーザーの一括登録に失敗しました', details: error.message },
      { status: 500 }
    );
  }
}
