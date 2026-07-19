import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import type { Product } from '@/types';

// ─── NORMALIZACIÓN ──────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9ñ]+/)
    .filter((t) => t.length >= 2);
}

// ─── DISTANCIA LEVENSHTEIN ──────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Uint16Array(n + 1);
  let curr = new Uint16Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// ─── ÍNDICE DE BÚSQUEDA ────────────────────────────────────────────────────

interface SearchIndex {
  wordMap: Map<string, Set<string>>;
  barcodeMap: Map<string, string>;
  productById: Map<string, Product>;
}

function buildIndex(products: Product[]): SearchIndex {
  const wordMap = new Map<string, Set<string>>();
  const barcodeMap = new Map<string, string>();
  const productById = new Map<string, Product>();

  products.forEach((p) => {
    if (!p.isActive) return;
    productById.set(p.id, p);

    const tokens = new Set<string>();

    // Indexar todos los campos relevantes
    tokenize(p.commercialName).forEach((t) => tokens.add(t));
    tokenize(p.genericName).forEach((t) => tokens.add(t));
    tokenize(p.lab).forEach((t) => tokens.add(t));
    tokenize(p.presentation).forEach((t) => tokens.add(t));
    if (p.code) tokenize(p.code).forEach((t) => tokens.add(t));
    if (p.estante) tokenize(p.estante).forEach((t) => tokens.add(t));
    if (p.posicion) tokenize(p.posicion).forEach((t) => tokens.add(t));

    // Barcode exacto
    if (p.barcode && p.barcode.trim()) {
      const bc = normalize(p.barcode.trim());
      barcodeMap.set(bc, p.id);
      tokenize(p.barcode).forEach((t) => tokens.add(t));
    }

    tokens.forEach((token) => {
      if (!wordMap.has(token)) wordMap.set(token, new Set());
      wordMap.get(token)!.add(p.id);
    });
  });

  return { wordMap, barcodeMap, productById };
}

// ─── TIPOS DE RESULTADO ────────────────────────────────────────────────────

export interface SearchSuggestion {
  product: Product;
  score: number;
  matchField: string;
}

export interface AlphabetLetter {
  letter: string;
  hasProducts: boolean;
  count: number;
}

// ─── HOOK PRINCIPAL ────────────────────────────────────────────────────────

export function useSmartSearch(products: Product[]) {
  const indexRef = useRef<SearchIndex>({
    wordMap: new Map(),
    barcodeMap: new Map(),
    productById: new Map(),
  });

  const [searchQuery, setSearchQueryRaw] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);

  const alphabet = useMemo(
    () => ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'Ñ', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'],
    []
  );

  // Reconstruir índice cuando cambien los productos
  useEffect(() => {
    indexRef.current = buildIndex(products);
  }, [products]);

  // Debounce de 80ms para búsqueda en tiempo real
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 80);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Actualizar letra seleccionada dinámicamente al escribir
  useEffect(() => {
    if (!debouncedQuery.trim()) return;
    const firstChar = normalize(debouncedQuery.trim())[0];
    if (firstChar && /[a-zñ]/.test(firstChar)) {
      const upper = firstChar.toUpperCase();
      setSelectedLetter(upper === 'Ñ' ? 'Ñ' : upper);
    }
  }, [debouncedQuery]);

  // ─── SUGERENCIAS DE AUTOCOMPLETADO ──────────────────────────────────────

  const suggestions = useMemo((): SearchSuggestion[] => {
    const q = debouncedQuery.trim();
    if (!q || q.length < 1) return [];

    const normalizedQ = normalize(q);
    const activeProds = products.filter((p) => p.isActive);

    // Barcode exacto - máxima prioridad
    const barcodeId = indexRef.current.barcodeMap.get(normalizedQ);
    if (barcodeId) {
      const prod = indexRef.current.productById.get(barcodeId);
      if (prod) return [{ product: prod, score: 999, matchField: 'Código de barras' }];
    }

    const results: SearchSuggestion[] = [];
    const seenIds = new Set<string>();

    // Búsqueda por tokens en el índice
    const searchTokens = normalizedQ.split(/[^a-z0-9ñ]+/).filter((t) => t.length >= 1);
    const wordMap = indexRef.current.wordMap;

    // Calcular coincidencias por token
    const idScores = new Map<string, number>();

    for (const token of searchTokens) {
      for (const [indexedWord, ids] of wordMap) {
        // Coincidencia exacta o que empiece con el token = alta prioridad
        if (indexedWord === token) {
          ids.forEach((id) => {
            idScores.set(id, (idScores.get(id) || 0) + 100);
          });
        } else if (indexedWord.startsWith(token)) {
          ids.forEach((id) => {
            idScores.set(id, (idScores.get(id) || 0) + 50);
          });
        } else if (indexedWord.includes(token)) {
          ids.forEach((id) => {
            idScores.set(id, (idScores.get(id) || 0) + 20);
          });
        }
        // Fuzzy matching para corrección inteligente
        else if (token.length >= 3 && indexedWord.length >= 3) {
          const dist = levenshtein(token, indexedWord);
          const maxLen = Math.max(token.length, indexedWord.length);
          const similarity = 1 - dist / maxLen;
          if (similarity >= 0.7) {
            ids.forEach((id) => {
              idScores.set(id, (idScores.get(id) || 0) + Math.round(similarity * 30));
            });
          }
        }
      }
    }

    // Construir lista ordenada de sugerencias
    for (const [id, score] of idScores) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const prod = indexRef.current.productById.get(id);
      if (!prod) continue;

      // Determinar campo de coincidencia más probable
      let matchField = 'Nombre';
      const normName = normalize(prod.commercialName);
      const normGeneric = normalize(prod.genericName);
      const normLab = normalize(prod.lab);
      const normPres = normalize(prod.presentation);
      const normCode = normalize(prod.code || '');

      if (normalizedQ.length >= 2) {
        if (normCode.startsWith(normalizedQ) || normCode.includes(normalizedQ)) matchField = 'Código';
        else if (normName.startsWith(normalizedQ)) matchField = 'Nombre';
        else if (normGeneric.startsWith(normalizedQ)) matchField = 'Genérico';
        else if (normLab.startsWith(normalizedQ)) matchField = 'Laboratorio';
        else if (normPres.startsWith(normalizedQ)) matchField = 'Presentación';
      }

      results.push({ product: prod, score, matchField });
    }

    // Ordenar por score descendente, limitar a 10
    return results.sort((a, b) => b.score - a.score).slice(0, 10);
  }, [products, debouncedQuery]);

  // ─── PRODUCTOS FILTRADOS (para la grilla) ──────────────────────────────

  const filteredProducts = useMemo(() => {
    const activeProds = products.filter((p) => p.isActive);

    // Si hay una letra seleccionada Y no hay búsqueda de texto
    if (selectedLetter && !debouncedQuery.trim()) {
      const letter = normalize(selectedLetter);

      // Primero: productos que empiezan con esa letra
      const startsWith = activeProds.filter((p) => {
        const name = normalize(p.commercialName);
        return name.startsWith(letter);
      });

      // Luego: productos que contienen la letra pero no empiezan con ella
      const contains = activeProds.filter((p) => {
        const name = normalize(p.commercialName);
        return name.includes(letter) && !name.startsWith(letter);
      });

      // Combinar: primero los que empiezan, luego los que contienen
      return [...startsWith, ...contains];
    }

    // Si hay búsqueda de texto, usar el índice
    if (debouncedQuery.trim()) {
      const normalizedQ = normalize(debouncedQuery.trim());

      // Barcode exacto
      const barcodeId = indexRef.current.barcodeMap.get(normalizedQ);
      if (barcodeId) {
        const prod = indexRef.current.productById.get(barcodeId);
        return prod ? [prod] : [];
      }

      const searchTokens = normalizedQ.split(/[^a-z0-9ñ]+/).filter((t) => t.length >= 1);
      if (searchTokens.length === 0) return activeProds;

      const wordMap = indexRef.current.wordMap;
      let resultIds: Set<string> | null = null;

      for (const token of searchTokens) {
        const matchingIds = new Set<string>();

        for (const [indexedWord, ids] of wordMap) {
          if (indexedWord.startsWith(token) || indexedWord.includes(token)) {
            ids.forEach((id) => matchingIds.add(id));
          }
          // Fuzzy matching
          else if (token.length >= 3 && indexedWord.length >= 3) {
            const dist = levenshtein(token, indexedWord);
            const maxLen = Math.max(token.length, indexedWord.length);
            if (1 - dist / maxLen >= 0.7) {
              ids.forEach((id) => matchingIds.add(id));
            }
          }
        }

        if (resultIds === null) {
          resultIds = matchingIds;
        } else {
          const newResult = new Set<string>();
          for (const id of matchingIds) {
            if (resultIds.has(id)) newResult.add(id);
          }
          resultIds = newResult;
        }

        if (resultIds.size === 0) break;
      }

      const ids = resultIds || new Set<string>();
      function nameStartsWith(product: Product, q: string): boolean {
        return normalize(product.commercialName).startsWith(normalize(q));
      }
      return activeProds
        .filter((p) => ids.has(p.id))
        .sort((a, b) => {
          const aStarts = nameStartsWith(a, normalizedQ) ? 0 : 1;
          const bStarts = nameStartsWith(b, normalizedQ) ? 0 : 1;
          return aStarts - bStarts;
        });
    }

    return activeProds;
  }, [products, debouncedQuery, selectedLetter]);

  // ─── ESTADÍSTICAS DEL ALFABETO ──────────────────────────────────────────

  const alphabetStats = useMemo((): AlphabetLetter[] => {
    const activeProds = products.filter((p) => p.isActive);
    return alphabet.map((letter) => {
      const normLetter = normalize(letter);
      const count = activeProds.filter((p) => {
        const name = normalize(p.commercialName);
        return name.includes(normLetter) || name.startsWith(normLetter);
      }).length;
      return { letter, hasProducts: count > 0, count };
    });
  }, [products, alphabet]);

  // ─── RESALTAR TEXTO COINCIDENTE ──────────────────────────────────────────

  const highlightMatch = useCallback(
    (text: string, query: string): { before: string; match: string; after: string } | null => {
      if (!query.trim()) return null;
      const normText = normalize(text);
      const normQuery = normalize(query.trim());
      const idx = normText.indexOf(normQuery);
      if (idx === -1) {
        // Buscar coincidencia parcial de tokens
        const tokens = normQuery.split(/[^a-z0-9ñ]+/).filter((t) => t.length >= 2);
        for (const token of tokens) {
          const tidx = normText.indexOf(token);
          if (tidx !== -1) {
            return {
              before: text.slice(0, tidx),
              match: text.slice(tidx, tidx + token.length),
              after: text.slice(tidx + token.length),
            };
          }
        }
        return null;
      }
      return {
        before: text.slice(0, idx),
        match: text.slice(idx, idx + normQuery.length),
        after: text.slice(idx + normQuery.length),
      };
    },
    []
  );

  const setSearchQuery = useCallback((value: string) => {
    setSearchQueryRaw(value);
  }, []);

  const selectLetter = useCallback((letter: string | null) => {
    setSelectedLetter(letter);
    if (letter) {
      setSearchQueryRaw('');
      setDebouncedQuery('');
    }
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    filteredProducts,
    suggestions,
    alphabet,
    alphabetStats,
    selectedLetter,
    selectLetter,
    highlightMatch,
    totalProducts: products.filter((p) => p.isActive).length,
  };
}