import React from 'react';

interface Props {
  text?: string;
  fullScreen?: boolean;
}

export default function LoadingSpinner({ text = 'Loading...', fullScreen = false }: Props) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <div className="relative w-20 h-20 sm:w-24 sm:h-24">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src="/loading-logo.png" 
          alt="Loading" 
          className="w-full h-full object-contain animate-[spin_3s_linear_infinite] drop-shadow-md"
        />
      </div>
      {text && <p className="text-slate-500 font-bold tracking-widest animate-pulse">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-slate-50/80 backdrop-blur-sm z-50 flex items-center justify-center">
        {content}
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[200px] flex items-center justify-center">
      {content}
    </div>
  );
}
