import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchableSelect({ options, value, onChange, placeholder = "選択してください...", className = "" }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
    o.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div 
        className="w-full px-3 py-2 text-slate-900 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer min-h-[42px] flex items-center justify-between"
        onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) setSearchTerm("");
        }}
      >
        <div className="truncate pr-2 flex-1">
            {selectedOption ? selectedOption.label : <span className="text-slate-400">{placeholder}</span>}
        </div>
        <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
      </div>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          <div className="sticky top-0 bg-white p-2 border-b border-slate-200">
            <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                type="text"
                className="w-full pl-7 pr-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="コードや名前で検索..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onClick={e => e.stopPropagation()}
                autoFocus
                />
            </div>
          </div>
          {filteredOptions.length === 0 ? (
            <div className="p-3 text-sm text-slate-500 text-center">見つかりません</div>
          ) : (
            filteredOptions.map(option => (
              <div
                key={option.value}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${option.value === value ? 'bg-blue-100 font-bold text-blue-900' : 'text-slate-700'}`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  setSearchTerm("");
                }}
              >
                {option.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
