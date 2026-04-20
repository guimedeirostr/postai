import { adminStorage } from '@/lib/firebase-admin';

const MIME_TO_EXT: Record<string, string> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function assetStoragePath(clientId: string, assetId: string, mimeType: string): string {
  const ext = MIME_TO_EXT[mimeType] ?? 'jpg';
  return `postai-assets/${clientId}/${assetId}.${ext}`;
}

/** Generate a signed PUT URL so the browser can upload directly (15 min TTL). */
export async function generateUploadUrl(storagePath: string, mimeType: string): Promise<string> {
  const bucket = adminStorage().bucket();
  const [url] = await bucket.file(storagePath).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType: mimeType,
  });
  return url;
}

/** Make a file public and return its permanent download URL. */
export async function finalizeAssetUrl(storagePath: string): Promise<string> {
  const bucket = adminStorage().bucket();
  const file   = bucket.file(storagePath);
  // Verify the file exists before making public
  const [exists] = await file.exists();
  if (!exists) throw new Error(`Storage file not found: ${storagePath}`);
  await file.makePublic();
  return file.publicUrl();
}

/** Hard-delete a file from Storage (used when reverting a failed upload). */
export async function deleteStorageFile(storagePath: string): Promise<void> {
  await adminStorage().bucket().file(storagePath).delete().catch(() => null);
}
