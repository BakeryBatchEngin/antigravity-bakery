'use client';

import React, { useState } from 'react';

export interface TrendSegment {
  key: string;
  label: string;
  shortLabel: string;
  metrics: {
    soldAmount: number;
    orderAmount: number;
    deliveryAmount: number;
    wasteAmount: number;
    wasteRate: number;
    sampleAmount: number;
    sampleRate: number;
  };
}

interface LossTrendChartProps {
  segments: TrendSegment[];
  height?: number;
}

export default function LossTrendChart({ segments, height = 320 }: LossTrendChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!segments || segments.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-50 rounded-xl text-gray-400 text-sm">
        データがありません
      </div>
    );
  }

  // 最大金額（左軸用）
  const maxAmount = Math.max(
    ...segments.map(s => Math.max(s.metrics.soldAmount, s.metrics.deliveryAmount, s.metrics.wasteAmount)),
    10000
  );
  // キリの良い上限値に切り上げ
  const niceMaxAmount = Math.ceil(maxAmount / 10000) * 10000;

  // 最大ロス率（右軸用）
  const maxRate = Math.max(...segments.map(s => s.metrics.wasteRate), 0.05);
  // キリの良い上限比率（例: 0.1, 0.15, 0.2 など）
  const niceMaxRate = Math.max(0.1, Math.ceil(maxRate * 20) / 20);

  // SVGの座標レイアウト
  const svgWidth = 800;
  const svgHeight = height;
  const padding = { top: 25, right: 55, bottom: 45, left: 65 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  // X軸のステップ幅
  const segmentCount = segments.length;
  const colWidth = chartWidth / segmentCount;

  // Y軸スケール関数
  const getYAmount = (val: number) => {
    return padding.top + chartHeight - (val / niceMaxAmount) * chartHeight;
  };

  const getYRate = (val: number) => {
    return padding.top + chartHeight - Math.min(1, val / niceMaxRate) * chartHeight;
  };

  // 左軸目盛り（4分割）
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(ratio => ({
    val: Math.round(niceMaxAmount * ratio),
    y: padding.top + chartHeight - ratio * chartHeight,
    rateVal: (niceMaxRate * ratio * 100).toFixed(1),
  }));

  // 折れ線グラフのパス作成（ロス率）
  const linePoints = segments.map((seg, idx) => {
    const cx = padding.left + idx * colWidth + colWidth / 2;
    const cy = getYRate(seg.metrics.wasteRate);
    return { cx, cy, seg };
  });

  const linePathD = linePoints.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.cx} ${pt.cy}` : `${acc} L ${pt.cx} ${pt.cy}`),
    ''
  );

  return (
    <div className="w-full bg-white rounded-2xl border p-4 sm:p-5 shadow-sm space-y-3">
      {/* グラフヘッダーと凡例 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b">
        <div>
          <h3 className="text-sm sm:text-base font-extrabold text-gray-800">推移グラフ</h3>
          <p className="text-[11px] text-gray-500">販売総額・納品総額・ロス総額（棒）と ロス率（折れ線）</p>
        </div>

        {/* 凡例 (Legend) */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          <div className="flex items-center gap-1.5 text-emerald-800">
            <span className="w-3 h-3 rounded-xs bg-emerald-500"></span>
            <span>販売総額</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-700">
            <span className="w-3 h-3 rounded-xs bg-slate-400"></span>
            <span>納品総額</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-700">
            <span className="w-3 h-3 rounded-xs bg-rose-500"></span>
            <span>ロス総額</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-800">
            <span className="w-4 h-0.5 bg-amber-500"></span>
            <span className="w-2 h-2 rounded-full bg-amber-500 -ml-2"></span>
            <span>ロス率</span>
          </div>
        </div>
      </div>

      {/* SVGチャート本体 */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto min-w-[600px] select-none font-sans"
        >
          {/* 背景グリッド線とY軸ラベル */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padding.left}
                y1={tick.y}
                x2={padding.left + chartWidth}
                y2={tick.y}
                stroke={i === 0 ? '#94a3b8' : '#e2e8f0'}
                strokeWidth={i === 0 ? 1.5 : 1}
                strokeDasharray={i === 0 ? 'none' : '3 3'}
              />
              {/* 左軸: 金額 */}
              <text
                x={padding.left - 8}
                y={tick.y + 4}
                textAnchor="end"
                className="text-[10px] fill-gray-400 font-mono"
              >
                ¥{(tick.val / 10000).toFixed(0)}万
              </text>
              {/* 右軸: ロス率 */}
              <text
                x={padding.left + chartWidth + 8}
                y={tick.y + 4}
                textAnchor="start"
                className="text-[10px] fill-amber-700 font-mono font-bold"
              >
                {tick.rateVal}%
              </text>
            </g>
          ))}

          {/* 棒グラフ（セグメントごと） */}
          {segments.map((seg, idx) => {
            const colCenterX = padding.left + idx * colWidth + colWidth / 2;
            const barGroupWidth = Math.min(48, colWidth * 0.7);
            const singleBarWidth = Math.max(6, barGroupWidth / 3 - 2);

            // 棒の左座標
            const xSold = colCenterX - barGroupWidth / 2;
            const xDelivery = xSold + singleBarWidth + 2;
            const xWaste = xDelivery + singleBarWidth + 2;

            // Y座標と高さ
            const yZero = padding.top + chartHeight;
            const ySold = getYAmount(seg.metrics.soldAmount);
            const hSold = Math.max(0, yZero - ySold);

            const yDelivery = getYAmount(seg.metrics.deliveryAmount);
            const hDelivery = Math.max(0, yZero - yDelivery);

            const yWaste = getYAmount(seg.metrics.wasteAmount);
            const hWaste = Math.max(0, yZero - yWaste);

            const isHovered = hoveredIdx === idx;

            return (
              <g
                key={seg.key}
                className="cursor-pointer transition-opacity"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* ホバー時の背景ハイライト */}
                {isHovered && (
                  <rect
                    x={padding.left + idx * colWidth}
                    y={padding.top}
                    width={colWidth}
                    height={chartHeight}
                    fill="#f1f5f9"
                    opacity={0.6}
                    rx={6}
                  />
                )}

                {/* 納品総額バー */}
                <rect
                  x={xDelivery}
                  y={yDelivery}
                  width={singleBarWidth}
                  height={hDelivery}
                  fill="#94a3b8"
                  rx={2}
                  className="transition-all hover:opacity-80"
                />

                {/* 販売総額バー */}
                <rect
                  x={xSold}
                  y={ySold}
                  width={singleBarWidth}
                  height={hSold}
                  fill="#10b981"
                  rx={2}
                  className="transition-all hover:opacity-80"
                />

                {/* ロス総額バー */}
                <rect
                  x={xWaste}
                  y={yWaste}
                  width={singleBarWidth}
                  height={hWaste}
                  fill="#f43f5e"
                  rx={2}
                  className="transition-all hover:opacity-80"
                />

                {/* X軸ラベル */}
                <text
                  x={colCenterX}
                  y={padding.top + chartHeight + 16}
                  textAnchor="middle"
                  className={`text-[11px] font-bold ${
                    isHovered ? 'fill-emerald-800 font-extrabold' : 'fill-gray-600'
                  }`}
                >
                  {seg.shortLabel}
                </text>
                {seg.label !== seg.shortLabel && (
                  <text
                    x={colCenterX}
                    y={padding.top + chartHeight + 28}
                    textAnchor="middle"
                    className="text-[9px] fill-gray-400"
                  >
                    {seg.label.replace(/^.*\((.+)\)$/, '$1')}
                  </text>
                )}
              </g>
            );
          })}

          {/* 折れ線グラフ（ロス率） */}
          <path
            d={linePathD}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 折れ線のマーカーポイント */}
          {linePoints.map((pt, idx) => {
            const isHovered = hoveredIdx === idx;
            return (
              <g key={idx}>
                <circle
                  cx={pt.cx}
                  cy={pt.cy}
                  r={isHovered ? 5.5 : 3.5}
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth={2}
                  className="transition-all"
                />
              </g>
            );
          })}
        </svg>

        {/* ホバー時の詳細ツールチップ（HTML） */}
        {hoveredIdx !== null && segments[hoveredIdx] && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white px-3.5 py-2 rounded-xl text-xs shadow-lg backdrop-blur-xs pointer-events-none flex items-center gap-4 border border-slate-700 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="font-extrabold border-r border-slate-700 pr-3">
              <span className="text-emerald-400">{segments[hoveredIdx].label}</span>
            </div>
            <div className="flex items-center gap-3 font-mono">
              <div>
                <span className="text-[10px] text-gray-400 block">販売総額</span>
                <span className="text-emerald-400 font-bold">
                  ¥{segments[hoveredIdx].metrics.soldAmount.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">納品総額</span>
                <span className="text-slate-300 font-bold">
                  ¥{segments[hoveredIdx].metrics.deliveryAmount.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">ロス総額</span>
                <span className="text-rose-400 font-bold">
                  ¥{segments[hoveredIdx].metrics.wasteAmount.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">ロス率</span>
                <span className="text-amber-400 font-bold">
                  {(segments[hoveredIdx].metrics.wasteRate * 100).toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
