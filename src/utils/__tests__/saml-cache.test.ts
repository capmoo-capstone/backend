import { describe, expect, it } from 'vitest';
import { prismaMock } from '../../test/prisma-mock';
import { PrismaSamlRequestCache, claimSamlResponse } from '../saml-cache';

describe('SAML request cache', () => {
  it('persists an AuthnRequest ID with an expiry', async () => {
    prismaMock.samlRequestCache.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.samlRequestCache.upsert.mockResolvedValue({});

    const cache = new PrismaSamlRequestCache(60_000);
    await cache.saveAsync('_request-1', '2026-08-04T00:00:00.000Z');

    expect(prismaMock.samlRequestCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: '_request-1' },
        create: expect.objectContaining({
          key: '_request-1',
          value: '2026-08-04T00:00:00.000Z',
        }),
      })
    );
  });

  it('does not return an expired AuthnRequest ID', async () => {
    prismaMock.samlRequestCache.findUnique.mockResolvedValue({
      value: 'old-request',
      expires_at: new Date(Date.now() - 1),
    });
    prismaMock.samlRequestCache.deleteMany.mockResolvedValue({ count: 1 });

    const cache = new PrismaSamlRequestCache();

    await expect(cache.getAsync('_expired')).resolves.toBeNull();
    expect(prismaMock.samlRequestCache.deleteMany).toHaveBeenCalledWith({
      where: { key: '_expired' },
    });
  });

  it('rejects a SAML response that has already issued a session', async () => {
    prismaMock.$transaction.mockRejectedValueOnce({ code: 'P2002' });

    await expect(claimSamlResponse('encoded-saml-response')).rejects.toThrow(
      'already been used'
    );
  });
});
