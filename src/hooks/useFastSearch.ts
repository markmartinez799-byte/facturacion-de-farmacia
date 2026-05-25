import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import type { Product } from '@/types';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

interface SearchIndex {
  wordMap: Map<string, Set<string>>;
  barcodeMap: Map<string, string>;
}

function buildIndex(products: Product[]): SearchIndex {
  const wordMap = new Map<string, Set<string>>();
  const barcodeMap = new Map<string, string>();

  products.forEach((p) => {
    const tokens = new Set<string>();

    tokenize(p.commercialName).forEach((t) => tokens.add(t));
    tokenize(p.genericName).forEach((t) => tokens.add(t));
    tokenize(p.lab).forEach((t) => tokens.add(t));
    tokenize(p.presentation).forEach((t) => tokens.add(t));
    if (p.estante) tokenize(p.estante).forEach((t) => tokens.add(t));
    if (p.posicion) tokenize(p.posicion).forEach((t) => tokens.add(t));

    // Exact barcode for instant lookup
    if (p.barcode && p.barcode.trim()) {
      const bc = normalize(p.barcode.trim());
      barcodeMap.set(bc, p.id);
      // Also index barcode as tokens
      tokenize(p.barcode).forEach((t) => tokens.add(t));
    }

    tokens.forEach((token) => {
      if (!wordMap.has(token)) wordMap.set(token, new Set());
      wordMap.get(token)!.add(p.id);
    });
  });

  return { wordMap, barcodeMap };
}

export function useFastSearch(products: Product[]) {
  const indexRef = useRef<SearchIndex>({ wordMap: new Map(), barcodeMap: new Map() });
  const [searchQuery, setSearchQueryRaw] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const buildTimeRef = useRef(0);

  // Debounce typing: 120ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Rebuild index when products change
  useEffect(() => {
    const start = performance.now();
    indexRef.current = buildIndex(products);
    buildTimeRef.current = Math.round(performance.now() - start);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = debouncedQuery.trim();
    if (!q) return products.filter((p) => p.isActive);

    const normalizedQ = normalize(q);

    // 1. Exact barcode match (fastest)
    const barcodeId = indexRef.current.barcodeMap.get(normalizedQ);
    if (barcodeId) {
      const prod = products.find((p) => p.id === barcodeId && p.isActive);
      return prod ? [prod] : [];
    }

    // 2. Token-based word search
    const searchTokens = normalizedQ
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 1);

    if (searchTokens.length === 0) return products.filter((p) => p.isActive);

    let resultIds: Set<string> | null = null;

    for (const token of searchTokens) {
      const matchingIds = new Set<string>();
      const wordMap = indexRef.current.wordMap;

      // Prefix match on indexed words (very fast Map iteration)
      for (const [indexedWord, ids] of wordMap) {
        if (indexedWord.startsWith(token) || indexedWord.includes(token)) {
          ids.forEach((id) => matchingIds.add(id));
        }
      }

      // Intersection across tokens
      if (resultIds === null) {
        resultIds = matchingIds;
      } else {
        // Optimization: if matchingIds is smaller, iterate over it
        if (matchingIds.size < resultIds.size) {
          const newResult = new Set<string>();
          for (const id of matchingIds) {
            if (resultIds.has(id)) newResult.add(id);
          }
          resultIds = newResult;
        } else {
          const newResult = new Set<string>();
          for (const id of resultIds) {
            if (matchingIds.has(id)) newResult.add(id);
          }
          resultIds = newResult;
        }
      }

      if (resultIds.size === 0) break;
    }

    const ids = resultIds || new Set<string>();
    return products.filter((p) => p.isActive && ids.has(p.id));
  }, [products, debouncedQuery]);

  const setSearchQuery = useCallback((value: string) => {
    setSearchQueryRaw(value);
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    filteredProducts,
    debouncedQuery,
    indexBuildTime: buildTimeRef.current,
    totalProducts: products.length,
  };
}