'use client';

import { useState } from 'react';
import * as xlsx from 'xlsx';
import Link from 'next/link';

// Excelから抽出した「誰が、何を、何個」注文したかのデータ構造
interface OrderItem {
  customerName: string; // 店舗名・顧客名
  deliveryShift: string; // 1便、2便など（空の場合は1便などで統一）
  productKey: string;   // 商品名（キー）
  productName: string;  // 商品名（日本語など可読）
  quantity: number;     // 注文数
  orderDate: string;    // YYYY-MM-DD形式の注文対象日
}

// 発注元ごとの内訳データ構造
interface OrderBreakdownItem {
  order_date: string;    // YYYY-MM-DD形式の注文対象日
  product_code: string;  // 商品コード
  customer_name: string; // 発注元会社名（例: 日本橋高島屋）
  dept_name: string;     // 便・部署名（例: 1便、空の場合は ''）
  display_name: string;  // 表示名（例: 日本橋高島屋1便）
  quantity: number;      // 発注数
}

export default function OrderImportPage() {
  const [dataPreview, setDataPreview] = useState<any[][]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedOrders, setParsedOrders] = useState<OrderItem[]>([]);
  // 発注元内訳データ（仕込みページの内訳表示用）
  const [parsedBreakdowns, setParsedBreakdowns] = useState<OrderBreakdownItem[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = xlsx.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = xlsx.utils.sheet_to_json<any[]>(ws, { header: 1 });
      
      setDataPreview(data);
      extractOrders(data, wsname);
      setIsProcessing(false);
    };
    reader.readAsBinaryString(file);
  };

  // Excelの2次元配列データから、必要な注文データを抽出する関数
  const extractOrders = (data: any[][], sheetName: string) => {
    if (!data || data.length < 3) return;
    setImportErrors([]);

    // シート名から日付（YYYY-MM-DD）を生成
    let orderDate = '';
    const dateMatch = sheetName.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (dateMatch) {
      orderDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    } else {
      orderDate = new Date().toISOString().split('T')[0];
    }

    // ヘッダー行を探す
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(5, data.length); i++) {
        const row = data[i] || [];
        if ((row[0] && String(row[0]).includes('生地')) || (row[2] && String(row[2]).includes('商品名'))) {
            headerRowIndex = i;
            break;
        }
    }
    if (headerRowIndex === -1) headerRowIndex = 1;

    const headerRow = data[headerRowIndex] || [];
    
    // total_amount列（大文字小文字・空白などを無視して探す）
    let totalAmountColIndex = -1;
    for (let j = 0; j < headerRow.length; j++) {
      if (headerRow[j]) {
        const cellVal = String(headerRow[j]).toLowerCase().replace(/[\s_]/g, '');
        if (cellVal.includes('totalamount') || cellVal === 'totalamout' || cellVal === '合計' || cellVal === '合計数量') {
          totalAmountColIndex = j;
          break;
        }
      }
    }

    if (totalAmountColIndex === -1) {
      setImportErrors(['エラー: ヘッダー行に「total_amount」という列が見つかりませんでした。']);
      setParsedOrders([]);
      return;
    }

    const extracted: OrderItem[] = [];
    const extractedBreakdowns: OrderBreakdownItem[] = [];
    const errors: string[] = [];

    // ─── 発注元ヘッダーの解析（G列 = index 6 から total_amount の1つ前まで） ───
    // headerRow（2行目）: 発注元会社名
    // headerRow+1（3行目）: 便・部署名（空白の場合もある）
    const vendorSubRow = data[headerRowIndex + 1] || [];

    // 各列のインデックス → { customer_name, dept_name, display_name } のマップを作成
    const vendorCols: { colIndex: number; customerName: string; deptName: string; displayName: string }[] = [];
    for (let colIdx = 6; colIdx < totalAmountColIndex; colIdx++) {
      const customerName = headerRow[colIdx] ? String(headerRow[colIdx]).trim() : '';
      if (!customerName) continue; // 会社名が空の列はスキップ
      const deptName = vendorSubRow[colIdx] ? String(vendorSubRow[colIdx]).trim() : '';
      const displayName = customerName + deptName; // 例: "日本橋高島屋" + "1便" → "日本橋高島屋1便"
      vendorCols.push({ colIndex: colIdx, customerName, deptName, displayName });
    }

    // データ行はヘッダーから2行下から
    for (let rowIndex = headerRowIndex + 2; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex];
      if (!row) continue;

      const productKey = row[1];  // 2列目 (index 1): 商品コード (product_code)
      const productName = row[2]; // 3列目 (index 2): 商品名
      const totalAmountObj = row[totalAmountColIndex];
      
      const isProductKeyBlank = !productKey || String(productKey).trim() === '';
      const isTotalAmountBlank = totalAmountObj === undefined || totalAmountObj === null || String(totalAmountObj).trim() === '';

      // 完全な空行はスキップ
      if (isProductKeyBlank && isTotalAmountBlank && (!productName || String(productName).trim() === '')) {
         continue;
      }

      // 「total」などの集計行もスキップする
      if (String(productKey).toLowerCase() === 'total' || (productName && String(productName).includes('合計'))) {
        continue;
      }

      // エラーチェック1: product_codeが空白なのにtotal_amountが書かれている
      if (isProductKeyBlank && !isTotalAmountBlank) {
         errors.push(`${rowIndex + 1}行目: product_codeが空白ですが、total_amount（${totalAmountObj}）が入力されています。`);
         continue;
      }

      // エラーチェック2: total_amountが0ではなく空白
      if (!isProductKeyBlank && isTotalAmountBlank) {
         const pName = productName ? String(productName).trim() : '不明な商品';
         errors.push(`${rowIndex + 1}行目: [${pName}] のtotal_amountが空白です。（0の場合は0と入力してください）`);
         continue;
      }

      if (!isProductKeyBlank && !isTotalAmountBlank) {
        // 数値チェック
        const amt = Number(totalAmountObj);
        if (isNaN(amt)) {
           errors.push(`${rowIndex + 1}行目: total_amount（${totalAmountObj}）が数値ではありません。`);
           continue;
        }

        const pKeyStr = String(productKey).trim();

        // 合計行を extracted に追加（既存動作と変わらず）
        extracted.push({
          customerName: '全体合計',
          deliveryShift: '',
          productKey: pKeyStr,
          productName: productName ? String(productName).replace(/\r\n/g, '') : '',
          quantity: amt,
          orderDate: orderDate
        });

        // ─── 発注元ごとの内訳を抽出（新機能） ───
        for (const vc of vendorCols) {
          const rawQty = row[vc.colIndex];
          if (rawQty === undefined || rawQty === null || String(rawQty).trim() === '') continue;
          const qty = Number(rawQty);
          if (isNaN(qty) || qty <= 0) continue; // 0個以下はスキップ

          extractedBreakdowns.push({
            order_date: orderDate,
            product_code: pKeyStr,
            customer_name: vc.customerName,
            dept_name: vc.deptName,
            display_name: vc.displayName,
            quantity: qty,
          });
        }
      }
    }

    if (errors.length > 0) {
      setImportErrors(errors);
      setParsedOrders([]);      // エラー時は保存させないためデータを空に
      setParsedBreakdowns([]);
    } else {
      setParsedOrders(extracted);
      setParsedBreakdowns(extractedBreakdowns);
    }
  };

  // 最初の重複チェック処理を含む保存ハンドラ
  const handleSaveToDatabase = async () => {
    if (parsedOrders.length === 0) return;
    
    try {
      setIsProcessing(true);

      // まずは check モードで同一日付のデータがあるか確認
      const checkRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: parsedOrders, mode: 'check' }),
      });
      
      const checkResult = await checkRes.json();
      
      if (checkRes.ok && checkResult.exists) {
        // 既存データがある場合はモーダルでユーザーに選択させる
        setIsProcessing(false);
        setShowConflictModal(true);
        return;
      }
      
      // 既存データがない場合はそのまま append (新規登録) する
      await proceedSave('append');
    } catch (error) {
      alert('通信エラーが発生しました');
      console.error(error);
      setIsProcessing(false);
    }
  };

  // 実際の保存処理（置き換え or 追加）
  const proceedSave = async (mode: 'replace' | 'append') => {
    try {
      setIsProcessing(true);
      setShowConflictModal(false);
      
      // ── 既存: 合計数を orders テーブルに保存（変更なし）──
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: parsedOrders, mode }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        alert(`エラー: ${result.error}`);
        return;
      }

      // ── 新機能: 発注元内訳を order_breakdowns テーブルに保存 ──
      if (parsedBreakdowns.length > 0) {
        const bdRes = await fetch('/api/order-breakdowns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ breakdowns: parsedBreakdowns, mode }),
        });
        if (!bdRes.ok) {
          // 内訳保存は補助機能なので警告だけ表示して続行
          console.warn('内訳データの保存に失敗しました（合計データは保存済みです）');
        }
      }

      alert(`成功: ${result.message}`);
      setParsedOrders([]);      // 成功したらクリア
      setParsedBreakdowns([]);
      setFileName('');
      setDataPreview([]);
    } catch (error) {
      alert('通信エラーが発生しました');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">📥 Import Orders</h2>
        <Link href="/" className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg text-slate-800 dark:text-slate-200 hover:bg-slate-300 transition-colors cursor-pointer">
          <span className="text-xl">🏠</span> ダッシュボードへ戻る
        </Link>
      </div>

      <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="flex flex-col items-center justify-center p-10 border-4 border-dashed border-amber-300 rounded-xl bg-amber-50 dark:bg-slate-900/50 hover:bg-amber-100 hover:border-amber-400 dark:hover:bg-slate-800 transition-colors">
          <label className="flex flex-col items-center justify-center cursor-pointer w-full h-full">
            <span className="text-6xl mb-4">📁</span>
            <span className="text-2xl font-bold text-amber-700 dark:text-amber-500">Excelファイルを選択</span>
            <span className="text-slate-500 mt-2">（ここをタップして本日のオーダー表を選んでください）</span>
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              className="hidden" 
              onChange={handleFileUpload} 
              disabled={isProcessing}
            />
          </label>
        </div>
      </div>

      {fileName && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <h3 className="text-xl font-bold flex items-center gap-3 flex-wrap">
              <span>読み込み結果:</span>
              <span className="text-amber-600">{fileName}</span>
              {parsedOrders.length > 0 && typeof parsedOrders[0].orderDate === 'string' && (
                <span className="bg-amber-100 text-amber-800 text-base px-3 py-1 rounded-full border border-amber-200 flex items-center gap-1 shadow-sm">
                  <span>📅</span>対象日: {parsedOrders[0].orderDate.split('-').slice(1).join('月')}日
                </span>
              )}
            </h3>
            {importErrors.length === 0 && (
              <span className="text-lg bg-green-100 text-green-800 px-4 py-1 rounded-full font-bold whitespace-nowrap">
                {parsedOrders.length} 件の注文データを発見
              </span>
            )}
          </div>
          
          {importErrors.length > 0 ? (
            <div className="bg-rose-50 border-l-4 border-rose-500 p-6 rounded-xl mb-8">
              <h4 className="text-xl font-bold text-rose-800 flex items-center gap-2 mb-4">
                <span className="text-2xl">🚨</span> エラー: データの読み込みを中止しました
              </h4>
              <ul className="list-disc list-inside space-y-2 text-rose-700 font-medium">
                {importErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-rose-600 font-bold">※Excelのデータを修正してから、再度ファイルを選択してください。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                 <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2">▶ 抽出されたデータ（先頭10件）</h4>
                 <ul className="space-y-2 text-sm max-h-60 overflow-y-auto pr-2">
                   {parsedOrders.slice(0, 10).map((order, idx) => (
                     <li key={idx} className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                       <span className="font-medium text-amber-700 dark:text-amber-500">
                         {order.customerName} {order.deliveryShift ? `(${order.deliveryShift})` : ''}
                       </span>
                       <span>{order.productName} <span className="font-bold">x {order.quantity}</span></span>
                     </li>
                   ))}
                   {parsedOrders.length > 10 && (
                     <li className="text-center text-slate-500 pt-2">...他 {parsedOrders.length - 10}件</li>
                   )}
                 </ul>
              </div>

              <div className="bg-amber-50 dark:bg-slate-900 border border-amber-200 dark:border-slate-700 p-6 rounded-xl flex flex-col justify-center items-center text-center">
                <span className="text-4xl mb-3">💾</span>
                <h4 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-4">この内容で登録しますか？</h4>
                <button 
                  className="w-full max-w-xs px-6 py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xl shadow-md transition-transform hover:scale-105 active:scale-95 disabled:bg-slate-400 disabled:transform-none"
                  onClick={handleSaveToDatabase}
                  disabled={isProcessing}
                >
                  {isProcessing ? '保存中...' : 'データベースに保存'}
                </button>
              </div>
            </div>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer text-slate-500 dark:text-slate-400 font-medium hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              元のExcelデータ（生データ）を確認する
            </summary>
            <div className="mt-4 overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    {dataPreview[0]?.map((_, i) => (
                      <th key={i} className="px-2 py-2 border-b dark:border-slate-700 font-normal">列 {i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataPreview.slice(0, 15).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      {dataPreview[0]?.map((_, colIndex) => (
                        <td key={colIndex} className="px-2 py-1 border-r dark:border-slate-700 last:border-r-0 max-w-xs truncate" title={row[colIndex] !== undefined ? String(row[colIndex]) : ''}>
                          {row[colIndex] !== undefined && row[colIndex] !== null ? String(row[colIndex]) : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-2 text-center text-slate-500">
                先頭15行のみ表示
              </div>
            </div>
          </details>
        </div>
      )}

      {/* 重複確認モーダル */}
      {showConflictModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md w-full border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold text-amber-600 mb-4 flex items-center gap-2">
              <span className="text-3xl">⚠️</span> 重複データの確認
            </h3>
            <p className="text-slate-700 dark:text-slate-300 mb-6 leading-relaxed">
              すでに同じ日付のオーダーデータが存在します。どのように保存しますか？
            </p>
            <div className="flex flex-col gap-4">
              <button 
                onClick={() => proceedSave('replace')}
                className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-md transition-transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 text-lg disabled:opacity-50"
                disabled={isProcessing}
              >
                <span>🗑️</span> 既存データを削除して置き換える
              </button>
              <button 
                onClick={() => proceedSave('append')}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 text-lg disabled:opacity-50"
                disabled={isProcessing}
              >
                <span>➕</span> 既存データに合算・追加する
              </button>
              <button 
                onClick={() => setShowConflictModal(false)}
                className="w-full py-3 mt-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                disabled={isProcessing}
              >
                キャンセル
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-6 text-center leading-relaxed">
              ※合算の場合、同じ店舗・便・商品のデータは数量が足され、新しい商品は追加されます。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
