'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StatusCalendar() {
  const router = useRouter();
  const [registeredDates, setRegisteredDates] = useState<string[]>([]);
  const [setDates, setSetDates] = useState<string[]>([]);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(true);

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
    
    let bgClass = "bg-white dark:bg-slate-800";
    let badge = null;
    let clickableProps: any = {};
    
    if (isSet) {
      bgClass = "bg-emerald-50 dark:bg-slate-700 cursor-pointer hover:opacity-80 transition-opacity hover:ring-2 hover:ring-emerald-400";
      badge = <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✅ SET済</span>;
      clickableProps = {
        onClick: () => router.push(`/production?date=${dateStr}`),
        title: "クリックでこの日の仕込みページを開く"
      };
    } else if (isRegistered) {
      bgClass = "bg-blue-50 dark:bg-slate-700 cursor-pointer hover:opacity-80 transition-opacity hover:ring-2 hover:ring-blue-400";
      badge = <span className="text-xs font-bold text-blue-600 dark:text-blue-400">〇 登録済</span>;
      clickableProps = {
        onClick: () => router.push(`/production?date=${dateStr}`),
        title: "クリックでこの日の仕込みページを開く"
      };
    }

    days.push(
      <div 
        key={d} 
        className={`p-2 border border-slate-200 dark:border-slate-600 min-h-[80px] flex flex-col items-center justify-start ${bgClass}`}
        {...clickableProps}
      >
        <span className="font-bold text-slate-700 dark:text-slate-300">{d}</span>
        <div className="mt-1">{badge}</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 w-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span>📅</span> 登録済みオーダー状況
          {isLoading && <span className="text-sm font-normal text-slate-400 ml-2 animate-pulse">Loading...</span>}
        </h3>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-300">◀ 先月</button>
          <span className="font-bold px-4 py-1 text-slate-800 dark:text-slate-200">{year}年 {month + 1}月</span>
          <button onClick={nextMonth} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-300">来月 ▶</button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center font-bold text-slate-500 mb-2">
        <div>日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div>
      </div>
      <div className="grid grid-cols-7 border-l border-t border-slate-200 dark:border-slate-700">
        {days.map((day, idx) => (
          <div key={idx} className="border-r border-b border-slate-200 dark:border-slate-700">
            {day}
          </div>
        ))}
      </div>
    </div>
  );
}
