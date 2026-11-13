import { getDb } from './db';

export type ActivityCategory = 
  | 'auth'        // ログイン・ログアウト
  | 'order'       // 発注・週間オーダー取込
  | 'production'  // 仕込み計画・確定・追加バッチ
  | 'master'      // 商品・材料・生地等のマスタ変更
  | 'xmas'        // クリスマス予約・上限・ロック
  | 'loss'        // ロス・廃棄登録
  | 'system';     // システム設定・ユーザー管理

export interface LogActivityOptions {
  userId?: number | null;
  storeId?: number | null;
  tenantId?: number | null;
  action: 'LOGIN' | 'LOGOUT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'EXECUTE' | 'RESET' | string;
  category?: ActivityCategory;
  tableName: string;
  recordId?: string | number | null;
  description: string;
  oldData?: any;
  newData?: any;
  ipAddress?: string | null;
}

export type SecuritySeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type SecurityEventType = 
  | 'AUTH_FAILURE'           // ログイン失敗（パスワード間違い・存在しないユーザー）
  | 'ACCOUNT_LOCKED'         // アカウント連続失敗による自動ロックアウト
  | 'AUTH_LOCKED'            // ロック中アカウントへのログイン試行遮断
  | 'INVALID_SIGNATURE'       // Cookie署名不一致・セッション偽造試行
  | 'FORBIDDEN_STORE_ACCESS'  // 他社・非担当店舗へのアクセス遮断
  | 'FORBIDDEN_ROLE_ACCESS'   // 権限外APIへのリクエスト遮断
  | 'SUSPICIOUS_REQUEST'      // 不正なパラメータ・改ざん試行
  | 'SYSTEM_ERROR';           // 重大なサーバー内部例外

export interface LogSecurityOptions {
  tenantId?: number | null;
  userId?: number | null;
  usernameAttempted?: string | null;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  message: string;
  actionAdvice?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  endpoint?: string | null;
  metadata?: any;
}

/**
 * リクエストヘッダーからIPアドレスとユーザーエージェントを抽出するヘルパー
 */
export function getRequestMeta(request?: Request | null): { ip: string | null; userAgent: string | null } {
  if (!request) {
    return { ip: null, userAgent: null };
  }

  const headers = request.headers;
  const forwarded = headers.get('x-forwarded-for');
  const realIp = headers.get('x-real-ip');
  const ip = forwarded ? forwarded.split(',')[0].trim() : (realIp || null);
  const userAgent = headers.get('user-agent') || null;

  return { ip, userAgent };
}

/**
 * 企業管理者向け：日常の業務・作業ログを安全に記録します。
 * 【完全フェイルセーフ設計】
 * DBエラー等が発生しても例外を投げず、通常業務処理を絶対に中断させません。
 */
export async function logActivity(options: LogActivityOptions): Promise<void> {
  try {
    const db = await getDb();
    
    // tenantId が渡されていない場合、storeId または userId から補完を試みる
    let effectiveTenantId = options.tenantId ?? null;
    if (effectiveTenantId === null && options.storeId) {
      try {
        const store = await db.get('SELECT tenant_id FROM stores WHERE id = $1', [options.storeId]);
        if (store?.tenant_id) {
          effectiveTenantId = store.tenant_id;
        }
      } catch {
        // 補完失敗時はそのまま
      }
    }
    if (effectiveTenantId === null && options.userId) {
      try {
        const u = await db.get('SELECT tenant_id FROM users WHERE id = $1', [options.userId]);
        if (u?.tenant_id) {
          effectiveTenantId = u.tenant_id;
        }
      } catch {
        // 補完失敗時はそのまま
      }
    }

    const oldJson = options.oldData !== undefined ? JSON.stringify(options.oldData) : null;
    const newJson = options.newData !== undefined ? JSON.stringify(options.newData) : null;

    await db.run(`
      INSERT INTO audit_logs (
        tenant_id, user_id, store_id, action, category, table_name,
        record_id, description, ip_address, old_data, new_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      effectiveTenantId,
      options.userId ?? null,
      options.storeId ?? null,
      options.action,
      options.category || 'general',
      options.tableName,
      options.recordId != null ? String(options.recordId) : null,
      options.description,
      options.ipAddress ?? null,
      oldJson,
      newJson,
    ]);
  } catch (err) {
    // ログ記録の失敗が業務処理を止めないよう、サーバーログにのみ記録
    console.error('Failed to write activity log (failsafe):', err);
  }
}

/**
 * Superadmin向け：セキュリティ監査・アクセスログを安全に記録します。
 * 【完全フェイルセーフ設計】
 */
export async function logSecurityEvent(options: LogSecurityOptions): Promise<void> {
  try {
    const db = await getDb();

    // デフォルトのアクション推奨ガイダンス
    let advice = options.actionAdvice;
    if (!advice) {
      switch (options.eventType) {
        case 'AUTH_FAILURE':
          advice = '連続して発生していないか確認してください。単発の場合はユーザーの打ち間違いの可能性が高いです。';
          break;
        case 'ACCOUNT_LOCKED':
        case 'AUTH_LOCKED':
          advice = 'パスワードが5回連続で間違えられたため自動ロックされました。店舗スタッフからの問い合わせ（パスワード忘れ）がないか確認してください。';
          break;
        case 'INVALID_SIGNATURE':
          advice = 'Cookie署名の不一致を検知し即座に遮断しました。期限切れCookieまたは不正な改ざんの疑いがあります。リクエストは安全に防がれています。';
          break;
        case 'FORBIDDEN_STORE_ACCESS':
          advice = '自社以外の店舗へのアクセスが試みられましたが、ガードにより安全に遮断されました。誤操作または不正URL直接アクセスの疑いがあります。';
          break;
        case 'FORBIDDEN_ROLE_ACCESS':
          advice = '権限のない管理機能への直接リクエストが遮断されました。';
          break;
        case 'SUSPICIOUS_REQUEST':
          advice = '不正なパラメータや改ざん試行を検知しブロックしました。同一IPからのアクセスが頻発する場合はIP制限を検討してください。';
          break;
        default:
          advice = 'エラーログを確認し、必要に応じて開発チームにご連絡ください。';
      }
    }

    const metaJson = options.metadata !== undefined ? JSON.stringify(options.metadata) : null;

    await db.run(`
      INSERT INTO security_logs (
        tenant_id, user_id, username_attempted, event_type, severity,
        message, action_advice, ip_address, user_agent, endpoint, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      options.tenantId ?? null,
      options.userId ?? null,
      options.usernameAttempted ?? null,
      options.eventType,
      options.severity,
      options.message,
      advice,
      options.ipAddress ?? null,
      options.userAgent ?? null,
      options.endpoint ?? null,
      metaJson,
    ]);
  } catch (err) {
    console.error('Failed to write security log (failsafe):', err);
  }
}
