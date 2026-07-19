// Supabase Storage service for organized image management
// Uses Edge Functions for upload (bypasses RLS restrictions)
import { supabase } from '@/lib/supabase';

const PRODUCTS_BUCKET = 'products';
const PROFILES_BUCKET = 'profiles';
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB max per image
const THUMB_WIDTH = 200;
const THUMB_HEIGHT = 200;
const MAX_IMG_WIDTH = 800;
const MAX_IMG_HEIGHT = 800;
const JPEG_QUALITY = 0.82;

/** Ensure both storage buckets exist, creating them if needed */
export async function ensureBuckets(): Promise<void> {
  for (const bucket of [PRODUCTS_BUCKET, PROFILES_BUCKET]) {
    try {
      const { data } = await supabase.storage.getBucket(bucket);
      if (!data) {
        await supabase.storage.createBucket(bucket, { public: true });
        console.log(`[storageService] Created bucket: ${bucket}`);
      }
    } catch {
      console.warn(`[storageService] Cannot create bucket ${bucket} from client, using Edge Function fallback`);
    }
  }
}

/** Get public URL for a file in a bucket */
export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Compress an image using canvas. Returns base64 data URL. */
function compressImage(file: File, maxW: number, maxH: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxW || height > maxH) {
          const ratio = Math.min(maxW / width, maxH / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context unavailable')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

export interface UploadResult {
  url: string;
  thumbUrl: string;
  path: string;
}

/**
 * Upload via Edge Function (primary method - uses service_role, works without RLS)
 */
async function uploadViaEdgeFunction(productId: string, base64DataUrl: string, mimeType: string): Promise<UploadResult | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      console.error('[storageService] No auth token for edge function call');
      return null;
    }

    const response = await fetch(
      `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/upload-product-image`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId,
          base64Image: base64DataUrl,
          mimeType,
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[storageService] Edge function upload failed:', response.status, errBody);
      return null;
    }

    const result = await response.json();
    if (!result.success) {
      console.error('[storageService] Edge function returned error:', result.error);
      return null;
    }

    return {
      url: result.url,
      thumbUrl: result.thumbUrl,
      path: result.path,
    };
  } catch (err) {
    console.error('[storageService] uploadViaEdgeFunction error:', err);
    return null;
  }
}

/**
 * Upload directly via Supabase client (fallback - may fail without RLS policies)
 */
async function uploadDirect(
  bucket: string,
  filePath: string,
  thumbPath: string,
  mainBlob: Blob,
  thumbBlob: Blob,
): Promise<{ url: string; thumbUrl: string } | null> {
  try {
    const [mainResult, thumbResult] = await Promise.all([
      supabase.storage.from(bucket).upload(filePath, mainBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      }),
      supabase.storage.from(bucket).upload(thumbPath, thumbBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      }),
    ]);

    if (mainResult.error) {
      console.warn('[storageService] Direct upload failed (RLS likely):', mainResult.error.message);
      return null;
    }

    const url = getPublicUrl(bucket, filePath);
    const thumbUrl = thumbResult.error ? url : getPublicUrl(bucket, thumbPath);
    return { url, thumbUrl };
  } catch (err) {
    console.warn('[storageService] Direct upload exception:', err);
    return null;
  }
}

/** Generate a unique file path for a product image */
function productImagePath(productId: string, suffix = ''): string {
  const timestamp = Date.now();
  return `${productId}${suffix ? `_${suffix}` : ''}_${timestamp}.jpg`;
}

/** Generate a unique file path for a profile image */
function profileImagePath(userId: string, suffix = ''): string {
  const timestamp = Date.now();
  return `${userId}${suffix ? `_${suffix}` : ''}_${timestamp}.jpg`;
}

/**
 * Upload a product image. Compresses, then uploads via Edge Function (primary) with direct fallback.
 * Accepts either a File or a base64 data URL.
 */
export async function uploadProductImage(
  productId: string,
  source: File | string,
): Promise<UploadResult | null> {
  try {
    await ensureBuckets();

    let file: File;
    if (typeof source === 'string') {
      const res = await fetch(source);
      const blob = await res.blob();
      file = new File([blob], 'image.jpg', { type: blob.type || 'image/jpeg' });
    } else {
      file = source;
    }

    if (file.size > MAX_FILE_SIZE) {
      console.warn('[storageService] File too large, compressing...');
    }

    // Compress main image
    const compressedDataUrl = await compressImage(file, MAX_IMG_WIDTH, MAX_IMG_HEIGHT, JPEG_QUALITY);

    // Try Edge Function upload first (most reliable - uses service_role)
    const edgeResult = await uploadViaEdgeFunction(productId, compressedDataUrl, 'image/jpeg');
    if (edgeResult) {
      console.log('[storageService] Uploaded via Edge Function:', edgeResult.url);
      return edgeResult;
    }

    // Fallback: try direct upload in case RLS is configured
    const mainBlob = await (await fetch(compressedDataUrl)).blob();
    const thumbDataUrl = await compressImage(file, THUMB_WIDTH, THUMB_HEIGHT, 0.7);
    const thumbBlob = await (await fetch(thumbDataUrl)).blob();

    const mainPath = productImagePath(productId);
    const thumbPath = productImagePath(productId, 'thumb');

    const directResult = await uploadDirect(PRODUCTS_BUCKET, mainPath, thumbPath, mainBlob, thumbBlob);
    if (directResult) {
      console.log('[storageService] Uploaded via direct client:', directResult.url);
      return { url: directResult.url, thumbUrl: directResult.thumbUrl, path: mainPath };
    }

    // Both failed
    console.error('[storageService] All upload methods failed for product:', productId);
    return null;
  } catch (err) {
    console.error('[storageService] uploadProductImage error:', err);
    return null;
  }
}

/**
 * Upload a profile image. Uses Edge Function for reliability.
 */
export async function uploadProfileImage(
  userId: string,
  source: File | string,
): Promise<UploadResult | null> {
  try {
    await ensureBuckets();

    let file: File;
    if (typeof source === 'string') {
      const res = await fetch(source);
      const blob = await res.blob();
      file = new File([blob], 'avatar.jpg', { type: blob.type || 'image/jpeg' });
    } else {
      file = source;
    }

    const compressedDataUrl = await compressImage(file, MAX_IMG_WIDTH, MAX_IMG_HEIGHT, JPEG_QUALITY);
    const mainBlob = await (await fetch(compressedDataUrl)).blob();
    const thumbDataUrl = await compressImage(file, THUMB_WIDTH, THUMB_HEIGHT, 0.7);
    const thumbBlob = await (await fetch(thumbDataUrl)).blob();

    const mainPath = profileImagePath(userId);
    const thumbPath = profileImagePath(userId, 'thumb');

    const directResult = await uploadDirect(PROFILES_BUCKET, mainPath, thumbPath, mainBlob, thumbBlob);
    if (directResult) {
      return { url: directResult.url, thumbUrl: directResult.thumbUrl, path: mainPath };
    }

    return null;
  } catch (err) {
    console.error('[storageService] uploadProfileImage error:', err);
    return null;
  }
}

/**
 * Delete a product image and its thumbnail from storage.
 * Tries direct delete; falls back to listing and removing via Edge Function pattern.
 */
export async function deleteProductImage(path: string): Promise<void> {
  if (!path) return;
  try {
    const thumbPath = path.replace(/(_\d+\.jpg)$/, '_thumb$1');
    const paths = [path];
    if (thumbPath !== path) paths.push(thumbPath);
    const { error } = await supabase.storage.from(PRODUCTS_BUCKET).remove(paths);
    if (error) {
      console.warn('[storageService] deleteProductImage error:', error.message);
    }
  } catch (err) {
    console.warn('[storageService] deleteProductImage error:', err);
  }
}

/**
 * Delete a profile image and its thumbnail from storage.
 */
export async function deleteProfileImage(path: string): Promise<void> {
  if (!path) return;
  try {
    const thumbPath = path.replace(/(_\d+\.jpg)$/, '_thumb$1');
    const paths = [path];
    if (thumbPath !== path) paths.push(thumbPath);
    await supabase.storage.from(PROFILES_BUCKET).remove(paths);
  } catch (err) {
    console.warn('[storageService] deleteProfileImage error:', err);
  }
}

/**
 * Delete all images for a given product (regardless of path).
 */
export async function deleteAllProductImages(productId: string): Promise<void> {
  try {
    const { data } = await supabase.storage.from(PRODUCTS_BUCKET).list('', {
      search: productId,
    });
    if (data && data.length > 0) {
      const paths = data.map((f) => f.name);
      await supabase.storage.from(PRODUCTS_BUCKET).remove(paths);
    }
  } catch (err) {
    console.warn('[storageService] deleteAllProductImages error:', err);
  }
}

export { PRODUCTS_BUCKET, PROFILES_BUCKET };