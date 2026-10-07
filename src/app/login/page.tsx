'use client';

import { useState, useEffect } from 'react';
import LoadingSpinner from "@/components/LoadingSpinner";
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const isProduction = process.env.NODE_ENV === 'production';
  const bgClass = isProduction ? "bg-slate-50" : "bg-orange-50";
  const textClass = isProduction ? "text-slate-900" : "text-orange-950";
  const subtitleClass = isProduction ? "text-slate-500" : "text-orange-700";
  const formCardClass = isProduction ? "bg-white border-slate-200" : "bg-white border-orange-200";
  const inputBgClass = isProduction ? "bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-slate-500" : "bg-orange-50 border-orange-200 text-orange-950 placeholder:text-orange-400 focus:border-amber-500";
  const labelClass = isProduction ? "text-slate-700" : "text-orange-800";

  const [username, setUsername] = useState('');
  const [passwordOrPin, setPasswordOrPin] = useState('');
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          pin: passwordOrPin,
          password: passwordOrPin,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '繝ｭ繧ｰ繧､繝ｳ縺ｫ螟ｱ謨励＠縺ｾ縺励◆');
      }

      router.push('/');
      router.refresh();
      window.dispatchEvent(new Event('roleChange'));
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  if (!mounted) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${bgClass} p-4`}>
        <div className="w-full max-w-md text-center">
          <h1 className={`text-3xl font-extrabold ${textClass} tracking-tight mb-8`}>Bakery Batch Engine</h1>
          <div className="scale-75"><LoadingSpinner /></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center ${bgClass} p-4 sm:p-6`}>
      <div className="w-full max-w-md">
        
        {/* 繝ｭ繧ｴ繝ｻ繧ｿ繧､繝医Ν驛ｨ蛻・*/}
        <div className="text-center mb-8">
          <h1 className={`text-4xl font-extrabold ${textClass} tracking-tight`}>
            Bakery Batch Engine
          </h1>
          <p className={`mt-3 font-medium text-lg ${subtitleClass}`}>
            繝吶・繧ｫ繝ｪ繝ｼ莉戊ｾｼ縺ｿ謾ｯ謠ｴ繧ｨ繝ｳ繧ｸ繝ｳ
          </p>
        </div>

        {/* 繝ｭ繧ｰ繧､繝ｳ繝輔か繝ｼ繝 */}
        {/* 閭梧勹繧帝ｻ偵▲縺ｽ縺・牡(bg-slate-900)縺ｫ蜷悟喧縺輔○縲√・繝ｼ繝繝ｼ縺ｧ繧上★縺九↓蛹ｺ蛻・ｋ縺九∝ｽｱ縺縺代〒豬ｮ縺九○繧・*/}
        <div className={`rounded-3xl overflow-hidden p-8 sm:p-10 border shadow-xl ${formCardClass}`}>
          
          {error && (
            <div className="mb-6 p-4 bg-red-900/50 text-red-200 rounded-2xl text-center font-bold border border-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-6">
            
            <div>
              <label className={`block text-sm font-bold mb-2 ml-1 ${labelClass}`}>
                繝ｭ繧ｰ繧､繝ｳID (蠎苓・ID)
              </label>
              <input 
                type="text" 
                className={`w-full p-4 text-xl font-bold border-2 rounded-2xl focus:ring-0 outline-none transition-colors ${inputBgClass}`}
                placeholder="ID繧貞・蜉・
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className={`block text-sm font-bold mb-2 ml-1 ${labelClass}`}>
                繝代せ繝ｯ繝ｼ繝・/ PIN
              </label>
              <input 
                type="password" 
                className="w-full p-4 text-2xl tracking-widest font-mono font-bold text-white bg-slate-800 border-2 border-slate-700 rounded-2xl focus:bg-slate-800 focus:border-amber-500 focus:ring-0 outline-none transition-colors placeholder:text-slate-500"
                placeholder="窶｢窶｢窶｢窶｢"
                value={passwordOrPin}
                onChange={(e) => setPasswordOrPin(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            
            <button 
              type="submit" 
              disabled={!username || !passwordOrPin || isLoading}
              className="w-full py-5 bg-amber-500 text-white text-xl font-extrabold rounded-2xl hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 transition-all mt-4 flex items-center justify-center"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  繝ｭ繧ｰ繧､繝ｳ荳ｭ...
                </span>
              ) : (
                '繝ｭ繧ｰ繧､繝ｳ'
              )}
            </button>
            
          </form>
        </div>
        
        {/* 繝舌・繧ｸ繝ｧ繝ｳ陦ｨ遉ｺ */}
        <div className="text-center mt-10">
          <p className="text-slate-500 text-sm font-medium">
            Ver. 3.43
          </p>
        </div>

      </div>
    </div>
  );
}
