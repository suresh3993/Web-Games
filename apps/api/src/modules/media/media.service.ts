import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { DEFAULT_WIDTH, IMAGE_VARIANTS, type ImageKind, type ImageVariant } from '../../lib/images';

export const mediaUrl = (imageId: string, width: number) => `/api/v1/media/${imageId}/${width}.webp`;

export const defaultMediaUrl = (imageId: string, kind: ImageKind) => mediaUrl(imageId, DEFAULT_WIDTH[kind]);

/** `srcset` value for responsive images. */
export const mediaSrcSet = (imageId: string, kind: ImageKind) =>
  IMAGE_VARIANTS[kind].map((v) => `${mediaUrl(imageId, v.width)} ${v.width}w`).join(', ');

export async function storeImage(
  tx: Prisma.TransactionClient,
  kind: ImageKind,
  uploadedById: string | null,
  variants: ImageVariant[],
): Promise<string> {
  const image = await tx.mediaImage.create({
    data: {
      kind,
      uploadedById,
      variants: { create: variants.map((v) => ({ width: v.width, height: v.height, data: new Uint8Array(v.data) })) },
    },
    select: { id: true },
  });
  return image.id;
}

export async function getVariant(imageId: string, width: number) {
  return prisma.mediaVariant.findUnique({
    where: { imageId_width: { imageId, width } },
    select: { data: true, width: true, height: true },
  });
}
