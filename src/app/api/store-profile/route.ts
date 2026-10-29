import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { resolveLossStoreId } from '@/lib/lossStore';

// 店舗プロファイル（営業時間・立地条件）API
export async function GET(req: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const db = await getDb(user);
    const resolved = await resolveLossStoreId(db, user);
    if (resolved.error || !resolved.storeId) {
      return NextResponse.json({ error: resolved.error || '店舗が特定できません' }, { status: resolved.status || 400 });
    }
    const storeId = resolved.storeId;

    const store = await db.get('SELECT id, store_name, store_code FROM stores WHERE id = ?', [storeId]);
    const profile = await db.get('SELECT business_hours, location_characteristics FROM store_profiles WHERE store_id = ?', [storeId]);

    let businessHours = null;
    if (profile?.business_hours) {
      try {
        businessHours = JSON.parse(profile.business_hours);
      } catch (e) {
        businessHours = null;
      }
    }

    return NextResponse.json({
      store: {
        id: store.id,
        name: store.store_name,
        code: store.store_code,
      },
      businessHours: businessHours || {
        mon: { open: '08:00', close: '20:00', closed: false },
        tue: { open: '08:00', close: '20:00', closed: false },
        wed: { open: '08:00', close: '20:00', closed: false },
        thu: { open: '08:00', close: '20:00', closed: false },
        fri: { open: '08:00', close: '20:00', closed: false },
        sat: { open: '08:00', close: '20:00', closed: false },
        sun_hol: { open: '08:00', close: '20:00', closed: false },
      },
      locationCharacteristics: profile?.location_characteristics || '',
    });
  } catch (error: any) {
    console.error('Error fetching store profile:', error);
    return NextResponse.json({ error: '店舗プロファイルの取得に失敗しました', details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { user, error } = await getSessionUser();
    if (error || !user) {
      return NextResponse.json({ error: '認証エラー' }, { status: 401 });
    }

    const db = await getDb(user);
    const resolved = await resolveLossStoreId(db, user);
    if (resolved.error || !resolved.storeId) {
      return NextResponse.json({ error: resolved.error || '店舗が特定できません' }, { status: resolved.status || 400 });
    }
    const storeId = resolved.storeId;

    const body = await req.json();
    const { businessHours, locationCharacteristics } = body;

    const businessHoursJson = JSON.stringify(businessHours || {});
    const locationText = String(locationCharacteristics || '').trim();

    await db.transactionWithUser(user.id, storeId, user.role, async (txDb) => {
      const existing = await txDb.get('SELECT id FROM store_profiles WHERE store_id = ?', [storeId]);
      if (existing) {
        await txDb.run(
          `UPDATE store_profiles
           SET business_hours = ?, location_characteristics = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [businessHoursJson, locationText, existing.id]
        );
      } else {
        await txDb.run(
          `INSERT INTO store_profiles (store_id, business_hours, location_characteristics)
           VALUES (?, ?, ?)`,
          [storeId, businessHoursJson, locationText]
        );
      }
    });

    return NextResponse.json({ success: true, message: '店舗基礎データを保存しました。' });
  } catch (error: any) {
    console.error('Error saving store profile:', error);
    return NextResponse.json({ error: '店舗基礎データの保存に失敗しました', details: error.message }, { status: 500 });
  }
}
