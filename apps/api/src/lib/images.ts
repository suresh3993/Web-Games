import sharp, { type Metadata } from 'sharp';
import { HttpError } from './http-error';

/**
 * Untrusted image uploads (avatars, game thumbnails).
 *
 *  - The type is detected from the file's magic bytes; the declared Content-Type is ignored.
 *    Only PNG, JPEG, WebP and GIF are accepted (no SVG: it can carry script).
 *  - Decoding is bounded (`limitInputPixels`) against decompression bombs.
 *  - Every stored byte is re-encoded by the server: WebP at fixed sizes, EXIF/GPS and
 *    other metadata stripped, animation dropped. The original upload is discarded.
 */
sharp.cache(false);

export type ImageKind = 'avatar' | 'game-thumbnail';

export const IMAGE_VARIANTS: Record<ImageKind, { width: number; height: number }[]> = {
  avatar: [{ width: 256, height: 256 }],
  'game-thumbnail': [
    { width: 320, height: 200 },
    { width: 640, height: 400 },
    { width: 960, height: 600 },
  ],
};

/** Default variant used for `src` (the others go into `srcset`). */
export const DEFAULT_WIDTH: Record<ImageKind, number> = { avatar: 256, 'game-thumbnail': 640 };

const MIN_SIZE: Record<ImageKind, { width: number; height: number }> = {
  avatar: { width: 64, height: 64 },
  'game-thumbnail': { width: 320, height: 200 },
};

const MAX_INPUT_PIXELS = 40_000_000;
const DECODABLE = new Set(['png', 'jpeg', 'webp', 'gif']);

export function sniffImageType(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('latin1', 0, 6))) return 'image/gif';
  return null;
}

export interface ImageVariant {
  width: number;
  height: number;
  data: Buffer;
}

const unsupported = () => new HttpError(415, 'BAD_REQUEST', 'Upload a PNG, JPEG, WebP or GIF image.');

export async function processImage(bytes: Buffer, kind: ImageKind, maxBytes: number): Promise<ImageVariant[]> {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new HttpError(400, 'BAD_REQUEST', 'Choose an image to upload.');
  if (bytes.length > maxBytes) {
    throw new HttpError(413, 'BAD_REQUEST', `The image is too large (maximum ${Math.round(maxBytes / 1024 / 1024)} MB).`);
  }
  if (!sniffImageType(bytes)) throw unsupported();

  const decode = () => sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', animated: false });
  let meta: Metadata;
  try {
    meta = await decode().metadata();
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'This image could not be read. It may be damaged or too large.');
  }
  if (!meta.format || !DECODABLE.has(meta.format)) throw unsupported();
  const min = MIN_SIZE[kind];
  // EXIF orientations 5–8 swap width and height.
  const [w, h] = (meta.orientation ?? 1) >= 5 ? [meta.height ?? 0, meta.width ?? 0] : [meta.width ?? 0, meta.height ?? 0];
  if (w < min.width || h < min.height) {
    throw new HttpError(400, 'BAD_REQUEST', `The image must be at least ${min.width}×${min.height} pixels.`);
  }

  try {
    return await Promise.all(
      IMAGE_VARIANTS[kind].map(async (variant) => {
        const { data, info } = await decode()
          .rotate() // apply EXIF orientation; metadata is not copied to the output
          .resize(variant.width, variant.height, { fit: 'cover', position: 'attention' })
          .webp({ quality: 82, effort: 4 })
          .toBuffer({ resolveWithObject: true });
        return { width: info.width, height: info.height, data };
      }),
    );
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'This image could not be processed.');
  }
}
