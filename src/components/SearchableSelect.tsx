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
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm, isOpen]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredOptions.length === 0) return;

    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % filteredOptions.length);
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onChange(filteredOptions[highlightedIndex].value);
      setIsOpen(false);
      setSearchTerm("");
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div 
        className="w-full px-3 py-2 text-slate-900 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer min-h-[42px] flex items-center justify-between"
        tabIndex={0}
        onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) setSearchTerm("");
        }}
        onKeyDown={(e) => {
          if (!isOpen && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <div className="truncate pr-2 flex-1">
            {selectedOption ? selectedOption.label : <span className="text-slate-400">{placeholder}</span>}
        </div>
        <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
      </div>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 flex flex-col">
          <div className="bg-white p-2 border-b border-slate-200 shrink-0">
            <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                type="text"
                className="w-full pl-7 pr-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="コードや名前で検索..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                onClick={e => e.stopPropagation()}
                autoFocus
                />
            </div>
          </div>
          <div className="overflow-y-auto flex-1" ref={listRef}>
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-sm text-slate-500 text-center">見つかりません</div>
            ) : (
              filteredOptions.map((option, idx) => (
                <div
                  key={option.value}
                  className={`px-3 py-2 text-sm cursor-pointer ${idx === highlightedIndex ? 'bg-blue-100 font-bold text-blue-900' : 'text-slate-700 hover:bg-slate-50'}`}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                    setSearchTerm("");
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  {option.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
