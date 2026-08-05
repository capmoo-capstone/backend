import { CacheItem, CacheProvider } from '@node-saml/node-saml';
import { createHash } from 'crypto';
import { prisma } from '../config/prisma';
import { UnauthorizedError } from './errors';

export const SAML_REQUEST_TTL_MS = 5 * 60 * 1000;

/**
 * Stores AuthnRequest IDs in PostgreSQL so an ACS request can be handled by a
 * different application instance than the one that initiated the SAML flow.
 */
export class PrismaSamlRequestCache implements CacheProvider {
  constructor(private readonly ttlMs: number = SAML_REQUEST_TTL_MS) {}

  async saveAsync(key: string, value: string): Promise<CacheItem | null> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);

    await prisma.$transaction([
      prisma.samlRequestCache.deleteMany({
        where: { expires_at: { lte: now } },
      }),
      prisma.samlRequestCache.upsert({
        where: { key },
        create: { key, value, expires_at: expiresAt },
        update: { value, expires_at: expiresAt },
      }),
    ]);

    return { value, createdAt: now.getTime() };
  }

  async getAsync(key: string): Promise<string | null> {
    const entry = await prisma.samlRequestCache.findUnique({ where: { key } });

    if (!entry) return null;

    if (entry.expires_at <= new Date()) {
      await prisma.samlRequestCache.deleteMany({ where: { key } });
      return null;
    }

    return entry.value;
  }

  async removeAsync(key: string | null): Promise<string | null> {
    if (!key) return null;

    const entry = await prisma.samlRequestCache.findUnique({ where: { key } });
    if (!entry) return null;

    await prisma.samlRequestCache.deleteMany({ where: { key } });
    return entry.value;
  }
}

/**
 * A valid response may only issue a local session once.  This adds a durable
 * second replay barrier in addition to SAML's InResponseTo validation.
 */
export const claimSamlResponse = async (encodedResponse: string) => {
  const now = new Date();
  const responseHash = createHash('sha256')
    .update(encodedResponse)
    .digest('hex');

  try {
    await prisma.$transaction([
      prisma.samlResponseReplay.deleteMany({
        where: { expires_at: { lte: now } },
      }),
      prisma.samlResponseReplay.create({
        data: {
          response_hash: responseHash,
          expires_at: new Date(now.getTime() + SAML_REQUEST_TTL_MS),
        },
      }),
    ]);
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      throw new UnauthorizedError('SAML response has already been used');
    }
    throw err;
  }
};
