'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type IngredientResult = {
  code: string;
  name: string;
  totalGrams: number;
};

export default function UsageForecastPage() {
  const router = useRouter();
  const [registeredDates, setRegisteredDates] = useState<string[]>([]);
  const [setDates, setSetDates] = useState<string[]>([]);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [forecastResult, setForecastResult] = useState<IngredientResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDates = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/orders');
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setRegisteredDates(data.registeredDates || []);
            setSetDates(data.setDates || []);
          }
        }
      } catch (err) {
        console.error('Failed to fetch dates:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDates();
  }, []);

  const toggleDate = (dateStr: string) => {
    if (selectedDates.includes(dateStr)) {
      setSelectedDates(selectedDates.filter(d => d !== dateStr));
    } else {
      setSelectedDates([...selectedDates, dateStr]);
    }
  };

  const handleCalculate = async () => {
    if (selectedDates.length === 0) return;
    
    setIsCalculating(true);
    setError(null);
    setForecastResult(null);

    try {
      const res = await fetch('/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: selectedDates })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setForecastResult(data.ingredients);
      } else {
        setError(data.error || '計算に失敗しました');
      }
    } catch (err) {
      setError('通信エラーが発生しました');
      console.error(err);
    } finally {
      setIsCalculating(false);
    }
  };

  // カレンダー構築
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="p-2 border border-slate-100 bg-slate-50 dark:bg-slate-800 dark:border-slate-700"></div>);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isSet = setDates.includes(dateStr);
    const isRegistered = registeredDates.includes(dateStr);
    const hasOrder = isSet || isRegistered;
    const isSelected = selectedDates.includes(dateStr);
    
    let bgClass = "bg-white dark:bg-slate-800 text-slate-300";
    let badge = null;
    let clickableProps: any = {};
    
    if (hasOrder) {
      if (isSelected) {
        bgClass = "bg-amber-500 text-white cursor-pointer hover:bg-amber-600 shadow-md ring-2 ring-amber-500 ring-offset-2";
        badge = <span className="text-xs font-bold text-white mt-1">選択中</span>;
      } else {
        bgClass = "bg-emerald-50 dark:bg-slate-700 cursor-pointer hover:bg-emerald-100 transition-colors border-emerald-200";
        badge = <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1">
          {isSet ? 'SET済' : '登録済'}
        </span>;
      }
      clickableProps = {
        onClick: () => toggleDate(dateStr)
      };
    }

    days.push(
      <div 
        key={d} 
        className={`p-2 border border-slate-200 dark:border-slate-600 min-h-[80px] flex flex-col items-center justify-center transition-all ${bgClass}`}
        {...clickableProps}
      >
        <span className="font-bold text-xl">{d}</span>
        {badge}
      </div>
    );
  }

  // 重量フォーマット関数 (1kg以上は0.1kg単位、1kg未満はg単位)
  const formatWeight = (grams: number) => {
    if (grams >= 1000) {
      const kg = Math.round(grams / 100) / 10;
      return `${kg.toFixed(1)} Kg`;
    } else {
      return `${Math.round(grams)} g`;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8 flex flex-col items-center">
      <div className="w-full max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
              <span>📅</span> Usage Forecast (予定使用料予測)
            </h1>
            <p className="text-slate-500 mt-2">
              カレンダーからオーダーのある日付を複数選択し、必要な原材料の合計を計算します。
            </p>
          </div>
          <button 
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors"
          >
            戻る
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* 左側：カレンダー */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-lg border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                日付の選択
                {isLoading && <span className="text-sm font-normal text-slate-400 ml-2 animate-pulse">Loading...</span>}
              </h3>
              <div className="flex gap-2">
                <button onClick={prevMonth} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-300">◀</button>
                <span className="font-bold px-4 py-1 text-slate-800 dark:text-slate-200">{year}年 {month + 1}月</span>
                <button onClick={nextMonth} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-300">▶</button>
              </div>
            </div>
            
            <div className="grid grid-cols-7 text-center font-bold text-slate-500 mb-2">
              <div>日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div>
            </div>
            <div className="grid grid-cols-7 border-l border-t border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              {days.map((day, idx) => (
                <div key={idx} className="border-r border-b border-slate-200 dark:border-slate-700">
                  {day}
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="text-slate-600 dark:text-slate-300">
                  選択中: <span className="font-bold text-xl text-amber-600">{selectedDates.length}</span> 日
                </div>
                {selectedDates.length > 0 && (
                  <button 
                    onClick={() => setSelectedDates([])}
                    className="text-sm text-slate-400 hover:text-slate-600 underline"
                  >
                    選択をクリア
                  </button>
                )}
              </div>
              
              <button
                onClick={handleCalculate}
                disabled={selectedDates.length === 0 || isCalculating}
                className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xl rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isCalculating ? (
                  <>計算中...</>
                ) : (
                  <><span>🧮</span> 合計使用量を計算する</>
                )}
              </button>
            </div>
          </div>

          {/* 右側：計算結果 */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-lg border border-slate-200 dark:border-slate-700 min-h-[500px] flex flex-col">
            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2 pb-4 border-b border-slate-100 dark:border-slate-700">
              <span>📋</span> 計算結果
            </h3>
            
            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-xl mb-4 font-bold">
                {error}
              </div>
            )}

            {forecastResult ? (
              <div className="flex-1 overflow-y-auto pr-2">
                {forecastResult.length === 0 ? (
                  <div className="text-center text-slate-400 py-10">
                    対象日の原材料データが見つかりませんでした。
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {forecastResult.map((item, index) => (
                      <li key={index} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-amber-300 transition-colors">
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-400">{item.code}</span>
                          <span className="text-xl font-bold text-slate-800 dark:text-slate-100">{item.name}</span>
                        </div>
                        <div className="text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
                          {formatWeight(item.totalGrams)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                <span className="text-6xl mb-4 opacity-20">🧮</span>
                <p className="text-lg">左のカレンダーから日付を選択して<br/>「計算する」ボタンを押してください</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
