'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
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
        throw new Error(data.error || 'ログインに失敗しました');
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-8">Bakery Batch Engine</h1>
          <div className="text-slate-500 font-medium">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-4 sm:p-6">
      <div className="w-full max-w-md">
        
        {/* ロゴ・タイトル部分 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-white tracking-tight">
            Bakery Batch Engine
          </h1>
          <p className="text-slate-400 mt-3 font-medium text-lg">
            ベーカリー仕込み支援エンジン
          </p>
        </div>

        {/* ログインフォーム */}
        {/* 背景を黒っぽい色(bg-slate-900)に同化させ、ボーダーでわずかに区切るか、影だけで浮かせる */}
        <div className="bg-slate-900 rounded-3xl overflow-hidden p-8 sm:p-10 border border-slate-800 shadow-2xl">
          
          {error && (
            <div className="mb-6 p-4 bg-red-900/50 text-red-200 rounded-2xl text-center font-bold border border-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-6">
            
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-2 ml-1">
                ログインID (店舗ID)
              </label>
              <input 
                type="text" 
                className="w-full p-4 text-xl font-bold text-white bg-slate-800 border-2 border-slate-700 rounded-2xl focus:bg-slate-800 focus:border-amber-500 focus:ring-0 outline-none transition-colors placeholder:text-slate-500"
                placeholder="IDを入力"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-300 mb-2 ml-1">
                パスワード / PIN
              </label>
              <input 
                type="password" 
                className="w-full p-4 text-2xl tracking-widest font-mono font-bold text-white bg-slate-800 border-2 border-slate-700 rounded-2xl focus:bg-slate-800 focus:border-amber-500 focus:ring-0 outline-none transition-colors placeholder:text-slate-500"
                placeholder="••••"
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
                  ログイン中...
                </span>
              ) : (
                'ログイン'
              )}
            </button>
            
          </form>
        </div>
        
        {/* バージョン表示 */}
        <div className="text-center mt-10">
          <p className="text-slate-500 text-sm font-medium">
            Ver. 2.11
          </p>
        </div>

      </div>
    </div>
  );

