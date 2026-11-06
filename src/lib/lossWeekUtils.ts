// src/lib/lossWeekUtils.ts
// 週・月・年の集計期間計算ユーティリティ
// ルール:
//  - 月曜始まり・日曜終わり（7日間）
//  - 第1週 (Week 1): 1月1日を含む週（月曜〜日曜）

// UTC日付ヘルパー（タイムゾーンによる日ズレを完全に防ぐ）
export function createUtcDate(year: number, month1Based: number, day: number): Date {
  return new Date(Date.UTC(year, month1Based - 1, day, 0, 0, 0, 0));
}

export function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatMd(d: Date): string {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${m}/${day}`;
}

// 任意年の Week 1 の月曜日の日付を取得
export function getWeek1Monday(year: number): Date {
  const jan1 = createUtcDate(year, 1, 1);
  const dayOfWeek = jan1.getUTCDay(); // 0: 日, 1: 月, ..., 6: 土
  const offset = (dayOfWeek + 6) % 7; // 月曜=0, 火曜=1, ..., 日曜=6
  const mon = new Date(jan1.getTime());
  mon.setUTCDate(mon.getUTCDate() - offset);
  return mon;
}

// 任意年・週番号の期間（月曜〜日曜）を取得
export interface WeekRange {
  year: number;
  week: number;
  startDate: string; // YYYY-MM-DD (月曜)
  endDate: string;   // YYYY-MM-DD (日曜)
  label: string;     // 例: "2026年 第46週 (11/09 〜 11/15)"
  shortLabel: string;// 例: "第46週"
  dates: string[];   // 月〜日の7日間の配列
}

export function getWeekRange(year: number, week: number): WeekRange {
  const w1Mon = getWeek1Monday(year);
  const targetMon = new Date(w1Mon.getTime());
  targetMon.setUTCDate(targetMon.getUTCDate() + (week - 1) * 7);

  const targetSun = new Date(targetMon.getTime());
  targetSun.setUTCDate(targetSun.getUTCDate() + 6);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(targetMon.getTime());
    cur.setUTCDate(cur.getUTCDate() + i);
    dates.push(formatYmd(cur));
  }

  const startDate = formatYmd(targetMon);
  const endDate = formatYmd(targetSun);

  return {
    year,
    week,
    startDate,
    endDate,
    label: `${year}年 第${week}週 (${formatMd(targetMon)} 〜 ${formatMd(targetSun)})`,
    shortLabel: `第${week}週`,
    dates,
  };
}

// 指定した年が何週まであるか判定（通常52週、年によって53週）
export function getTotalWeeksInYear(year: number): number {
  const nextYearW1Mon = getWeek1Monday(year + 1);
  const currentW1Mon = getWeek1Monday(year);
  const diffMs = nextYearW1Mon.getTime() - currentW1Mon.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.round(diffDays / 7);
}

// 任意の日付 (YYYY-MM-DD) が属する年・週番号を計算
export function getWeekInfoFromDate(dateStr: string): WeekRange {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = createUtcDate(y, m, d);

  // 候補となる年 (前年、当年、翌年)
  for (const candidateYear of [y, y - 1, y + 1]) {
    const w1Mon = getWeek1Monday(candidateYear);
    const diffDays = Math.floor((target.getTime() - w1Mon.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0) {
      const weekIndex = Math.floor(diffDays / 7) + 1;
      const totalWeeks = getTotalWeeksInYear(candidateYear);
      if (weekIndex <= totalWeeks) {
        return getWeekRange(candidateYear, weekIndex);
      }
    }
  }

  // フォールバック
  return getWeekRange(y, 1);
}

// 月次表示用：指定月の週リスト（当月分のみの日付で区切る）
export interface MonthWeekSegment {
  weekNumber: number;
  year: number;
  label: string;       // 例: "第45週 (11/02〜11/08)" または "第44週 (11/01)"
  shortLabel: string;  // 例: "第45週"
  startDate: string;   // 当月内での開始日
  endDate: string;     // 当月内での終了日
  dates: string[];     // 当月に含まれる日付リスト
}

export function getMonthWeeks(year: number, month: number): MonthWeekSegment[] {
  // 指定月の日数を取得
  const firstDay = createUtcDate(year, month, 1);
  const lastDay = createUtcDate(year, month + 1, 0); // 翌月0日 = 当月末日
  const totalDays = lastDay.getUTCDate();

  // 日付ごとに所属する週を判定してグループ化
  const weekMap = new Map<string, { year: number; week: number; dates: string[] }>();
  const weekOrder: string[] = [];

  for (let d = 1; d <= totalDays; d++) {
    const dt = createUtcDate(year, month, d);
    const dtStr = formatYmd(dt);
    const weekInfo = getWeekInfoFromDate(dtStr);
    const key = `${weekInfo.year}-W${weekInfo.week}`;

    if (!weekMap.has(key)) {
      weekMap.set(key, { year: weekInfo.year, week: weekInfo.week, dates: [] });
      weekOrder.push(key);
    }
    weekMap.get(key)!.dates.push(dtStr);
  }

  // セグメント情報を生成
  return weekOrder.map(key => {
    const info = weekMap.get(key)!;
    const dates = info.dates;
    const sDate = dates[0];
    const eDate = dates[dates.length - 1];

    const sParts = sDate.split('-');
    const eParts = eDate.split('-');
    const sMd = `${parseInt(sParts[1], 10)}/${parseInt(sParts[2], 10)}`;
    const eMd = `${parseInt(eParts[1], 10)}/${parseInt(eParts[2], 10)}`;

    const dateRangeLabel = sDate === eDate ? sMd : `${sMd}〜${eMd}`;

    return {
      year: info.year,
      weekNumber: info.week,
      label: `第${info.week}週 (${dateRangeLabel})`,
      shortLabel: `第${info.week}週`,
      startDate: sDate,
      endDate: eDate,
      dates,
    };
  });
}

// 年次表示用：指定年の12ヶ月のリスト
export interface YearMonthSegment {
  year: number;
  month: number;
  label: string;       // 例: "1月"
  startDate: string;   // YYYY-MM-01
  endDate: string;     // YYYY-MM-末日
  dates: string[];
}

export function getYearMonths(year: number): YearMonthSegment[] {
  const result: YearMonthSegment[] = [];
  for (let m = 1; m <= 12; m++) {
    const firstDay = createUtcDate(year, m, 1);
    const lastDay = createUtcDate(year, m + 1, 0);
    const totalDays = lastDay.getUTCDate();

    const dates: string[] = [];
    for (let d = 1; d <= totalDays; d++) {
      dates.push(formatYmd(createUtcDate(year, m, d)));
    }

    result.push({
      year,
      month: m,
      label: `${m}月`,
      startDate: formatYmd(firstDay),
      endDate: formatYmd(lastDay),
      dates,
    });
  }
  return result;
}
