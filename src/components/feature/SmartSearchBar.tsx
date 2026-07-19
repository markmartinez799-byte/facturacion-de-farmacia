import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Package } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';
import type { Product } from '@/types';
import type { SearchSuggestion, AlphabetLetter } from '@/hooks/useSmartSearch';

interface SmartSearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  suggestions: SearchSuggestion[];
  filteredCount: number;
  alphabet: string[];
  alphabetStats: AlphabetLetter[];
  selectedLetter: string | null;
  onSelectLetter: (letter: string | null) => void;
  highlightMatch: (text: string, query: string) => { before: string; match: string; after: string } | null;
  onProductSelect: (product: Product) => void;
  onProductPreview?: (product: Product) => void;
  getStockBadge: (product: Product) => { stock: number; className: string };
  inputRef?: React.RefObject<HTMLInputElement | null>;
  autofocus?: boolean;
}

export default function SmartSearchBar({
  searchQuery,
  onSearchChange,
  suggestions,
  filteredCount,
  alphabet,
  alphabetStats,
  selectedLetter,
  onSelectLetter,
  highlightMatch,
  onProductSelect,
  onProductPreview,
  getStockBadge,
  inputRef: externalInputRef,
  autofocus = true,
}: SmartSearchBarProps) {
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || internalInputRef;
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  // Reset highlighted index when suggestions change
  useEffect(() => {
    setHighlightedIdx(-1);
  }, [suggestions]);

  // Auto-focus on mount
  useEffect(() => {
    if (autofocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autofocus]);

  // Show suggestions when typing, hide when empty query
  useEffect(() => {
    if (searchQuery.trim() && suggestions.length > 0) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [searchQuery, suggestions]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIdx((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIdx((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIdx >= 0 && highlightedIdx < suggestions.length) {
          onProductSelect(suggestions[highlightedIdx].product);
          setShowSuggestions(false);
          onSearchChange('');
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  }, [showSuggestions, suggestions, highlightedIdx, onProductSelect, onSearchChange]);

  const clearSearch = () => {
    onSearchChange('');
    onSelectLetter(null);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => {
            if (searchQuery.trim() && suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar por nombre, código, principio activo, marca, presentación..."
          className="w-full pl-10 pr-10 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
        />
        {searchQuery && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden animate-fade-in max-h-[420px] overflow-y-auto"
        >
          {/* Header */}
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {suggestions.length} sugerencia{suggestions.length !== 1 ? 's' : ''}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              ↑↓ para navegar · Enter para seleccionar
            </span>
          </div>

          {/* Suggestions List */}
          {suggestions.map((suggestion, idx) => {
            const { product, matchField } = suggestion;
            const { stock, className: stockClass } = getStockBadge(product);
            const highlight = highlightMatch(product.commercialName, searchQuery);
            const isHighlighted = idx === highlightedIdx;

            return (
              <button
                key={product.id}
                onClick={() => {
                  onProductSelect(product);
                  setShowSuggestions(false);
                  onSearchChange('');
                }}
                onMouseEnter={() => setHighlightedIdx(idx)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 ${
                  isHighlighted
                    ? 'bg-emerald-50 dark:bg-emerald-900/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                {/* Product Image */}
                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {product.image ? (
                    <img src={product.image} alt="" className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <Package className="w-5 h-5 text-slate-400" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 dark:text-white text-sm truncate">
                    {highlight ? (
                      <>
                        <span>{highlight.before}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-900/40 rounded-sm px-0.5">{highlight.match}</span>
                        <span>{highlight.after}</span>
                      </>
                    ) : (
                      product.commercialName
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{product.lab}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">·</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{product.presentation}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">·</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                      {matchField}
                    </span>
                  </div>
                  {product.lote && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                      Lote: {product.lote}
                    </p>
                  )}
                </div>

                {/* Price & Stock */}
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    {formatCurrency(product.price)}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full mt-0.5 ${stockClass}`}>
                    {stock}
                  </span>
                </div>

                {/* Preview button */}
                {onProductPreview && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onProductPreview(product);
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-full text-slate-300 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors flex-shrink-0"
                    title="Ver detalles"
                  >
                    <i className="ri-eye-line text-sm"></i>
                  </button>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* "No results" message */}
      {searchQuery.trim() && !showSuggestions && suggestions.length === 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden animate-fade-in">
          <div className="px-4 py-6 text-center">
            <Package className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              No se encontraron productos
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Intenta con otro nombre o revisa la ortografía
            </p>
          </div>
        </div>
      )}

      {/* Result count bar */}
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {searchQuery.trim()
            ? `${filteredCount} producto${filteredCount !== 1 ? 's' : ''} encontrado${filteredCount !== 1 ? 's' : ''}`
            : selectedLetter
            ? `${filteredCount} producto${filteredCount !== 1 ? 's' : ''} con la letra "${selectedLetter}"`
            : 'Escribe para buscar o selecciona una letra'}
        </p>
      </div>

      {/* Alphabetical Index Bar */}
      <div className="mt-2 flex items-center gap-0.5 flex-wrap">
        <button
          onClick={() => onSelectLetter(null)}
          className={`px-2 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
            !selectedLetter
              ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-800'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
        >
          Todos
        </button>
        {alphabetStats.map(({ letter, hasProducts, count }) => (
          <button
            key={letter}
            onClick={() => onSelectLetter(letter)}
            disabled={!hasProducts}
            title={hasProducts ? `${count} producto${count !== 1 ? 's' : ''}` : 'Sin productos'}
            className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-semibold cursor-pointer transition-all ${
              selectedLetter === letter
                ? 'bg-emerald-600 text-white shadow-sm scale-110'
                : hasProducts
                ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 hover:scale-105'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-40'
            }`}
          >
            {letter}
          </button>
        ))}
      </div>

      {/* Selected letter indicator */}
      {selectedLetter && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Mostrando productos con <span className="font-bold text-emerald-600 dark:text-emerald-400">"{selectedLetter}"</span>
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            (primero los que empiezan, luego los que contienen)
          </span>
          <button
            onClick={() => onSelectLetter(null)}
            className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer ml-auto"
          >
            Limpiar filtro
          </button>
        </div>
      )}
    </div>
  );
}