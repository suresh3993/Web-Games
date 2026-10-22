import { Router } from 'express';
import { idSchema, z } from '@playverse/validation';
import { notFound } from '../../lib/http-error';
import { getVariant } from './media.service';

const params = z.object({ id: idSchema, file: z.string().regex(/^\d{2,4}\.webp$/) });

/**
 * Serves re-encoded uploads. Ids are never reused (a new upload gets a new id), so
 * responses are immutable. Only server-generated WebP bytes are ever served, with
 * `nosniff`; Helmet's `default-src 'none'` CSP also applies.
 */
export function mediaRouter(): Router {
  const router = Router();
  router.get('/:id/:file', async (req, res) => {
    const parsed = params.safeParse(req.params);
    if (!parsed.success) throw notFound('Image not found.');
    const variant = await getVariant(parsed.data.id, Number.parseInt(parsed.data.file, 10));
    if (!variant) throw notFound('Image not found.');
    res
      .status(200)
      .set({
        'Content-Type': 'image/webp',
        'Content-Length': String(variant.data.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': 'inline',
      })
      .end(Buffer.from(variant.data));
  });
  return router;
}
