'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@/components/LoadingSpinner';

// メインケーキ4種とおまけ商品2種（指定通りの並び順）
const XMAS_PRODUCTS = [
  'デリスドゥラス',
  'リンツァーロール',
  'ブッシュカイザー',
  'ブッシュ エキゾチック',
  'シュトーレン',
  'シュトーレン ハーフ',
];

const DELIVERY_DATES = [
  { value: '2026-12-19', label: '12月19日（土）' },
  { value: '2026-12-20', label: '12月20日（日）' },
  { value: '2026-12-21', label: '12月21日（月）' },
  { value: '2026-12-22', label: '12月22日（火）' },
  { value: '2026-12-23', label: '12月23日（水）' },
  { value: '2026-12-24', label: '12月24日（木）' },
  { value: '2026-12-25', label: '12月25日（金）' },
];

const DELIVERY_TIMES = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00'
];

type ProductSummary = {
  product_name: string;
  current_quantity: number;
  max_limit: number;
  is_max_reached: boolean;
};

type OrderItem = {
  product_name: string;
  quantity: number;
};

type XmasOrder = {
  id: number;
  account_id: number;
  store_name?: string;
  store_role?: string;
  order_datetime: string;
  staff_name: string;
  order_route: string;
  web_reservation_no: string | null;
  payment_status: string;
  discount_type: string;
  delivery_date: string;
  delivery_time: string;
  customer_name: string;
  customer_phone: string;
  memo: string | null;
  items: OrderItem[];
};

type StoreAccount = {
  id: number;
  username: string;
  display_name: string;
  role: string;
};

export default function XmasOrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [orders, setOrders] = useState<XmasOrder[]>([]);
  const [productSummaries, setProductSummaries] = useState<ProductSummary[]>([]);
  const [accounts, setAccounts] = useState<StoreAccount[]>([]);
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // タイムスタンプ表示用の現在日時
  const [currentTimestamp, setCurrentTimestamp] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const h = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      setCurrentTimestamp(`${y}/${m}/${d} ${h}:${min}:${s}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // 編集モード
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [editingOrderTimestamp, setEditingOrderTimestamp] = useState<string>('');

  // ソート設定（デフォルト：お渡し日時昇順）
  const [sortField, setSortField] = useState<string>('delivery');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // 入力フォームステート
  const getInitialForm = () => {
    return {
      staff_name: '',
      order_route: '店舗受注',
      web_reservation_no: '',
      payment_status: 'お渡し支払',
      discount_type: 'なし',
      delivery_date: '2026-12-24',
      delivery_time: '12:00',
      customer_name: '',
      customer_phone: '',
      memo: '',
      target_account_id: '',
      selectedProducts: {} as Record<string, { selected: boolean; quantity: number }>,
    };
  };

  const [formData, setFormData] = useState(getInitialForm);

  // 初期化・権限判定
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
        return;
      }
      fetchData();
    }
  }, [authLoading, user, selectedAccountFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const url = selectedAccountFilter && selectedAccountFilter !== 'all'
        ? `/api/xmas/orders?account_id=${selectedAccountFilter}`
        : '/api/xmas/orders';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'データの取得に失敗しました');

      setOrders(data.orders || []);
      setProductSummaries(data.productSummaries || []);
      if (data.accounts) {
        setAccounts(data.accounts);
        if (data.accounts.length > 0 && !formData.target_account_id) {
          setFormData(prev => ({ ...prev, target_account_id: String(data.accounts[0].id) }));
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // 受注ルート変更時の連動
  const handleRouteRadio = (route: string) => {
    setFormData(prev => ({
      ...prev,
      order_route: route,
      payment_status: route === 'ネット予約' ? '支払済' : prev.payment_status,
      web_reservation_no: route === 'ネット予約' ? prev.web_reservation_no : '',
    }));
  };

  // 商品選択チェックボックス・数量変更
  const handleProductToggle = (prodName: string) => {
    setFormData(prev => {
      const current = prev.selectedProducts[prodName];
      const isSelected = current ? !current.selected : true;
      return {
        ...prev,
        selectedProducts: {
          ...prev.selectedProducts,
          [prodName]: {
            selected: isSelected,
            quantity: current?.quantity && current.quantity > 0 ? current.quantity : 1,
          },
        },
      };
    });
  };

  const handleProductQuantity = (prodName: string, qty: number) => {
    setFormData(prev => ({
      ...prev,
      selectedProducts: {
        ...prev.selectedProducts,
        [prodName]: {
          selected: true,
          quantity: Math.max(1, qty),
        },
      },
    }));
  };

  // 編集開始
  const handleStartEdit = (order: XmasOrder) => {
    setEditingOrderId(order.id);
    setMessage(null);

    // 編集時タイムスタンプの整形
    try {
      const d = new Date(order.order_datetime);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      setEditingOrderTimestamp(`${y}/${m}/${day} ${h}:${min}:${s}`);
    } catch {
      setEditingOrderTimestamp(order.order_datetime);
    }

    const selectedMap: Record<string, { selected: boolean; quantity: number }> = {};
    order.items.forEach(item => {
      selectedMap[item.product_name] = {
        selected: true,
        quantity: item.quantity,
      };
    });

    setFormData({
      staff_name: order.staff_name,
      order_route: order.order_route,
      web_reservation_no: order.web_reservation_no || '',
      payment_status: order.payment_status,
      discount_type: order.discount_type,
      delivery_date: order.delivery_date,
      delivery_time: order.delivery_time,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      memo: order.memo || '',
      target_account_id: String(order.account_id),
      selectedProducts: selectedMap,
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingOrderId(null);
    setEditingOrderTimestamp('');
    setFormData(getInitialForm());
    if (accounts.length > 0) {
      setFormData(prev => ({ ...prev, target_account_id: String(accounts[0].id) }));
    }
  };

  // 削除
  const handleDelete = async (order: XmasOrder) => {
    if (!confirm(`注文番号 #${order.id}（${order.customer_name} 様）の受注データを削除しますか？`)) {
      return;
    }

    try {
      const res = await fetch(`/api/xmas/orders?id=${order.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');

      setMessage({ type: 'success', text: '受注データを削除しました' });
      fetchData();
    } catch (err: any) {
      alert(err.message || '削除中にエラーが発生しました');
    }
  };

  // 登録・更新送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!formData.staff_name.trim()) {
      alert('入力者名（スタッフ氏名）を入力してください');
      return;
    }

    if (formData.order_route === 'ネット予約') {
      if (!formData.web_reservation_no || !/^\d{8}$/.test(formData.web_reservation_no.trim())) {
        alert('ネット予約の場合は半角数字8桁の予約番号を入力してください');
        return;
      }
    }

    // 商品選択チェック
    const items: OrderItem[] = [];
    Object.entries(formData.selectedProducts).forEach(([prodName, val]) => {
      if (val.selected && val.quantity > 0) {
        items.push({ product_name: prodName, quantity: val.quantity });
      }
    });

    if (items.length === 0) {
      alert('予約商品を1つ以上選択してください');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        staff_name: formData.staff_name.trim(),
        order_route: formData.order_route,
        web_reservation_no: formData.web_reservation_no,
        payment_status: formData.payment_status,
        discount_type: formData.discount_type,
        delivery_date: formData.delivery_date,
        delivery_time: formData.delivery_time,
        customer_name: formData.customer_name.trim(),
        customer_phone: formData.customer_phone.trim(),
        memo: formData.memo,
        order_datetime: new Date().toISOString(),
        items,
        target_account_id: formData.target_account_id || undefined,
      };

      if (editingOrderId) {
        payload.id = editingOrderId;
        const res = await fetch('/api/xmas/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || '更新に失敗しました');

        setMessage({ type: 'success', text: `受注内容を正常に更新しました！` });
        handleCancelEdit();
      } else {
        const res = await fetch('/api/xmas/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const resData = await res.json();
        if (!res.ok) throw new Error(resData.error || '登録に失敗しました');

        setMessage({ type: 'success', text: `受注を登録しました！（注文番号: #${resData.orderId}）` });
        setFormData(prev => ({
          ...getInitialForm(),
          staff_name: prev.staff_name,
          target_account_id: prev.target_account_id,
        }));
      }

      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ソート処理
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'delivery') {
        const aVal = `${a.delivery_date} ${a.delivery_time}`;
        const bVal = `${b.delivery_date} ${b.delivery_time}`;
        comparison = aVal.localeCompare(bVal);
      } else if (sortField === 'order_datetime') {
        comparison = new Date(a.order_datetime).getTime() - new Date(b.order_datetime).getTime();
      } else if (sortField === 'customer') {
        comparison = a.customer_name.localeCompare(b.customer_name);
      } else if (sortField === 'route') {
        comparison = a.order_route.localeCompare(b.order_route);
      } else if (sortField === 'store') {
        comparison = (a.store_name || '').localeCompare(b.store_name || '');
      } else if (sortField === 'id') {
        comparison = a.id - b.id;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [orders, sortField, sortOrder]);

  // Excel出力機能
  const handleExportExcel = async () => {
    try {
      setExportingExcel(true);
      const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('クリスマス予約一覧');

      worksheet.columns = [
        { header: '注文No.', key: 'id', width: 10 },
        { header: 'お渡し日', key: 'delivery_date', width: 15 },
        { header: 'お渡し時刻', key: 'delivery_time', width: 12 },
        { header: '店舗名', key: 'store_name', width: 22 },
        { header: 'お客様氏名', key: 'customer_name', width: 18 },
        { header: '電話番号', key: 'customer_phone', width: 16 },
        { header: '予約商品・個数', key: 'items', width: 36 },
        { header: '受注ルート', key: 'order_route', width: 12 },
        { header: 'ネット予約番号', key: 'web_reservation_no', width: 16 },
        { header: '支払状況', key: 'payment_status', width: 12 },
        { header: '割引', key: 'discount_type', width: 10 },
        { header: '入力スタッフ', key: 'staff_name', width: 14 },
        { header: '備考', key: 'memo', width: 26 },
      ];

      // ヘッダースタイル
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC00000' }
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      sortedOrders.forEach(order => {
        const itemsText = order.items.map(it => `${it.product_name} x ${it.quantity}個`).join(', ');
        worksheet.addRow({
          id: order.id,
          delivery_date: order.delivery_date,
          delivery_time: order.delivery_time,
          store_name: order.store_name || '',
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          items: itemsText,
          order_route: order.order_route,
          web_reservation_no: order.web_reservation_no || '-',
          payment_status: order.payment_status,
          discount_type: order.discount_type,
          staff_name: order.staff_name,
          memo: order.memo || '',
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `クリスマス受発注予約一覧_2026_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Excel出力に失敗しました: ' + err.message);
    } finally {
      setExportingExcel(false);
    }
  };

  // ブラウザ印刷
  const handlePrint = () => {
    window.print();
  };

  if (authLoading || loading) {
    return <LoadingSpinner fullScreen={true} />;
  }

  const isFactory = user?.role === 'xmas_factory';
  const isManager = user?.role === 'xmas_manager';
  const isAdminOrSuper = user?.role === 'admin' || user?.role === 'super_admin';
  const canSwitchStore = isManager || isFactory || isAdminOrSuper;

  // 上限到達マップ
  const limitReachedMap = productSummaries.reduce((acc, curr) => {
    acc[curr.product_name] = curr.is_max_reached;
    return acc;
  }, {} as Record<string, boolean>);

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-3 sm:px-6 lg:px-8">
      {/* 印刷用スタイル（予約フォーム部で1ページ、一覧で1ページに改ページ分離） */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          header, nav, .no-print {
            display: none !important;
          }
          .print-page-1 {
            page-break-after: always !important;
            break-after: page !important;
            box-shadow: none !important;
            border: 1px solid #ccc !important;
            padding: 16px !important;
          }
          .print-page-2 {
            page-break-before: always !important;
            break-before: page !important;
            box-shadow: none !important;
            border: 1px solid #ccc !important;
            padding: 16px !important;
          }
        }
      `}</style>

      <div className="max-w-6xl mx-auto flex flex-col gap-8">

        {/* 画面タイトル ＆ 権限別案内（印刷時は非表示） */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 no-print">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-4xl">🎄</span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  クリスマス受発注 2026
                </h1>
              </div>
              <p className="mt-2 text-slate-600 text-sm sm:text-base font-medium">
                {user?.role === 'tokyo_store' && '【首都圏店舗】お客様からのクリスマスケーキ予約を入力・管理します。'}
                {user?.role === 'regional_store' && '【地方店舗】お客様からのクリスマスケーキ予約を入力・管理します。'}
                {isManager && '【クリスマスマネージャー】全店舗の受注閲覧、および店舗切替による代理入力・編集が可能です。'}
                {isFactory && '【工場アカウント】全店舗の受注データとりまとめ一覧を閲覧できます。'}
                {isAdminOrSuper && '【管理者モード】全店舗の受注閲覧・代理登録が可能です。'}
              </p>
            </div>

            {/* アクションボタン群（工場ダッシュボードへ戻る / 印刷 / Excel出力） */}
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm transition-all"
              >
                <span>🖨️</span>
                <span>印刷</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                disabled={exportingExcel}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-sm transition-all disabled:opacity-50"
              >
                <span>📥</span>
                <span>{exportingExcel ? '出力中...' : 'Excel出力'}</span>
              </button>

              {(isFactory || isAdminOrSuper) && (
                <button
                  onClick={() => router.push('/xmas/factory')}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 text-white font-bold text-xs sm:text-sm hover:bg-slate-900 shadow-md transition-all"
                >
                  <span>🏭</span>
                  <span>工場出荷集計へ</span>
                </button>
              )}
            </div>
          </div>

          {/* マネージャー／管理者用：店舗切り替えバー */}
          {canSwitchStore && accounts.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap items-center gap-3 bg-purple-50/70 p-4 rounded-2xl border border-purple-100">
              <span className="text-sm font-bold text-purple-900 flex items-center gap-1.5">
                <span>🏢</span>
                <span>表示・入力対象店舗:</span>
              </span>
              <select
                value={selectedAccountFilter}
                onChange={(e) => {
                  setSelectedAccountFilter(e.target.value);
                  if (e.target.value !== 'all') {
                    setFormData(prev => ({ ...prev, target_account_id: e.target.value }));
                  }
                }}
                className="px-4 py-2 bg-white border border-purple-300 rounded-xl text-sm font-bold text-purple-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">全店舗を表示（一覧）</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.role === 'tokyo_store' ? '🏙️' : '🌾'} {acc.display_name} ({acc.username})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* メッセージ通知 */}
        {message && (
          <div
            className={`p-4 rounded-2xl font-bold flex items-center justify-between border no-print ${
              message.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <span>{message.type === 'success' ? '✅' : '⚠️'} {message.text}</span>
            <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600 font-bold px-2">✕</button>
          </div>
        )}

        {/* ======================================================== */}
        {/* 受注入力フォーム（※工場アカウントの場合は非表示！） */}
        {/* ======================================================== */}
        {!isFactory && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 relative print-page-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 border-b border-slate-200 mb-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
                  <span>{editingOrderId ? '✏️ 受注内容の修正・編集' : '📝 受注情報の登録'}</span>
                </h2>
                
                {/* 受注日時の変更不能タイムスタンプ（タイトルの右側に常時表示） */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs font-bold text-slate-700">
                  <span>🕒 受付日時:</span>
                  <span className="font-mono text-slate-900">
                    {editingOrderId ? editingOrderTimestamp : currentTimestamp}
                  </span>
                </div>

                {editingOrderId && (
                  <span className="text-xs bg-amber-100 text-amber-900 px-3 py-1 rounded-full font-bold">
                    編集中: 注文番号 #{editingOrderId}
                  </span>
                )}
              </div>

              {editingOrderId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors no-print"
                >
                  ✕ 編集キャンセル
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">

              {/* マネージャー代理入力時の店舗選択 */}
              {canSwitchStore && accounts.length > 0 && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    登録先店舗アカウント *
                  </label>
                  <select
                    value={formData.target_account_id}
                    onChange={(e) => setFormData({ ...formData, target_account_id: e.target.value })}
                    className="w-full sm:w-auto px-4 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-sm focus:outline-none focus:border-red-500"
                    required
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.role === 'tokyo_store' ? '🏙️ 首都圏: ' : '🌾 地方: '} {acc.display_name} ({acc.username})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 受注ルート ＆ 支払情報 ＆ 割引適用 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 受注ルート（項目番号なし） */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    受注ルート *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['店舗受注', 'ネット予約', '本部予約'].map((route) => (
                      <button
                        key={route}
                        type="button"
                        onClick={() => handleRouteRadio(route)}
                        className={`py-3 px-2 rounded-xl text-xs sm:text-sm font-bold border transition-all ${
                          formData.order_route === route
                            ? 'bg-red-600 text-white border-red-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {route}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 支払情報（項目番号なし） */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    支払情報 *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {['支払済', 'お渡し支払'].map((status) => {
                      const isNet = formData.order_route === 'ネット予約';
                      const isSelected = formData.payment_status === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          disabled={isNet && status !== '支払済'}
                          onClick={() => setFormData({ ...formData, payment_status: status })}
                          className={`py-3 px-3 rounded-xl text-sm font-bold border transition-all ${
                            isSelected
                              ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                              : isNet
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {status === '支払済' ? '💳 支払済' : '🏪 お渡し支払'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 割引適用（項目番号なし） */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    割引適用 *
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {['なし', '１０％', '１５％', '３０％'].map((disc) => (
                      <button
                        key={disc}
                        type="button"
                        onClick={() => setFormData({ ...formData, discount_type: disc })}
                        className={`py-3 px-1.5 rounded-xl text-xs sm:text-sm font-bold border transition-all ${
                          formData.discount_type === disc
                            ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {disc}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ネット予約の場合のみ展開：予約番号数字8桁 */}
              {formData.order_route === 'ネット予約' && (
                <div className="p-4 bg-red-50 rounded-2xl border border-red-200">
                  <label className="block text-xs font-bold text-red-900 mb-1">
                    ネット予約番号 (半角数字8桁) *
                  </label>
                  <input
                    type="text"
                    maxLength={8}
                    placeholder="12345678"
                    value={formData.web_reservation_no}
                    onChange={(e) => setFormData({ ...formData, web_reservation_no: e.target.value.replace(/\D/g, '') })}
                    className="w-full sm:w-64 px-4 py-3 bg-white border border-red-300 rounded-xl font-mono text-xl font-bold tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                    required
                  />
                  <span className="text-xs text-red-700 ml-2 font-bold">
                    ※ネット予約の場合、支払情報は自動で「支払済」となります
                  </span>
                </div>
              )}

              {/* お渡し日 ＆ お渡し時刻 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    お渡し日 (12/19〜12/25) *
                  </label>
                  <select
                    value={formData.delivery_date}
                    onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 text-base focus:bg-white focus:outline-none focus:border-red-500"
                    required
                  >
                    {DELIVERY_DATES.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    お渡し時刻 (8:00〜20:00 30分刻み) *
                  </label>
                  <select
                    value={formData.delivery_time}
                    onChange={(e) => setFormData({ ...formData, delivery_time: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 text-base focus:bg-white focus:outline-none focus:border-red-500"
                    required
                  >
                    {DELIVERY_TIMES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 予約商品 ＆ 個数選択（シュトーレン2種は最後尾） */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-black text-slate-900">
                    予約商品および個数（複数選択可） *
                  </label>
                  <span className="text-xs text-slate-500 font-bold">
                    ※最大受注数に達した商品は選択できません
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {XMAS_PRODUCTS.map((prodName) => {
                    const isMaxReached = limitReachedMap[prodName] || false;
                    const itemState = formData.selectedProducts[prodName] || { selected: false, quantity: 1 };
                    const isSelected = itemState.selected;
                    const isSide = prodName.includes('シュトーレン');

                    return (
                      <div
                        key={prodName}
                        className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                          isMaxReached && !isSelected
                            ? 'bg-slate-200/70 border-slate-300 opacity-60 cursor-not-allowed'
                            : isSelected
                            ? 'bg-red-50/70 border-red-500 shadow-sm'
                            : isSide
                            ? 'bg-white/80 border-slate-200'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isMaxReached && !isSelected}
                              onChange={() => handleProductToggle(prodName)}
                              className="w-5 h-5 text-red-600 rounded border-slate-300 focus:ring-red-500"
                            />
                            <span className="text-base font-bold text-slate-900">
                              {isSide && <span className="text-xs text-slate-400 font-normal mr-1">🥖</span>}
                              {prodName}
                            </span>
                          </label>

                          {isMaxReached && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-black bg-red-600 text-white flex-shrink-0">
                              受付上限
                            </span>
                          )}
                        </div>

                        {/* 数量入力枠 */}
                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-red-200 flex items-center justify-between">
                            <span className="text-xs font-bold text-red-950">注文個数:</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleProductQuantity(prodName, itemState.quantity - 1)}
                                className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center text-lg no-print"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={99}
                                value={itemState.quantity}
                                onChange={(e) => handleProductQuantity(prodName, parseInt(e.target.value) || 1)}
                                className="w-14 text-center font-black text-lg py-1 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-red-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleProductQuantity(prodName, itemState.quantity + 1)}
                                className="w-8 h-8 rounded-lg bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center text-lg no-print"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* お客様情報：氏名 ＆ 電話番号 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    お客様の氏名 *
                  </label>
                  <input
                    type="text"
                    placeholder="例: 佐藤 花子"
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 text-base focus:bg-white focus:outline-none focus:border-red-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    お客様の電話番号 *
                  </label>
                  <input
                    type="tel"
                    placeholder="例: 090-1234-5678"
                    value={formData.customer_phone}
                    onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 text-base focus:bg-white focus:outline-none focus:border-red-500"
                    required
                  />
                </div>
              </div>

              {/* 備考欄（最大80文字） */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    備考欄 (最大80文字程度)
                  </label>
                  <span className={`text-xs font-bold ${formData.memo.length > 80 ? 'text-red-600' : 'text-slate-400'}`}>
                    {formData.memo.length} / 80 文字
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={80}
                  placeholder="例: プレートメッセージ希望、アレルギー確認済み 等"
                  value={formData.memo}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 text-base focus:bg-white focus:outline-none focus:border-red-500"
                />
              </div>

              {/* フッター：入力者名（登録ボタンの左横） ＆ 送信ボタン */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-4 border-t border-slate-100">
                
                {/* 入力者名（スタッフ氏名入力欄：登録ボタンの左横） */}
                <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200">
                  <label className="text-xs font-black text-slate-700 whitespace-nowrap">
                    入力者名 *
                  </label>
                  <input
                    type="text"
                    placeholder="スタッフ氏名"
                    value={formData.staff_name}
                    onChange={(e) => setFormData({ ...formData, staff_name: e.target.value })}
                    className="w-full sm:w-44 px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 text-sm focus:outline-none focus:border-red-500"
                    required
                  />
                </div>

                {/* ボタン群 */}
                <div className="flex items-center gap-3 no-print">
                  {editingOrderId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-5 py-3 rounded-2xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      キャンセル
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto px-8 py-3.5 rounded-2xl font-black text-white text-base bg-red-600 hover:bg-red-700 shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                  >
                    {submitting ? '処理中...' : editingOrderId ? '💾 受注内容を更新する' : '🎄 受注を登録する'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* ======================================================== */}
        {/* すでに登録された受注情報の一覧表（印刷時：ページ2） */}
        {/* ======================================================== */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 print-page-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
                <span>📋 受注登録履歴一覧</span>
                <span className="text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                  計 {sortedOrders.length} 件
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                表の見出しをクリックすると並び替えできます（デフォルト: お渡し日時順）
              </p>
            </div>

            {/* 一覧上部にも印刷・Excelダウンロードボタン（no-print） */}
            <div className="flex items-center gap-2 no-print">
              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center gap-1"
              >
                <span>🖨️</span>
                <span>印刷</span>
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={exportingExcel}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
              >
                <span>📥</span>
                <span>{exportingExcel ? '出力中...' : 'Excel出力'}</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th
                    onClick={() => handleSort('delivery')}
                    className="px-4 py-3.5 text-xs font-bold uppercase cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                  >
                    お渡し日時 {sortField === 'delivery' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  {canSwitchStore && (
                    <th
                      onClick={() => handleSort('store')}
                      className="px-4 py-3.5 text-xs font-bold uppercase cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                    >
                      店舗名 {sortField === 'store' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  )}
                  <th
                    onClick={() => handleSort('customer')}
                    className="px-4 py-3.5 text-xs font-bold uppercase cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                  >
                    お客様氏名・TEL {sortField === 'customer' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase whitespace-nowrap">
                    予約商品・数量
                  </th>
                  <th
                    onClick={() => handleSort('route')}
                    className="px-4 py-3.5 text-xs font-bold uppercase cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap"
                  >
                    ルート {sortField === 'route' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase whitespace-nowrap">
                    支払 / 割引
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase whitespace-nowrap">
                    入力者
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold uppercase whitespace-nowrap">
                    備考
                  </th>
                  {!isFactory && (
                    <th className="px-4 py-3.5 text-xs font-bold uppercase whitespace-nowrap text-right no-print">
                      操作
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={canSwitchStore ? (isFactory ? 8 : 9) : 8} className="px-6 py-12 text-center text-slate-400 font-bold">
                      登録済みの受注データはまだありません。
                    </td>
                  </tr>
                ) : (
                  sortedOrders.map((order) => {
                    const deliveryDateLabel = DELIVERY_DATES.find(d => d.value === order.delivery_date)?.label || order.delivery_date;

                    return (
                      <tr
                        key={order.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          editingOrderId === order.id ? 'bg-amber-50/70' : ''
                        }`}
                      >
                        {/* お渡し日時 */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="font-black text-slate-900 text-sm">{deliveryDateLabel}</div>
                          <div className="text-xs font-bold text-red-600">{order.delivery_time} お渡し</div>
                        </td>

                        {/* 店舗名 */}
                        {canSwitchStore && (
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="font-bold text-xs bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg">
                              {order.store_name}
                            </span>
                          </td>
                        )}

                        {/* お客様氏名・TEL */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="font-bold text-slate-900 text-sm">{order.customer_name} 様</div>
                          <div className="text-xs font-mono text-slate-500">{order.customer_phone}</div>
                        </td>

                        {/* 予約商品・数量 */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-1">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="text-xs font-bold text-slate-800 flex items-center justify-between gap-3">
                                <span>• {item.product_name}</span>
                                <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded font-black text-sm">
                                  {item.quantity}個
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* ルート */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                            order.order_route === 'ネット予約'
                              ? 'bg-blue-100 text-blue-800'
                              : order.order_route === '店舗受注'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}>
                            {order.order_route}
                          </span>
                          {order.web_reservation_no && (
                            <div className="text-[11px] font-mono text-blue-700 mt-1 font-bold">
                              No. {order.web_reservation_no}
                            </div>
                          )}
                        </td>

                        {/* 支払 / 割引 */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs font-bold">
                          <div>
                            {order.payment_status === '支払済' ? (
                              <span className="text-emerald-700">💳 支払済</span>
                            ) : (
                              <span className="text-amber-700">🏪 お渡し時</span>
                            )}
                          </div>
                          {order.discount_type && order.discount_type !== 'なし' && (
                            <span className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[11px]">
                              {order.discount_type}引
                            </span>
                          )}
                        </td>

                        {/* 入力者 */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs font-bold text-slate-600">
                          {order.staff_name}
                        </td>

                        {/* 備考 */}
                        <td className="px-4 py-3.5 text-xs text-slate-600 max-w-xs truncate">
                          {order.memo || '-'}
                        </td>

                        {/* 操作（工場アカウントには不要なので非表示） */}
                        {!isFactory && (
                          <td className="px-4 py-3.5 whitespace-nowrap text-right text-sm no-print">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleStartEdit(order)}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold text-xs transition-colors"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => handleDelete(order)}
                                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-bold text-xs transition-colors"
                              >
                                削除
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
