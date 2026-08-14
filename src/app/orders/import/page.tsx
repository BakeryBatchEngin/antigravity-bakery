'use client';

import { useState, useRef, useEffect } from 'react';
import * as xlsx from 'xlsx';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StatusCalendar from '@/components/StatusCalendar';

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
  const router = useRouter();
  
  // --- ステート群 ---
  const [fileName, setFileName] = useState<string>('');
  const [fileYearMonth, setFileYearMonth] = useState<string>(''); // YYYY-MM形式
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [parsedOrders, setParsedOrders] = useState<OrderItem[]>([]);
  const [parsedBreakdowns, setParsedBreakdowns] = useState<OrderBreakdownItem[]>([]);
  const [dataPreview, setDataPreview] = useState<any[][]>([]);
  
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [validProductCodes, setValidProductCodes] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    fetch('/api/admin/products')
      .then(res => res.json())
      .then(data => {
        if (data.products) {
          setValidProductCodes(new Set(data.products.map((p: any) => p.product_code)));
        }
      })
      .catch(err => console.error("商品マスタ取得エラー", err));
  }, []);
  
  // ファイルのバイナリをキャッシュしておく
  const fileContentRef = useRef<string | null>(null);

  // 1. ファイル選択時の処理（シート一覧と年月の取得のみ）
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);
    setImportErrors([]);
    setImportWarnings([]);
    setParsedOrders([]);
    setParsedBreakdowns([]);
    setDataPreview([]);
    setAvailableSheets([]);
    setSelectedSheets([]);
    setFileYearMonth('');

    // ファイル名から年月を抽出（例: MK武蔵小杉【ハード／2026.07】.xlsx -> 2026-07）
    let yearMonth = '';
    const ymMatch = file.name.match(/(\d{4})[./年-]?(\d{1,2})/);
    if (ymMatch) {
      const year = ymMatch[1];
      const month = ymMatch[2].padStart(2, '0');
      yearMonth = `${year}-${month}`;
      setFileYearMonth(yearMonth);
    } else {
      // ファイル名から取得できない場合は現在年月をフォールバック
      const now = new Date();
      yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      setFileYearMonth(yearMonth);
      setImportWarnings([`ファイル名から年月を判定できなかったため、${yearMonth} を仮定します。`]);
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result as string;
        fileContentRef.current = bstr;
        
        // シート名一覧だけを取得するため、軽く読み込む
        const wb = xlsx.read(bstr, { type: 'binary', bookSheets: true });
        
        // 数字だけのシート（または数字に近いもの）を抽出
        const dateSheets = wb.SheetNames.filter(name => /^\d{1,2}$/.test(name.trim()));
        
        if (dateSheets.length === 0) {
          setImportErrors(['ファイル内に「1」〜「31」のような日付を表すシートが見つかりませんでした。']);
        } else {
          setAvailableSheets(dateSheets);
          // デフォルトで全選択
          setSelectedSheets(dateSheets);
        }
      } catch (err: any) {
        setImportErrors([`ファイル読み込みエラー: ${err.message}`]);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // シートの選択切り替え
  const toggleSheetSelection = (sheetName: string) => {
    setSelectedSheets(prev => 
      prev.includes(sheetName) 
        ? prev.filter(s => s !== sheetName)
        : [...prev, sheetName].sort((a, b) => parseInt(a) - parseInt(b))
    );
  };
  
  const toggleSelectAllSheets = () => {
    if (selectedSheets.length === availableSheets.length) {
      setSelectedSheets([]);
    } else {
      setSelectedSheets([...availableSheets]);
    }
  };

  // 2. 選択されたシートの解析処理
  const handleAnalyzeSheets = () => {
    if (!fileContentRef.current || selectedSheets.length === 0) return;
    
    setIsProcessing(true);
    setImportErrors([]);
    setImportWarnings([]);
    
    try {
      const wb = xlsx.read(fileContentRef.current, { type: 'binary' });
      
      let allOrders: OrderItem[] = [];
      let allBreakdowns: OrderBreakdownItem[] = [];
      let allErrors: string[] = [];
      let firstPreviewData: any[][] | null = null;
      
      selectedSheets.forEach(wsname => {
        // 対象日の生成（YYYY-MM-DD）
        const day = wsname.trim().padStart(2, '0');
        const orderDate = `${fileYearMonth}-${day}`;
        
        const ws = wb.Sheets[wsname];
        const data = xlsx.utils.sheet_to_json<any[]>(ws, { header: 1 });
        const merges = ws['!merges'] || [];

        if (!firstPreviewData && data.length > 0) {
          firstPreviewData = data;
        }

        const { extracted, extractedBreakdowns, errors } = extractOrdersFromSheet(data, orderDate, merges);
        
        if (errors.length > 0) {
          allErrors.push(`シート「${wsname}日」のエラー:`);
          allErrors.push(...errors.map(e => `  - ${e}`));
        } else {
          allOrders.push(...extracted);
          allBreakdowns.push(...extractedBreakdowns);
        }
      });

      if (firstPreviewData) {
        setDataPreview(firstPreviewData);
      }

      if (allOrders.length === 0 && allErrors.length === 0) {
        allErrors.push('選択したシートに有効な注文データ（Totalが0より大きいアイテム）がありませんでした。');
      }

      if (allErrors.length > 0) {
        setImportErrors(allErrors);
      } else {
        setParsedOrders(allOrders);
        setParsedBreakdowns(allBreakdowns);
      }
    } catch (err: any) {
      setImportErrors([`データ解析エラー: ${err.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Excelの2次元配列データから、必要な注文データを抽出する関数
  const extractOrdersFromSheet = (data: any[][], orderDate: string, merges: any[] = []) => {
    const extracted: OrderItem[] = [];
    const extractedBreakdowns: OrderBreakdownItem[] = [];
    const errors: string[] = [];

    if (!data || data.length < 3) {
      errors.push('データ行が不足しています。');
      return { extracted, extractedBreakdowns, errors };
    }

    // 1行目が完全に空欄の場合、SheetJSがその行をスキップして配列のインデックスがズレる現象を吸収するため、
    // まず「Today total」という文字が含まれる行（通常はExcelの2行目・3行目のマージセル）を探し、それを基準にします。
    // Excelの右側（枠外）に無関係なToday totalが存在する場合を考慮し、I列以降で最初（最も左側）に見つかったものを採用します。
    let totalAmountColIndex = -1;
    let headerRowIndex = 0; // Today totalが見つかった行（＝店名がある行）
    
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const rowToSearch = data[i] || [];
      for (let j = 0; j < rowToSearch.length; j++) {
        if (rowToSearch[j]) {
          const cellVal = String(rowToSearch[j]).toLowerCase().replace(/[\s_]/g, '');
          // 現場のルールに則り「Today total」を探す
          if (cellVal.includes('todaytotal')) {
            // I列(=8)以降で、一番最初（最も左）に見つかった列を真のTotal列として採用する
            if (j >= 8 && totalAmountColIndex === -1) {
              totalAmountColIndex = j;
              headerRowIndex = i; // この行が「店名行（Excelの2行目）」付近に該当する
            }
          }
        }
      }
    }

    if (totalAmountColIndex === -1) {
      errors.push('ヘッダー付近に「Today total」という列が見つかりませんでした。ルール通りに入力されているか確認してください。');
      return { extracted, extractedBreakdowns, errors };
    }

    // 基準行から相対的にインデックスを決定（ズレを自動補正）
    const COMPANY_ROW_INDEX = headerRowIndex;
    const DEPT_ROW_INDEX = headerRowIndex + 1;
    const DATA_START_ROW_INDEX = headerRowIndex + 2; // Excelの4行目に該当

    const companyRow = data[COMPANY_ROW_INDEX] || [];
    const deptRow = data[DEPT_ROW_INDEX] || [];

    // ─── 発注元ヘッダーの解析（店名、便名） ───
    const vendorCols: { colIndex: number; customerName: string; deptName: string; displayName: string }[] = [];
    let lastSeenCustomerName = '';

    // 列の開始はI列(=8)からとし、Total列の手前まで走査
    for (let colIdx = 8; colIdx < totalAmountColIndex; colIdx++) {
      // 現場ルール：L列(11)の「店舗Total」とM列(12)の「￥(金額)」は中間集計列なので固定でスキップ
      if (colIdx === 11 || colIdx === 12) continue;

      let customerName = companyRow[colIdx] ? String(companyRow[colIdx]).trim() : '';
      
      // マージセルの考慮
      if (!customerName && merges.length > 0) {
        for (const merge of merges) {
          const { s, e } = merge;
          if (COMPANY_ROW_INDEX >= s.r && COMPANY_ROW_INDEX <= e.r && colIdx >= s.c && colIdx <= e.c) {
            customerName = data[s.r] && data[s.r][s.c] ? String(data[s.r][s.c]).trim() : '';
            break;
          }
        }
      }

      if (!customerName && lastSeenCustomerName) {
        customerName = lastSeenCustomerName;
      } else if (customerName) {
        lastSeenCustomerName = customerName;
      }

      if (!customerName) continue;

      // 念のため文字列ベースでもスキップ（店舗Total、￥、¥ などを弾く）
      const sanitizedName = customerName.toLowerCase().replace(/[\s_]/g, '');
      if (sanitizedName.includes('店舗total') || sanitizedName.includes('￥') || sanitizedName.includes('¥')) {
        continue;
      }

      let deptName = deptRow[colIdx] ? String(deptRow[colIdx]).trim() : '';
      // 2行目と3行目がマージされている場合、deptNameは便指定なし(空)として扱われる
      
      const displayName = customerName + (deptName ? ` ${deptName}` : '');
      vendorCols.push({ colIndex: colIdx, customerName, deptName, displayName });
    }

    // データ行（商品読み込み）は DATA_START_ROW_INDEX から開始
    for (let rowIndex = DATA_START_ROW_INDEX; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex];
      if (!row) continue;

      const productKey = row[1]; // B列：商品コード
      const productName = row[2]; // C列：商品名
      const totalAmountObj = row[totalAmountColIndex];
      
      const isProductKeyBlank = !productKey || String(productKey).trim() === '';
      const isTotalAmountBlank = totalAmountObj === undefined || totalAmountObj === null || String(totalAmountObj).trim() === '';

      // 空白行やTotalが無い行は無視（非表示行や無効行をスキップ）
      if (isProductKeyBlank || isTotalAmountBlank) {
         continue;
      }

      // 「Total」などの小計行をスキップ
      if (String(productKey).toLowerCase() === 'total' || (productName && String(productName).includes('合計'))) {
        continue;
      }

      const amt = Number(totalAmountObj);
      // Total値が0以下のアイテムは生産不要なので無視
      if (isNaN(amt) || amt <= 0) {
         continue;
      }

      const pKeyStr = String(productKey).trim();

      // マスタ未登録商品のチェック（有効なコードリストが存在する場合のみ）
      if (validProductCodes.size > 0 && !validProductCodes.has(pKeyStr)) {
        errors.push(`シート「${sheetName}」の${rowIndex + 1}行目: 商品コード「${pKeyStr}」は商品マスタに未登録ですが、合計値(${amt})があります。`);
        continue;
      }

      // 全体合計（ordersテーブル用）
      extracted.push({
        customerName: '全体合計',
        deliveryShift: '',
        productKey: pKeyStr,
        productName: productName ? String(productName).replace(/\r\n/g, '') : '',
        quantity: amt,
        orderDate: orderDate
      });

      // 内訳（order_breakdownsテーブル用）
      for (const vc of vendorCols) {
        const rawQty = row[vc.colIndex];
        if (rawQty === undefined || rawQty === null || String(rawQty).trim() === '') continue;
        const qty = Number(rawQty);
        if (isNaN(qty) || qty <= 0) continue;

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

    return { extracted, extractedBreakdowns, errors };
  };

  // 3. 最初の重複チェック処理を含む保存ハンドラ
  const handleSaveToDatabase = async () => {
    if (parsedOrders.length === 0) return;
    
    try {
      setIsProcessing(true);

      const checkRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: parsedOrders, mode: 'check' }),
      });
      
      const checkResText = await checkRes.text();
      let checkResult;
      try {
        checkResult = JSON.parse(checkResText);
      } catch (e) {
        alert('サーバーから不正なレスポンスが返されました（check）\n' + checkResText.substring(0, 300));
        setIsProcessing(false);
        return;
      }
      
      if (checkRes.ok && checkResult.exists) {
        setIsProcessing(false);
        setShowConflictModal(true);
        return;
      }
      
      if (!checkRes.ok) {
         if (checkResult.isSetError) {
           alert(`❌ ${checkResult.error}`);
         } else {
           alert(`エラー: ${checkResult.error || '不明なエラー'}\n${checkResult.details || ''}`);
         }
         setIsProcessing(false);
         return;
      }

      await proceedSave('append');
    } catch (error: any) {
      alert('通信エラーが発生しました: ' + error.message);
      console.error(error);
      setIsProcessing(false);
    }
  };

  // 実際の保存処理（置き換え or 追加）
  const proceedSave = async (mode: 'replace' | 'append') => {
    try {
      setIsProcessing(true);
      setShowConflictModal(false);
      
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: parsedOrders, mode }),
      });
      
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        alert('サーバーから不正なレスポンスが返されました（orders）\n' + responseText.substring(0, 300));
        setIsProcessing(false);
        return;
      }
      
      if (!response.ok) {
        alert(`エラー: ${result.error}${result.details ? '\n詳細: ' + result.details : ''}`);
        setIsProcessing(false);
        return;
      }

      if (parsedBreakdowns.length > 0) {
        const bdRes = await fetch('/api/order-breakdowns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ breakdowns: parsedBreakdowns, mode }),
        });
        
        try {
          const bdResult = await bdRes.json();
          if (!bdRes.ok) {
            console.warn('内訳データの保存に失敗しました: ', bdResult);
          }
        } catch (e) {
          console.warn('内訳データの保存に失敗しました（JSONパースエラー）');
        }
      }

      alert(`成功: ${result.message}`);
      // 初期化
      setParsedOrders([]);
      setParsedBreakdowns([]);
      setFileName('');
      setDataPreview([]);
      setAvailableSheets([]);
      setSelectedSheets([]);
      setFileYearMonth('');
      fileContentRef.current = null;
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
            <span className="text-slate-500 mt-2">（1ヶ月分がまとまったファイルを選択してください）</span>
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

      {!fileName && <StatusCalendar />}

      {/* ステップ2: シート選択と解析実行 */}
      {fileName && availableSheets.length > 0 && parsedOrders.length === 0 && importErrors.length === 0 && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
            <span>📅</span> 対象日付（シート）の選択
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            対象ファイル: <strong className="text-slate-800 dark:text-slate-200">{fileName}</strong> <br/>
            抽出年月: <strong className="text-amber-600">{fileYearMonth}</strong>
          </p>
          
          <div className="flex items-center gap-4 mb-4">
            <button 
              onClick={toggleSelectAllSheets}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-sm font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              すべて選択 / 解除
            </button>
            <span className="text-slate-600 dark:text-slate-400 text-sm">
              選択中: <strong>{selectedSheets.length}</strong> / {availableSheets.length} 日分
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 mb-8 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            {availableSheets.map(sheet => (
              <label 
                key={sheet} 
                className={`flex items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  selectedSheets.includes(sheet)
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:border-slate-300'
                }`}
              >
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={selectedSheets.includes(sheet)}
                  onChange={() => toggleSheetSelection(sheet)}
                />
                <span className="font-bold text-lg">{sheet}日</span>
              </label>
            ))}
          </div>

          <div className="flex justify-center">
            <button 
              className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xl shadow-md transition-transform hover:scale-105 active:scale-95 disabled:bg-slate-400 disabled:transform-none"
              onClick={handleAnalyzeSheets}
              disabled={isProcessing || selectedSheets.length === 0}
            >
              {isProcessing ? '解析中...' : '選択した日付を解析する'}
            </button>
          </div>
        </div>
      )}

      {/* ステップ3: 解析結果表示 */}
      {parsedOrders.length > 0 && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <h3 className="text-xl font-bold flex items-center gap-3 flex-wrap">
              <span>✅ 解析完了:</span>
              <span className="text-amber-600">{fileName}</span>
            </h3>
            <span className="text-lg bg-green-100 text-green-800 px-4 py-1 rounded-full font-bold whitespace-nowrap">
              {parsedOrders.length} 件の注文データを抽出
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
               <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2">▶ 抽出されたデータ（先頭10件）</h4>
               <ul className="space-y-2 text-sm max-h-60 overflow-y-auto pr-2">
                 {parsedOrders.slice(0, 10).map((order, idx) => (
                   <li key={idx} className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
                     <span className="font-medium text-amber-700 dark:text-amber-500">
                       {order.orderDate}
                     </span>
                     <span>{order.productName} ({order.productKey}) <span className="font-bold">x {order.quantity}</span></span>
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

      {/* エラー表示 */}
      {importErrors.length > 0 && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-6 rounded-xl mt-6">
          <h4 className="text-xl font-bold text-rose-800 flex items-center gap-2 mb-4">
            <span className="text-2xl">🚨</span> エラー: 処理を中断しました
          </h4>
          <ul className="list-disc list-inside space-y-2 text-rose-700 font-medium">
            {importErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
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
          </div>
        </div>
      )}
    </div>
  );
}
