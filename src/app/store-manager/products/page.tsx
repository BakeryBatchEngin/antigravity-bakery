'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Plus,
  Upload,
  Download,
  Search,
  Edit2,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Tag,
} from 'lucide-react';

interface SalesProduct {
  id: number;
  product_code: string;
  product_name: string;
  retail_price: number;
  category: string;
  characteristics: string;
}

const PRESET_CATEGORIES = [
  'ハード系',
  '食パン',
  '菓子パン',
  '惣菜・調理パン',
  'サンドイッチ',
  'ヴィエノワズリー',
  '焼き菓子',
  'その他',
];

export default function SalesProductsMasterPage() {
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // モーダル用ステート
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState<string>('0');
  const [formCategory, setFormCategory] = useState('');
  const [formCharacteristics, setFormCharacteristics] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sales-products');
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'マスタの取得に失敗しました。' });
        return;
      }
      setProducts(data.products || []);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: '通信エラーが発生しました。' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // 新規作成モーダルを開く
  const openCreateModal = () => {
    setEditingId(null);
    // 次の連番コードを自動提案 (例: S-001, S-002...)
    let nextNum = products.length + 1;
    for (const p of products) {
      const m = p.product_code.match(/^S-(\d+)$/i);
      if (m) {
        nextNum = Math.max(nextNum, parseInt(m[1], 10) + 1);
      }
    }
    setFormCode(`S-${String(nextNum).padStart(3, '0')}`);
    setFormName('');
    setFormPrice('0');
    setFormCategory('');
    setFormCharacteristics('');
    setIsModalOpen(true);
  };

  // 編集モーダルを開く
  const openEditModal = (product: SalesProduct) => {
    setEditingId(product.id);
    setFormCode(product.product_code);
    setFormName(product.product_name);
    setFormPrice(String(product.retail_price ?? 0));
    setFormCategory(product.category || '');
    setFormCharacteristics(product.characteristics || '');
    setIsModalOpen(true);
  };

  // 1件保存（新規・更新）
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim() || !formName.trim()) {
      alert('「商品コード」と「商品名」を入力してください。');
      return;
    }

    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/sales-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          id: editingId,
          product_code: formCode.trim(),
          product_name: formName.trim(),
          retail_price: Number(formPrice) || 0,
          category: formCategory.trim(),
          characteristics: formCharacteristics.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '保存に失敗しました。');
      }

      setIsModalOpen(false);
      setMessage({
        type: 'success',
        text: editingId
          ? `「${formName.trim()}」の情報を更新しました。`
          : `「${formName.trim()}」（コード: ${formCode.trim()}）を登録しました。`,
      });
      await fetchProducts();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // 削除
  const handleDeleteProduct = async (product: SalesProduct) => {
    if (!confirm(`販売商品「${product.product_name}（${product.product_code}）」をマスタから削除しますか？`)) {
      return;
    }

    setMessage(null);
    try {
      const res = await fetch('/api/sales-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: product.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '削除に失敗しました。');
      }
      setMessage({ type: 'success', text: `「${product.product_name}」を削除しました。` });
      await fetchProducts();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  // Excel一括インポート
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/sales-products/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Excelの取り込みに失敗しました。');
      }

      setMessage({
        type: 'success',
        text: `Excel一括取込が完了しました！（新規登録: ${data.insertedCount}件 / 更新: ${data.updatedCount}件 / 合計: ${data.totalCount}件）`,
      });
      await fetchProducts();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 存在するカテゴリーの一覧を作成
  const availableCategories = Array.from(
    new Set([
      ...PRESET_CATEGORIES,
      ...products.map(p => p.category).filter(Boolean),
    ])
  );

  // フィルタリング
  const filteredProducts = products.filter(p => {
    const matchesCategory =
      selectedCategory === 'ALL' ||
      (selectedCategory === 'UNSET' ? !p.category : p.category === selectedCategory);
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      p.product_code.toLowerCase().includes(q) ||
      p.product_name.toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.characteristics || '').toLowerCase().includes(q);
    return matchesCategory && matchesQuery;
  });

  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-5">
      {/* ヘッダー領域 */}
      <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                title="トップへ戻る"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
                <span>🏷️ 販売商品マスタ設定</span>
                <span className="text-xs font-bold px-2.5 py-0.5 bg-rose-100 text-rose-700 rounded-full">
                  ロス管理専用・企業共通
                </span>
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 ml-8">
              ここに登録された商品（商品名）のみが、各店舗の「オーダー表 一括読込」で取り込まれます。仕込みエンジンの商品マスタとは完全に独立しています。
            </p>
          </div>

          {/* 操作ボタン群 */}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/sales-products/export"
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-colors border border-slate-300"
            >
              <Download className="w-4 h-4" />
              <span>Excel出力（テンプレート）</span>
            </a>

            <input
              type="file"
              accept=".xlsx, .xls"
              ref={fileInputRef}
              className="hidden"
              onChange={handleExcelImport}
            />
            <button
              type="button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition-colors"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>{isImporting ? '読込中...' : 'Excel一括登録・更新'}</span>
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>新規商品を追加</span>
            </button>
          </div>
        </div>

        {/* 検索＆カテゴリーフィルタ */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 border-t border-slate-100">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="商品コード、商品名、カテゴリー、特性で検索..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">すべてのカテゴリー ({products.length})</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="UNSET">カテゴリー未設定</option>
            </select>
          </div>
        </div>
      </div>

      {/* メッセージ通知 */}
      {message && (
        <div
          className={`p-3.5 rounded-xl flex items-start gap-2.5 text-sm border ${
            message.type === 'error'
              ? 'bg-red-50 text-red-800 border-red-200'
              : 'bg-emerald-50 text-emerald-900 border-emerald-200'
          }`}
        >
          {message.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          )}
          <p className="font-bold">{message.text}</p>
        </div>
      )}

      {/* 商品一覧テーブル */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm font-semibold">販売商品マスタを読み込み中...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-slate-600 font-bold text-base">
              {products.length === 0
                ? 'まだ販売商品マスタが登録されていません。'
                : '条件に一致する商品が見つかりませんでした。'}
            </p>
            {products.length === 0 && (
              <p className="text-slate-500 text-xs sm:text-sm max-w-xl mx-auto">
                右上の「Excel出力（テンプレート）」から雛形をダウンロードして「Excel一括登録・更新」で読み込むか、「新規商品を追加」ボタンから登録してください。
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase">
                  <th className="py-3 px-4 whitespace-nowrap">商品コード</th>
                  <th className="py-3 px-4 whitespace-nowrap">商品名（オーダー表照合名）</th>
                  <th className="py-3 px-4 whitespace-nowrap text-right">価格</th>
                  <th className="py-3 px-4 whitespace-nowrap">カテゴリー</th>
                  <th className="py-3 px-4">商品の特性（AI分析・認識用テキスト）</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredProducts.map(product => (
                  <tr key={product.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-mono font-bold text-xs px-2 py-1 bg-slate-100 text-slate-800 rounded-md border border-slate-200">
                        {product.product_code}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                      {product.product_name}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-800 tabular-nums whitespace-nowrap">
                      ¥{(product.retail_price || 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {product.category ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                          {product.category}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">未設定</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs sm:text-sm max-w-md">
                      {product.characteristics || (
                        <span className="text-slate-400 text-xs">―</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(product)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="編集"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(product)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 新規作成・編集モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-extrabold text-slate-900">
                {editingId ? '販売商品マスタの編集' : '新規販売商品の登録'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    商品コード <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={e => setFormCode(e.target.value)}
                    placeholder="例: S-001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    価格（円）
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formPrice}
                    onChange={e => setFormPrice(e.target.value)}
                    placeholder="例: 351"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  商品名（オーダー表ExcelのC列と一致する名称） <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="例: バゲット"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  商品カテゴリー
                </label>
                <input
                  type="text"
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  placeholder="例: ハード系、サンドイッチ、菓子パン など"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                />
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFormCategory(cat)}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
                        formCategory === cat
                          ? 'bg-amber-600 text-white'
                          : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  商品の特性（AI分析・カメラ認識用の自由記述）
                </label>
                <textarea
                  rows={3}
                  value={formCharacteristics}
                  onChange={e => setFormCharacteristics(e.target.value)}
                  placeholder="例: 看板商品のため夕方まで欠品厳禁。残っても翌日ラスクに加工可能。見た目は細長いフランスパンでクープ3本。"
                  className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold shadow flex items-center gap-1.5"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingId ? '更新する' : '登録する'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
