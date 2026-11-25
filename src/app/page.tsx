'use client';

import React, { useState, useEffect } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ManagerDashboardPage from "./manager/dashboard/page";
import StatusCalendar from "@/components/StatusCalendar";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
export default function Home() {
  const { user, activeStoreId, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user?.role === 'super_admin') {
        window.location.href = '/super-admin';
      } else if (user?.role === 'xmas_factory') {
        window.location.href = '/xmas/factory';
      } else if (['tokyo_store', 'regional_store', 'xmas_manager', 'xmas_headquarters'].includes(user?.role || '')) {
        window.location.href = '/xmas/orders';
      } else if (!user) {
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  const [isImporting, setIsImporting] = useState(false);
  const excelInputRef = React.useRef<HTMLInputElement>(null);

  type OverlappingProduct = {
    date: string;
    dateLabel: string;
    productCode: string;
    productName: string;
    existingQuantity: number;
    newQuantity: number;
  };

  type OrderPreviewData = {
    dates: { date: string; label: string }[];
    rows: { productCode: string; productName: string; quantities: number[] }[];
    sheetNames?: string[];
    existingDates: string[];
    existingCount?: number;
    overlappingProducts?: OverlappingProduct[];
    skippedProductsCount: number;
    unmatchedItems?: string[];
    nameMatchedCount?: number;
    warnings: string[];
  };

  // 確認用の表（プレビュー）の状態
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // シート選択モーダル用ステート
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);

  // プレビュー用ステート
  const [preview, setPreview] = useState<OrderPreviewData | null>(null);

  // 取込方法（追加/置き換え）選択モーダル用ステート
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);

  // ファイル選択時: まずExcel内の全シート名一覧を取得し、シート選択画面を表示
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPendingFile(file);
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'get-sheets');

      const res = await fetch('/api/orders/import-weekly', {
        method: 'POST',
        body: formData,
      });

      const resData = await res.json();
      if (!res.ok) {
        alert(`${resData.error || 'シートの読み込みに失敗しました'}\n詳細: ${resData.details || '不明なエラー'}`);
        setPendingFile(null);
        return;
      }

      const sheets: string[] = resData.sheets || [];
      if (sheets.length === 0) {
        alert('エクセルファイル内にワークシートが見つかりませんでした。');
        setPendingFile(null);
        return;
      }

      setAvailableSheets(sheets);
      setSelectedSheets([...sheets]); // デフォルトですべて選択
      setIsSheetModalOpen(true);
    } catch (err: any) {
      console.error(err);
      alert(`エクセルの読み込みに失敗しました\n理由: ${err.message || '不明'}`);
      setPendingFile(null);
    } finally {
      setIsImporting(false);
      if (excelInputRef.current) {
        excelInputRef.current.value = '';
      }
    }
  };

  const toggleSheet = (sheetName: string) => {
    setSelectedSheets(prev =>
      prev.includes(sheetName) ? prev.filter(s => s !== sheetName) : [...prev, sheetName]
    );
  };

  const selectAllSheets = () => {
    setSelectedSheets([...availableSheets]);
  };

  const deselectAllSheets = () => {
    setSelectedSheets([]);
  };

  const closeSheetModal = () => {
    setIsSheetModalOpen(false);
    setPendingFile(null);
    setAvailableSheets([]);
    setSelectedSheets([]);
  };

  // 選択したシート群で解析（プレビュー取得）を実行
  const handleProceedToPreview = async () => {
    if (!pendingFile) return;
    if (selectedSheets.length === 0) {
      alert('読み込むシートを1つ以上選択してください。');
      return;
    }

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('mode', 'preview');
      formData.append('sheetNames', JSON.stringify(selectedSheets));

      const res = await fetch('/api/orders/import-weekly', {
        method: 'POST',
        body: formData,
      });

      const resData = await res.json();
      if (!res.ok) {
        alert(`${resData.error || '読み込みに失敗しました'}\n詳細: ${resData.details || '不明なエラー'}`);
        return;
      }

      setIsSheetModalOpen(false);
      setPreview(resData);
    } catch (err: any) {
      console.error(err);
      alert(`エクセルの解析に失敗しました\n理由: ${err.message || '不明'}`);
    } finally {
      setIsImporting(false);
    }
  };

  // プレビューを閉じる
  const closePreview = () => {
    setPendingFile(null);
    setPreview(null);
    setIsConflictModalOpen(false);
  };

  // 「登録実行」ボタン押下時
  const handleCommitClick = () => {
    if (!pendingFile || !preview) return;

    // すでにオーダーが登録されている日があれば、追加か置き換えかを尋ねるモーダルを表示
    if (preview.existingDates.length > 0) {
      setIsConflictModalOpen(true);
    } else {
      // 既存オーダーがなければ直接追加登録を実行
      executeCommit('append');
    }
  };

  // 取込実行（append: 追加, replace: 置き換え）
  const executeCommit = async (importType: 'append' | 'replace') => {
    if (!pendingFile || !preview) return;

    if (importType === 'replace') {
      const ok = window.confirm(
        '対象日の既存オーダーをすべて削除し、今回のExcelデータですべて置き換えます。\n\n本当によろしいですか？'
      );
      if (!ok) return;
    }

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('mode', 'commit');
      formData.append('importType', importType);
      if (preview.sheetNames && preview.sheetNames.length > 0) {
        formData.append('sheetNames', JSON.stringify(preview.sheetNames));
      }

      const res = await fetch('/api/orders/import-weekly', {
        method: 'POST',
        body: formData,
      });

      const resData = await res.json();
      if (!res.ok) {
        alert(`${resData.error || '保存に失敗しました'}\n詳細: ${resData.details || '不明なエラー'}`);
        return;
      }

      const actionText = importType === 'append' ? '追加登録' : '置き換え登録';
      alert(
        `オーダー表を${actionText}しました！（${resData.datesCount}日分 / 販売商品マスタ一致: ${resData.productsCount}品目${resData.nameMatchedCount > 0 ? ` ※商品名一致: ${resData.nameMatchedCount}品目` : ''} / 計${resData.ordersCount}件の発注）`
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

      {/* ===== 店舗ロス管理者・企業ロス統括管理者・エリアロス統括マネージャー向けメニュー ===== */}
      {(role === 'store_loss_manager' || role === 'company_loss_manager' || role === 'area_loss_manager') && (
        <>
          <div className="text-center mb-4">
            <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              Welcome, {user.displayName}
            </h2>
            <p className="text-slate-500 mt-2">
              Role: <span className="uppercase font-bold">{role}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 w-full max-w-6xl mt-4">
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

            {/* 実績解析（日次） */}
            <Link 
              href="/store-manager/analytics" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-purple-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform drop-shadow-sm">📊</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">実績解析</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">販売・ロス・試食とAI分析・完売グラフ</p>
            </Link>

            {/* 店舗基礎データ設定 */}
            <Link 
              href="/store-manager/profile" 
              className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-amber-500 transition-all group"
            >
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform drop-shadow-sm">🏪</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">店舗基礎データ</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">曜日別営業時間と立地条件・特徴の登録</p>
            </Link>

            {(role === 'company_loss_manager' || role === 'area_loss_manager' || role === 'store_loss_manager') && (
              <Link
                href="/store-manager/products"
                className="flex flex-col items-center justify-center p-10 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-rose-500 transition-all group"
              >
                <span className="text-5xl mb-4 group-hover:scale-110 transition-transform drop-shadow-sm">🏷️</span>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                  {role === 'store_loss_manager' ? '販売商品マスタ' : '販売商品マスタ設定'}
                </h3>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-lg">
                  {role === 'company_loss_manager'
                    ? '商品コード・価格・カテゴリー・特性の管理'
                    : '商品コード・価格・カテゴリー・特性の閲覧・ダウンロード'}
                </p>
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

            <Link 
              href="/admin/xmas-accounts" 
              className="flex flex-col items-center justify-center p-12 bg-slate-800 rounded-3xl shadow-xl border border-slate-700 hover:border-red-500 hover:shadow-red-500/20 transition-all group"
            >
              <span className="text-6xl mb-6 group-hover:scale-110 transition-transform drop-shadow-md">🎄</span>
              <h3 className="text-2xl font-bold text-white">クリスマスアカウント管理</h3>
              <p className="text-slate-400 mt-3 text-center text-lg">2026年受発注アカウントの発行・管理</p>
            </Link>

            <Link 
              href="/admin/audit-logs" 
              className="flex flex-col items-center justify-center p-12 bg-slate-800 rounded-3xl shadow-xl border border-slate-700 hover:border-indigo-500 hover:shadow-indigo-500/20 transition-all group"
            >
              <span className="text-6xl mb-6 group-hover:scale-110 transition-transform drop-shadow-md">📜</span>
              <h3 className="text-2xl font-bold text-white">操作・作業履歴</h3>
              <p className="text-slate-400 mt-3 text-center text-lg">ログインや発注などの作業ログ監視</p>
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

      {/* ===== 1. シート選択モーダル ===== */}
      {isSheetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col border border-slate-200 dark:border-slate-800">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📑</span>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  どのシートを読み込みますか？
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                読み込みたいシートにチェックを入れてください。複数週（Week45, Week46…）やカテゴリー別のシートをまとめて同時に読み込めます。
              </p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  選択中: <strong className="text-emerald-600 dark:text-emerald-400">{selectedSheets.length}</strong> / {availableSheets.length} シート
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllSheets}
                    className="text-xs px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-lg transition"
                  >
                    すべて選択
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllSheets}
                    className="text-xs px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-lg transition"
                  >
                    すべて解除
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 max-h-72 overflow-y-auto space-y-2">
              {availableSheets.map(sheet => {
                const isChecked = selectedSheets.includes(sheet);
                return (
                  <label
                    key={sheet}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
                        : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSheet(sheet)}
                      className="w-5 h-5 accent-emerald-600 rounded"
                    />
                    <span className="font-bold text-sm flex-1">{sheet}</span>
                    {isChecked && (
                      <span className="text-xs bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                        選択中
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
              <button
                type="button"
                onClick={closeSheetModal}
                className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition text-sm"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleProceedToPreview}
                disabled={selectedSheets.length === 0 || isImporting}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition text-sm shadow disabled:opacity-40 flex items-center gap-2"
              >
                {isImporting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>選択したシートを解析（{selectedSheets.length}枚）</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 2. 既存オーダー取込方法（追加 / 置き換え）選択モーダル ===== */}
      {isConflictModalOpen && preview && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col border border-slate-200 dark:border-slate-800">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  既存オーダーの登録方法を選択
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                次の日付には、すでにオーダーが登録されています：
              </p>
              <div className="mt-2 text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                📅 {preview.dates.filter(d => preview.existingDates.includes(d.date)).map(d => d.label).join('、')}
              </div>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* 重複状況の案内 */}
              {(!preview.overlappingProducts || preview.overlappingProducts.length === 0) ? (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-bold text-sm">
                    <span>✅</span>
                    <span>商品の重複（かぶり）はありません</span>
                  </div>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1.5 leading-relaxed">
                    すでに登録されている商品と、今回取り込む商品に重複はありません。「追加して登録」を選ぶと、既存のオーダー（別カテゴリー等）を残したまま今回の商品を追加できます。
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-bold text-sm">
                    <span>⚠️</span>
                    <span>以下の商品が同じ日付にすでに登録されています（計 {preview.overlappingProducts.length} 件）</span>
                  </div>
                  <div className="mt-2 max-h-32 overflow-y-auto space-y-1 text-xs text-amber-900 dark:text-amber-100 font-mono bg-white/60 dark:bg-black/30 p-2.5 rounded-lg border border-amber-100 dark:border-amber-900/50">
                    {preview.overlappingProducts.map((op, idx) => (
                      <div key={idx} className="flex justify-between items-center py-0.5">
                        <span>【{op.dateLabel}】{op.productName}</span>
                        <span className="font-bold">既存: {op.existingQuantity}個 → 今回: {op.newQuantity}個</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2">
                    ※「追加して登録」を選択した場合、上記で重複している商品は今回の数量に更新され、重複していない新規商品は追加されます。
                  </p>
                </div>
              )}

              {/* 未登録スキップ商品の案内 */}
              {preview.unmatchedItems && preview.unmatchedItems.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <span>⚠️</span>
                    <span>マスタ未登録のためスキップされる商品（計 {preview.unmatchedItems.length} 品目）</span>
                  </div>
                  <div className="flex flex-wrap gap-1 my-1.5">
                    {preview.unmatchedItems.map((name, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 font-medium text-[11px]">
                        {name}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    ※上記商品は除外して登録されます。後からマスタに商品・別名を登録して再アップロードすれば、「追加登録」でいつでも取り込めます。
                  </p>
                </div>
              )}

              {/* 2つの選択カード */}
              <div className="space-y-3 pt-1">
                {/* 選択肢1: 追加 */}
                <button
                  type="button"
                  onClick={() => executeCommit('append')}
                  disabled={isImporting}
                  className="w-full text-left p-4 rounded-xl border-2 border-emerald-500 hover:border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-all group flex items-start gap-3.5 shadow-sm"
                >
                  <span className="text-2xl mt-0.5 group-hover:scale-110 transition-transform">➕</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-emerald-900 dark:text-emerald-200">
                        追加して登録（推奨）
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-100 rounded-full">
                        既存データを保持
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      既存のオーダー（別カテゴリーの商品など）を残したまま、今回のデータを追加します。
                      {preview.overlappingProducts && preview.overlappingProducts.length > 0 && '（※重複商品は今回の数量に更新されます）'}
                    </p>
                  </div>
                </button>

                {/* 選択肢2: 置き換え */}
                <button
                  type="button"
                  onClick={() => executeCommit('replace')}
                  disabled={isImporting}
                  className="w-full text-left p-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-red-400 dark:hover:border-red-600 bg-white dark:bg-slate-800/60 hover:bg-red-50/30 dark:hover:bg-red-950/20 transition-all group flex items-start gap-3.5"
                >
                  <span className="text-2xl mt-0.5 group-hover:scale-110 transition-transform">🔄</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-slate-800 dark:text-slate-200 group-hover:text-red-700 dark:group-hover:text-red-300">
                        すべて置き換えて登録
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full">
                        対象日を全削除
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      対象日の既存オーダーをすべて削除し、今回のExcelの内容にすべて置き換えます。
                    </p>
                  </div>
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsConflictModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition text-sm"
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 3. オーダー表 取込内容の確認モーダル（プレビュー） ===== */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span>📥 オーダー表の読み込み内容を確認</span>
                  {preview.sheetNames && preview.sheetNames.length > 0 && (
                    <span className="text-xs font-bold px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-200 dark:border-indigo-800">
                      シート: {preview.sheetNames.join(', ')}（計{preview.sheetNames.length}枚）
                    </span>
                  )}
                </h3>
              </div>

              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {preview.rows.length}品目 / {preview.dates.length}日分（販売商品マスタに登録済みで、いずれかの日のオーダーが1以上の商品のみ）
              </p>

              {preview.existingDates.length > 0 && (
                <div className="mt-2 text-xs font-semibold rounded-lg px-3 py-2 border flex items-center justify-between flex-wrap gap-1.5 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200">
                  <span className="flex items-center gap-1.5">
                    <span>ℹ</span>
                    <span>
                      対象日のうち <strong>{preview.existingDates.length}日分</strong> にすでにオーダーが登録されています（
                      {(!preview.overlappingProducts || preview.overlappingProducts.length === 0)
                        ? '商品のかぶりなし・追加可能'
                        : `${preview.overlappingProducts.length}件で重複あり`}
                      ）
                    </span>
                  </span>
                  <span className="text-[11px] underline opacity-80">※登録時に「追加」か「置き換え」を選択できます</span>
                </div>
              )}

              {preview.unmatchedItems && preview.unmatchedItems.length > 0 ? (
                <div className="mt-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <span>⚠️</span>
                    <span>販売商品マスタ未登録のためスキップされる商品（計 {preview.unmatchedItems.length} 品目）</span>
                  </div>
                  <p className="leading-relaxed opacity-90 mb-1.5">
                    以下の商品は商品マスタに存在しないため、今回の取り込みから除外されます（残りの登録済み {preview.rows.length} 品目のみを登録します）。
                  </p>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {preview.unmatchedItems.map((name, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-amber-200/80 dark:bg-amber-900/70 font-semibold text-[11px]">
                        {name}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    💡 <strong>後から追加可能:</strong> 企業ロス統括マネージャーの「販売商品マスタ設定」で商品や別名を登録した後に、再度このファイルをアップロードすると、追加した商品だけを「追加登録」で安全に取り込めます。
                  </p>
                </div>
              ) : preview.skippedProductsCount > 0 ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  ※販売商品マスタに未登録のためスキップした商品: {preview.skippedProductsCount}品目
                </p>
              ) : null}
              {preview.nameMatchedCount !== undefined && preview.nameMatchedCount > 0 && (
                <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-1.5">
                  ✓ 商品コード未入力等のうち、{preview.nameMatchedCount}品目を「商品名」で自動照合して取り込みました。
                </p>
              )}
              {preview.warnings.map((w, i) => (
                <p key={i} className="mt-2 text-xs text-amber-700 dark:text-amber-400">※{w}</p>
              ))}
            </div>

            <div className="overflow-auto flex-1 p-4">
              <table className="w-full text-sm border-collapse text-slate-800 dark:text-slate-100">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xs">
                  <tr>
                    <th className="border border-slate-300 dark:border-slate-700 px-3 py-2 text-left whitespace-nowrap font-semibold">商品コード</th>
                    <th className="border border-slate-300 dark:border-slate-700 px-3 py-2 text-left whitespace-nowrap font-semibold">商品名</th>
                    {preview.dates.map(d => (
                      <th key={d.date} className="border border-slate-300 dark:border-slate-700 px-3 py-2 text-right whitespace-nowrap font-semibold">
                        オーダー数量（{d.label}）
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map(r => (
                    <tr key={r.productCode} className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-800/80 hover:bg-amber-50/50 dark:hover:bg-slate-800 transition-colors">
                      <td className="border border-slate-300 dark:border-slate-700 px-3 py-1.5 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">{r.productCode}</td>
                      <td className="border border-slate-300 dark:border-slate-700 px-3 py-1.5 whitespace-nowrap font-medium text-slate-900 dark:text-slate-100">{r.productName}</td>
                      {r.quantities.map((q, i) => (
                        <td key={i} className="border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-right tabular-nums font-bold text-slate-900 dark:text-emerald-400">
                          {q > 0 ? q : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
              <button
                type="button"
                onClick={closePreview}
                disabled={isImporting}
                className="px-5 py-3 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold disabled:opacity-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleCommitClick}
                disabled={isImporting}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50 flex items-center gap-2 shadow-md transition-colors"
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
