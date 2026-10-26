'use client';

import React, { useState, useEffect } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ManagerDashboardPage from "./manager/dashboard/page";
import StatusCalendar from "@/components/StatusCalendar";
import { Loader2 } from "lucide-react";
export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [activeStoreId, setActiveStoreId] = useState<number | 'manager' | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.user) {
          if (data.user.role === 'super_admin') {
            window.location.href = '/super-admin';
            return; // リダイレクト完了まで Loading 状態を維持するため、setLoading(false) を呼ばない
          }
          setUser(data.user);
          if (data.activeStoreId !== undefined) setActiveStoreId(data.activeStoreId);
        } else {
          router.push('/login');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
    
    // 他のタブやヘッダーからのログアウト等に対応するため、イベントリッスン
    window.addEventListener('roleChange', fetchUser);
    return () => window.removeEventListener('roleChange', fetchUser);
  }, [router]);

  const [isImporting, setIsImporting] = useState(false);
  const excelInputRef = React.useRef<HTMLInputElement>(null);

  // 確認用の表（プレビュー）の状態
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    dates: { date: string; label: string }[];
    rows: { productCode: string; productName: string; quantities: number[] }[];
    existingDates: string[];
    skippedProductsCount: number;
    warnings: string[];
  } | null>(null);

  // ファイル選択時: まずDBに書き込まず、内容を解析して確認用の表を表示する
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'preview');

      const res = await fetch('/api/orders/import-weekly', {
        method: 'POST',
        body: formData
      });

      const resData = await res.json();
      if (!res.ok) {
        alert(`${resData.error || '読み込みに失敗しました'}\n詳細: ${resData.details || '不明なエラー'}`);
        return;
      }

      setPendingFile(file);
      setPreview(resData);
    } catch (err: any) {
      console.error(err);
      alert(`エクセルの読み込みに失敗しました\n理由: ${err.message || '不明'}`);
    } finally {
      setIsImporting(false);
      if (excelInputRef.current) {
        excelInputRef.current.value = '';
      }
    }
  };

  // 確認用の表を閉じる
  const closePreview = () => {
    setPendingFile(null);
    setPreview(null);
  };

  // 「登録実行」ボタン: すでにオーダーがある日があれば、確認してから上書き登録する
  const handleCommitImport = async () => {
    if (!pendingFile || !preview) return;

    if (preview.existingDates.length > 0) {
      const labels = preview.dates
        .filter(d => preview.existingDates.includes(d.date))
        .map(d => d.label)
        .join('、');
      const ok = window.confirm(
        `次の日付には、すでにオーダーが登録されています。\n\n${labels}\n\n上書きして登録してもよろしいですか？`
      );
      if (!ok) return;
    }

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('mode', 'commit');

      const res = await fetch('/api/orders/import-weekly', {
        method: 'POST',
        body: formData
      });

      const resData = await res.json();
      if (!res.ok) {
        alert(`${resData.error || '保存に失敗しました'}\n詳細: ${resData.details || '不明なエラー'}`);
        return;
      }

      alert(
        `オーダー表を登録しました！（${resData.datesCount}日分 / 販売商品マスタ一致: ${resData.productsCount}品目 / 計${resData.ordersCount}件の発注）`
      );
      closePreview();
    } catch (err: any) {
      console.error(err);
      alert(`登録に失敗しました\n理由: ${err.message || '不明'}`);
    } finally {
      setIsImporting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen={true} />;
  }

  if (!user) return null;

  const role = user.role;

  // マネージャーかつ「マネージャーモード」が選択されている場合はダッシュボードを表示
  const isManagerMode = role === 'manager' && activeStoreId === 'manager';
  // マネージャーが店舗を選択している場合はシェフと同じUIを表示
  const isManagerInStoreMode = role === 'manager' && activeStoreId !== 'manager' && activeStoreId !== null;
  // シェフとして操作できるか（シェフロール、またはマネージャーが店舗選択中）
  const showChefUI = (role === 'chef') || isManagerInStoreMode;

  return (
    <div className="flex flex-col gap-8 items-center justify-center py-10">

      {/* ===== マネージャーダッシュボード ===== */}
      {isManagerMode && (
        <div className="w-full max-w-7xl px-2">
          <ManagerDashboardPage />
        </div>
      )}

      {/* ===== シェフ向け操作メニュー（シェフ本人、またはマネージャーが店舗選択中） ===== */}
      {showChefUI && (
        <>
          <div className="text-center mb-4">
            <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              Welcome, {user.displayName}
            </h2>
            <p className="text-slate-500 mt-2">
              Role: <span className="uppercase font-bold">{role}</span>
              {isManagerInStoreMode && (
                <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                  店舗操作モード
                </span>
              )}
            </p>
          </div>

          <div className="w-full max-w-6xl mb-2">
            <StatusCalendar />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-4 md:grid-cols-2 gap-6 w-full max-w-6xl">
            {/* 受注データインポート */}
            <Link 
              href="/orders/import" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">📥</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Import Orders</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">Excelからの注文取り込み</p>
            </Link>

            {/* 仕込み計画 */}
            <Link 
              href="/production" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🥣</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Production Plan</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">本日の仕込み（生地・材料計量）</p>
            </Link>
          
            {/* 月間原材料レポート */}
            <Link 
              href="/reports/ingredients" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">📊</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Ingredient Report</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">月間原材料の使用量実績と出力</p>
            </Link>

            {/* ミキサー設定 */}
            <Link 
              href="/settings/mixers" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">⚙️</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Mixer Settings</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">自店のミキサー容量上限の設定</p>
            </Link>

            {/* 予定使用料予測 */}
            <Link 
              href="/forecast" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">📅</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Usage Forecast</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">複数日の原材料使用量予測</p>
            </Link>
          </div>
        </>
      )}

      {/* ===== 店舗ロス管理者・企業ロス統括管理者向けメニュー ===== */}
      {(role === 'store_loss_manager' || role === 'company_loss_manager') && (
        <>
          <div className="text-center mb-4">
            <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              Welcome, {user.displayName}
            </h2>
            <p className="text-slate-500 mt-2">
              Role: <span className="uppercase font-bold">{role}</span>
            </p>
          </div>

          <div className={`grid grid-cols-1 ${role === 'company_loss_manager' ? 'md:grid-cols-3 max-w-6xl' : 'md:grid-cols-2 max-w-4xl'} gap-6 w-full mt-4`}>
            <Link 
              href="/store-manager/waste" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-blue-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform drop-shadow-sm">📸</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">ロスパン登録 (AI)</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">カメラで棚を撮影してロスをカウント</p>
            </Link>
            
            <div className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-emerald-500 transition-all group cursor-pointer" onClick={() => !isImporting && excelInputRef.current?.click()}>
              <input 
                type="file"
                accept=".xlsx, .xls"
                ref={excelInputRef}
                className="hidden"
                onChange={handleExcelUpload}
              />
              {isImporting ? (
                <>
                  <Loader2 className="w-12 h-12 mb-4 animate-spin text-emerald-500" />
                  <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">読込中...</h3>
                </>
              ) : (
                <>
                  <span className="text-5xl mb-4 group-hover:scale-110 transition-transform drop-shadow-sm">📥</span>
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">オーダー表 一括読込</h3>
                  <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">販売商品マスタ登録済みの発注を取込（登録前に内容を確認）</p>
                </>
              )}
            </div>

            {role === 'company_loss_manager' && (
              <Link
                href="/store-manager/products"
                className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-rose-500 transition-all group"
              >
                <span className="text-5xl mb-4 group-hover:scale-110 transition-transform drop-shadow-sm">🏷️</span>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">販売商品マスタ設定</h3>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">商品コード・価格・カテゴリー・特性の管理</p>
              </Link>
            )}
          </div>
        </>
      )}

      {/* ===== マネージャーがマネージャーモード（ウェルカムメッセージのみ、ダッシュボードが上に表示されている） ===== */}
      {isManagerMode && (
        <div className="text-center mt-2">
          <p className="text-slate-400 dark:text-slate-500 text-sm">
            ヘッダーの「表示:」から店舗を選ぶと、その店舗の仕込み操作ができます
          </p>
        </div>
      )}

      {/* ===== Admin 向けのシステム管理メニュー ===== */}
      {role === 'admin' && (
        <>
          <h2 className="text-3xl font-bold text-center text-purple-700 dark:text-purple-400 mt-4 border-b-2 border-slate-200 dark:border-slate-700 pb-4 w-full max-w-4xl">
            System Administration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
            <Link 
              href="/admin/users" 
              className="flex flex-col items-center justify-center p-12 bg-slate-800 rounded-3xl shadow-xl border border-slate-700 hover:border-purple-500 hover:shadow-purple-500/20 transition-all group"
            >
              <span className="text-6xl mb-6 group-hover:scale-110 transition-transform drop-shadow-md">👥</span>
              <h3 className="text-2xl font-bold text-white">ユーザー管理</h3>
              <p className="text-slate-400 mt-3 text-center text-lg">アカウント発行と権限設定</p>
            </Link>

            <Link 
              href="/admin/stores" 
              className="flex flex-col items-center justify-center p-12 bg-slate-800 rounded-3xl shadow-xl border border-slate-700 hover:border-purple-500 hover:shadow-purple-500/20 transition-all group"
            >
              <span className="text-6xl mb-6 group-hover:scale-110 transition-transform drop-shadow-md">🏢</span>
              <h3 className="text-2xl font-bold text-white">店舗・設備管理</h3>
              <p className="text-slate-400 mt-3 text-center text-lg">店舗マスタとミキサー設定</p>
            </Link>
          </div>
        </>
      )}

      {/* ===== Master 向けのマスタ管理 ===== */}
      {role === 'master' && (
        <>
          <h2 className="text-3xl font-bold text-center text-amber-700 dark:text-amber-500 mt-8 pt-8 border-t-2 border-slate-200 dark:border-slate-700 w-full max-w-6xl">
            Master Data Management
          </h2>
          <div className="grid grid-cols-1 xl:grid-cols-4 md:grid-cols-2 gap-6 w-full max-w-6xl">
            <Link 
              href="/admin/ingredients" 
              className="flex flex-col items-center justify-center p-10 bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🍳</span>
              <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100">Ingredient Master</h3>
              <p className="text-amber-700 dark:text-amber-300 mt-2 text-center text-lg">原材料マスタ管理</p>
            </Link>

            <Link 
              href="/admin/doughs" 
              className="flex flex-col items-center justify-center p-10 bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🥣</span>
              <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100">Dough Master</h3>
              <p className="text-amber-700 dark:text-amber-300 mt-2 text-center text-lg">生地レシピ管理</p>
            </Link>

            <Link 
              href="/admin/wips" 
              className="flex flex-col items-center justify-center p-10 bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🍯</span>
              <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100">WIP Master</h3>
              <p className="text-amber-700 dark:text-amber-300 mt-2 text-center text-lg">仕掛品マスタ管理</p>
            </Link>

            <Link 
              href="/admin/products" 
              className="flex flex-col items-center justify-center p-10 bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-lg border-2 border-amber-200 dark:border-amber-800 hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform">🥖</span>
              <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100">Product Master</h3>
              <p className="text-amber-700 dark:text-amber-300 mt-2 text-center text-lg">商品構成マスタ管理</p>
            </Link>
          </div>
        </>
      )}

      {/* ===== オーダー表 取込内容の確認モーダル ===== */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">オーダー表の読み込み内容を確認</h3>
              <p className="text-sm text-slate-500 mt-1">
                {preview.rows.length}品目 / {preview.dates.length}日分（販売商品マスタに登録済みで、いずれかの日のオーダーが1以上の商品のみ）
              </p>
              {preview.existingDates.length > 0 && (
                <p className="mt-2 text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  ⚠ すでにオーダーが登録されている日があります（
                  {preview.dates.filter(d => preview.existingDates.includes(d.date)).map(d => d.label).join('、')}
                  ）。登録実行すると上書きされます。
                </p>
              )}
              {preview.skippedProductsCount > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  ※販売商品マスタに未登録のためスキップした商品: {preview.skippedProductsCount}品目
                </p>
              )}
              {preview.warnings.map((w, i) => (
                <p key={i} className="mt-2 text-xs text-amber-700">※{w}</p>
              ))}
            </div>

            <div className="overflow-auto flex-1 p-4">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-700">
                  <tr>
                    <th className="border px-2 py-1.5 text-left whitespace-nowrap">商品コード</th>
                    <th className="border px-2 py-1.5 text-left whitespace-nowrap">商品名</th>
                    {preview.dates.map(d => (
                      <th key={d.date} className="border px-2 py-1.5 text-right whitespace-nowrap">
                        オーダー数量（{d.label}）
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map(r => (
                    <tr key={r.productCode} className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-800 dark:even:bg-slate-700/50">
                      <td className="border px-2 py-1 whitespace-nowrap">{r.productCode}</td>
                      <td className="border px-2 py-1 whitespace-nowrap">{r.productName}</td>
                      {r.quantities.map((q, i) => (
                        <td key={i} className="border px-2 py-1 text-right tabular-nums font-bold">{q > 0 ? q : ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t flex justify-end gap-3">
              <button
                type="button"
                onClick={closePreview}
                disabled={isImporting}
                className="px-5 py-3 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleCommitImport}
                disabled={isImporting}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50 flex items-center gap-2"
              >
                {isImporting && <Loader2 className="w-4 h-4 animate-spin" />}
                登録実行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
