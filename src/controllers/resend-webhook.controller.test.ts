import { Webhook } from 'svix';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processResendWebhookEvent } from '../services/resend-webhook.service';
import { receiveResendWebhook } from './resend-webhook.controller';

vi.mock('../services/resend-webhook.service', () => ({
  processResendWebhookEvent: vi.fn().mockResolvedValue({ handled: true }),
}));

const secret = `whsec_${Buffer.alloc(32, 7).toString('base64')}`;

const response = () => {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
};

const signedRequest = (payload: string, signatureOverride?: string) => {
  const id = 'msg_test_webhook';
  const timestamp = new Date();
  const signature =
    signatureOverride ?? new Webhook(secret).sign(id, timestamp, payload);
  const headers: Record<string, string> = {
    'svix-id': id,
    'svix-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
    'svix-signature': signature,
  };

  return {
    body: Buffer.from(payload),
    header: (name: string) => headers[name.toLowerCase()],
  } as any;
};

describe('resend-webhook.controller', () => {
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = secret;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.RESEND_WEBHOOK_SECRET;
    } else {
      process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    }
  });

  it('verifies the unchanged body and processes a valid event', async () => {
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-10-25T12:00:00.000Z',
      data: { email_id: 'resend-1' },
    });
    const req = signedRequest(payload);
    const res = response();

    await receiveResendWebhook(req, res);

    expect(processResendWebhookEvent).toHaveBeenCalledWith(
      JSON.parse(payload),
      'msg_test_webhook'
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 400 for missing or invalid signature headers', async () => {
    const res = response();
    await receiveResendWebhook(
      { body: Buffer.from('{}'), header: () => undefined } as any,
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);

    const invalidRes = response();
    await receiveResendWebhook(signedRequest('{}', 'v1,invalid'), invalidRes);
    expect(invalidRes.status).toHaveBeenCalledWith(400);
    expect(processResendWebhookEvent).not.toHaveBeenCalled();
  });

  it('returns 400 for a validly signed malformed payload', async () => {
    const payload = JSON.stringify({ type: 'email.failed', data: {} });
    const res = response();

    await receiveResendWebhook(signedRequest(payload), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(processResendWebhookEvent).not.toHaveBeenCalled();
  });

  it('propagates database failures so Express returns 5xx and Resend retries', async () => {
    vi.mocked(processResendWebhookEvent).mockRejectedValueOnce(
      new Error('database unavailable')
    );
    const payload = JSON.stringify({
      type: 'email.failed',
      created_at: '2026-10-25T12:00:00.000Z',
      data: { email_id: 'resend-1' },
    });

    await expect(
      receiveResendWebhook(signedRequest(payload), response())
    ).rejects.toThrow('database unavailable');
  });
});
