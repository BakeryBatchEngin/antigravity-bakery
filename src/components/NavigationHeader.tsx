'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function NavigationHeader() {
  const [user, setUser] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  // activeStoreId 縺ｯ 謨ｰ蛟､・亥ｺ苓・ID・峨∪縺溘・ "manager"・医・繝阪・繧ｸ繝｣繝ｼ繝｢繝ｼ繝会ｼ峨∪縺溘・ null
  const [activeStoreId, setActiveStoreId] = useState<number | 'manager' | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        setUser(data.user);
        if (data.stores) setStores(data.stores);
        if (data.activeStoreId !== undefined) setActiveStoreId(data.activeStoreId);
      } catch (err) {
        setUser(null);
        setStores([]);
      }
    };
    fetchUser();

    window.addEventListener('roleChange', fetchUser);
    return () => window.removeEventListener('roleChange', fetchUser);
  }, []);

  const handleLogout = async () => {
    if (!confirm('繝ｭ繧ｰ繧｢繧ｦ繝医＠縺ｾ縺吶°・・)) return;
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setStores([]);
      setActiveStoreId(null);
      window.dispatchEvent(new Event('roleChange'));
      router.push('/login');
    } catch (e) {
      console.error(e);
    }
  };

  // 繧ｻ繝ｬ繧ｯ繝医・繝・け繧ｹ縺ｮ蛟､縺悟､峨ｏ縺｣縺溘→縺搾ｼ・manager" 縺ｾ縺溘・ 蠎苓・ID縺ｮ謨ｰ蛟､譁・ｭ怜・・・
  const handleStoreChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    try {
      const res = await fetch('/api/auth/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // "manager" 縺ｯ縺昴・縺ｾ縺ｾ縲∵焚蛟､譁・ｭ怜・縺ｯ謨ｰ蛟､縺ｫ螟画鋤縺励※騾√ｋ
        body: JSON.stringify({ store_id: val === 'manager' ? 'manager' : Number(val) })
      });
      
      if (res.ok) {
        setActiveStoreId(val === 'manager' ? 'manager' : Number(val));
        // Next.js縺ｮ繧ｭ繝｣繝・す繝･繧偵け繝ｪ繧｢縺励※迥ｶ諷九ｒ譖ｴ譁ｰ
        router.refresh();
        setTimeout(() => {
          window.location.reload();
        }, 200);
      }
    } catch (error) {
      console.error('Failed to switch store', error);
    }
  };

  const isProduction = process.env.NODE_ENV === 'production';
  const headerBgClass = isProduction ? "bg-[#f1f3f4] border-slate-200" : "bg-[#f7f0e5] border-[#ebe4d9]";
  const headerTextClass = isProduction ? "text-slate-900" : "text-orange-950";
  const headerSubtitleClass = isProduction ? "text-slate-600" : "text-orange-700";

  // 繝ｭ繧ｰ繧､繝ｳ逕ｻ髱｢縺ｧ縺ｯ繝倥ャ繝繝ｼ縺ｮ繝・・繝ｫ繝舌・繧偵す繝ｳ繝励Ν縺ｫ
  if (pathname === '/login') {
    return (
      <header className={`${headerBgClass} shadow-sm border-b relative overflow-hidden`}>
        <div className="container mx-auto px-4 py-3 flex items-center justify-center relative z-10">
          <img src="/logo-pat.png" alt="Bakery Batch Engine" className="h-14 sm:h-20 w-auto object-contain drop-shadow-sm rounded-lg" />
        </div>
      </header>
    );
  }

  const role = user?.role;
  const isMasterOrAdmin = role === 'admin' || role === 'master';
  const isManager = role === 'manager';

  // 繝槭ロ繝ｼ繧ｸ繝｣繝ｼ縺梧球蠖薙〒縺阪ｋ蠎苓・繝ｪ繧ｹ繝茨ｼ郁・蛻・・storeIds 縺ｫ蜷ｫ縺ｾ繧後ｋ繧ゅ・・・
  const managerStores = isManager
    ? stores.filter(s => user?.storeIds?.includes(s.id))
    : [];

  return (
    <header className={`${headerBgClass} shadow-sm border-b relative overflow-hidden`}>
      <div className="container mx-auto px-4 py-3 flex items-center justify-between relative z-10">
        <Link href="/" className="hover:opacity-80 transition-opacity flex items-end gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src="/logo-pat.png" 
            alt="Bakery Batch Engine" 
            className="h-14 sm:h-20 w-auto object-contain drop-shadow-sm rounded-lg"
          />
          <span className={`text-xs font-bold mb-2 ${headerSubtitleClass}`}>Ver. 3.43</span>
        </Link>
        
        {/* 繝ｦ繝ｼ繧ｶ繝ｼ諠・ｱ・・Ο繧ｰ繧｢繧ｦ繝・*/}
        {user && (
          <div className="flex items-center gap-4">
            
            {/* ===== 繝槭ロ繝ｼ繧ｸ繝｣繝ｼ蟆ら畑・壹Δ繝ｼ繝牙・繧頑崛縺医そ繝ｬ繧ｯ繝・===== */}
            {isManager && managerStores.length > 0 && (
              <div className="hidden sm:flex items-center bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                <span className="text-xs font-bold text-emerald-700 mr-2">召 陦ｨ遉ｺ:</span>
                <select
                  value={String(activeStoreId ?? 'manager')}
                  onChange={handleStoreChange}
                  className="bg-transparent text-sm font-bold text-emerald-900 outline-none cursor-pointer"
                >
                  {/* 繝槭ロ繝ｼ繧ｸ繝｣繝ｼ繝｢繝ｼ繝会ｼ医ョ繝輔か繝ｫ繝茨ｼ峨ｒ蜈磯ｭ縺ｫ驟咲ｽｮ */}
                  <option value="manager">投 繝槭ロ繝ｼ繧ｸ繝｣繝ｼ繝｢繝ｼ繝・/option>
                  {/* 諡・ｽ灘ｺ苓・縺ｮ荳隕ｧ */}
                  {managerStores.map(store => (
                    <option key={store.id} value={store.id}>
                      宵 {store.store_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ===== 繧ｷ繧ｧ繝募髄縺托ｼ壼ｺ苓・陦ｨ遉ｺUI・・aster/admin/manager/super_admin 縺ｯ蛻･縺ｮ蝣ｴ謇縺ｧ邂｡逅・ｼ・==== */}
            {stores.length > 0 && activeStoreId && !isManager && !isMasterOrAdmin && role !== 'super_admin' && (
              <div className="hidden sm:flex items-center bg-slate-100 rounded-lg px-3 py-1.5 border border-slate-200">
                <span className="text-xs font-bold text-slate-500 mr-2">桃 蠎苓・:</span>
                {(user.storeIds && user.storeIds.length > 1) ? (
                  <select 
                    value={String(activeStoreId)} 
                    onChange={handleStoreChange}
                    className="bg-transparent text-sm font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    {stores.filter(s => user.storeIds?.includes(s.id)).map(store => (
                      <option key={store.id} value={store.id}>{store.store_name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm font-bold text-slate-800">
                    {stores.find(s => s.id === activeStoreId)?.store_name || '譛ｪ險ｭ螳・}
                  </span>
                )}
              </div>
            )}

            {/* Super Admin 逕ｨ繝舌ャ繧ｸ */}
            {role === 'super_admin' && (
              <div className="hidden sm:flex items-center bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5">
                <span className="text-xs font-bold text-indigo-700">荘 繧ｷ繧ｹ繝・Β蜈ｨ菴鍋ｮ｡逅・/span>
              </div>
            )}

            <div className="text-right hidden sm:block border-l border-slate-200 pl-4">
              <div className={`text-sm font-bold ${headerTextClass}`}>{user.displayName}</div>
              <div className={`text-xs uppercase tracking-wider ${headerSubtitleClass}`}>{user.role} Mode</div>
            </div>
            <button 
              onClick={handleLogout}
              className={`text-sm px-4 py-2 font-bold rounded-lg transition-colors ml-2 ${isProduction ? 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-300' : 'bg-white hover:bg-orange-50 text-orange-800 border border-orange-200'}`}
            >
              Logout
            </button>
          </div>
        )}
      </div>

      {/* 邂｡逅・・・繝槭せ繧ｿ繝｢繝ｼ繝峨・Super Admin譎ゅ・縺ｿ陦ｨ遉ｺ縺輔ｌ繧玖ｿｽ蜉繝翫ン繧ｲ繝ｼ繧ｷ繝ｧ繝ｳ繝舌・ */}
      {(role === 'master' || role === 'admin' || role === 'super_admin') && (
        <div className="bg-slate-100 border-t border-slate-200 px-4 py-2 flex items-center gap-4 overflow-x-auto text-sm">
          {role === 'super_admin' && (
            <>
              <span className="font-bold text-indigo-500 flex-shrink-0 mr-2">SaaS Management:</span>
              <Link href="/super-admin" className="font-bold flex-shrink-0 text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1 rounded-md border border-indigo-100">
                噫 繧ｹ繝ｼ繝代・邂｡逅・・ム繝・す繝･繝懊・繝峨∈
              </Link>
            </>
          )}

          {role === 'master' && (
            <>
              <span className="font-bold text-slate-500 flex-shrink-0 mr-2">Master Menu:</span>
              <Link href="/admin/ingredients" className={`font-bold flex-shrink-0 ${pathname === '/admin/ingredients' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>叉 譚先侭繝槭せ繧ｿ</Link>
              <Link href="/admin/doughs" className={`font-bold flex-shrink-0 ${pathname === '/admin/doughs' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>･｣ 逕溷慍繝槭せ繧ｿ</Link>
              <Link href="/admin/wips" className={`font-bold flex-shrink-0 ${pathname === '/admin/wips' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>艮 莉墓寺蜩√・繧ｹ繧ｿ</Link>
              <Link href="/admin/products" className={`font-bold flex-shrink-0 ${pathname === '/admin/products' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>･・蝠・刀繝槭せ繧ｿ</Link>
            </>
          )}
          
          {role === 'admin' && (
            <>
              <span className="font-bold text-slate-500 flex-shrink-0 mr-2">Admin Menu:</span>
              <Link href="/admin/users" className={`font-bold flex-shrink-0 ${pathname === '/admin/users' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>則 繝ｦ繝ｼ繧ｶ繝ｼ邂｡逅・/Link>
              <Link href="/admin/stores" className={`font-bold flex-shrink-0 ${pathname === '/admin/stores' ? 'text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}>宵 蠎苓・繝ｻ險ｭ蛯咏ｮ｡逅・/Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
