const fs = require('fs');

const addition = `
## 4. ローカル/本番環境の差異に関する厳格なルール (Local vs Production Differences)
本プロジェクトでは、開発環境（ローカル）と本番環境（Vercel/PostgreSQL）の仕様差異によって、ローカルで動いても本番でエラーになるケースが頻発しています。AIは実装およびデプロイ前に**必ず以下の4点を確認・徹底**してください。

1. **データベースのスキーマ・マイグレーションの同期**
   - ローカルの \`initDb()\` （\`src/lib/db.ts\` 等）によるテーブル自動作成や \`ALTER TABLE\` によるカラム追加は、**本番環境（Vercel）では安全装置により実行されません**。
   - 新しいテーブルやカラムを追加した場合は、必ず本番データベース（Supabase PostgreSQL）に対しても同等のマイグレーション（例：専用のマイグレーションAPIの作成やSQLスクリプトの実行）を忘れずに行う計画を立てること。

2. **PostgreSQL固有の厳格な文法制約**
   - SQLiteでは許容される構文でも、PostgreSQLではエラーになる場合があります。
   - 特に \`ON CONFLICT (カラム名)\` を使用する際は、指定したカラムが**PostgreSQL側で確実にPRIMARY KEYまたはUNIQUE制約となっているか**を必ず確認すること。不明確な場合は \`ON CONFLICT\` を避け、\`SELECT\` で存在確認後に \`UPDATE\` または \`INSERT\` を行うロジック（UPSERT）を推奨します。

3. **TypeScriptのエラーと型チェックの徹底**
   - VercelのビルドプロセスはTypeScriptの型チェック（\`next build\`）を厳格に行います。
   - 例：\`catch (error)\` の \`error\` は \`unknown\` 型として扱われるため、\`error.message\` を参照するとコンパイルエラー（ビルド失敗）になります。必ず \`catch (error: any)\` のように型を指定するか、適切な型ガードを実装すること。
   - デプロイ前に、AI自身がローカルで \`npx next build\` を実行し、ビルドエラーが発生しないか最終確認を行うこと。

4. **APIのアクセス権限とミドルウェア（Middleware）の確認**
   - APIルート（\`/api/...\`）を新設・変更する際は、そのパスが \`src/middleware.ts\` の \`ROLE_ACCESS\`（\`master\`, \`admin\` などの権限）で許可されているか必ず確認すること。
   - また、API内部でも \`user.role\` や \`user.tenant_id\` を厳密にチェックし、テナント間のデータ漏洩や権限エラー（トップへの意図しないリダイレクト等）が発生しないよう実装を徹底すること。
`;

let content = fs.readFileSync('AGENTS.md', 'utf8');
if (!content.includes('4. ローカル/本番環境の差異に関する厳格なルール')) {
  content += addition;
  fs.writeFileSync('AGENTS.md', content);
  console.log('Successfully updated AGENTS.md');
} else {
  console.log('AGENTS.md already updated');
}
