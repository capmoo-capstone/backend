import { Request, Response } from 'express';
import { Webhook } from 'svix';
import { ServiceUnavailableError } from '../utils/errors';
import {
  ResendWebhookEvent,
  processResendWebhookEvent,
} from '../services/resend-webhook.service';

const getHeader = (req: Request, name: string) => {
  const value = req.header(name);
  return value?.trim() || null;
};

export const receiveResendWebhook = async (req: Request, res: Response) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new ServiceUnavailableError(
      'RESEND_WEBHOOK_SECRET is not configured'
    );
  }

  const svixId = getHeader(req, 'svix-id');
  const svixTimestamp = getHeader(req, 'svix-timestamp');
  const svixSignature = getHeader(req, 'svix-signature');
  if (
    !svixId ||
    !svixTimestamp ||
    !svixSignature ||
    !Buffer.isBuffer(req.body)
  ) {
    return res
      .status(400)
      .json({ message: 'Invalid Resend webhook signature' });
  }

  let event: ResendWebhookEvent;
  try {
    event = new Webhook(secret).verify(req.body.toString('utf8'), {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookEvent;
  } catch {
    return res
      .status(400)
      .json({ message: 'Invalid Resend webhook signature' });
  }

  if (
    !event ||
    typeof event !== 'object' ||
    typeof event.type !== 'string' ||
    typeof event.created_at !== 'string' ||
    Number.isNaN(new Date(event.created_at).getTime()) ||
    !event.data ||
    typeof event.data !== 'object'
  ) {
    return res
      .status(400)
      .json({ message: 'Malformed Resend webhook payload' });
  }

  await processResendWebhookEvent(event, svixId);

  return res.status(200).json({ received: true });
};
