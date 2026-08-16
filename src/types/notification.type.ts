import {
  Notification,
  NotificationCategory,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
} from '@prisma/client';

export type NotificationKind =
  | 'ASSIGNED_PROJECTS'
  | 'ASSIGNED_DOCUMENT'
  | 'RETURNED_FOR_REVISION'
  | 'DUE_SOON'
  | 'APPROVED_STEP'
  | 'SIGNED_STEP'
  | 'CANCEL_APPROVED'
  | 'CANCEL_REJECTED'
  | 'RESPONSIBLE_ADDED'
  | 'RESPONSIBLE_REMOVED'
  | 'DELEGATION_STARTED'
  | 'DELEGATION_ENDED'
  | 'WAITING_APPROVE'
  | 'CANCEL_REQUESTED'
  | 'SIGN_REQUIRED'
  | 'FINANCE_SUBMIT';

export interface NotificationListItemResponse {
  id: string;
  kind: NotificationKind;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  target_path: string | null;
  action_label: string | null;
  requires_action: boolean;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
  metadata: unknown;
}

export interface NotificationListResponse {
  items: NotificationListItemResponse[];
  unread_count: number;
  has_more: boolean;
  next_cursor: string | null;
}

export interface NotificationDeliveryRecord {
  id: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  subject: string;
  body: string | null;
  dedupe_key: string | null;
}

export interface NotificationRealtimeEnvelope {
  type: 'notification.created' | 'notification.updated';
  notification: NotificationListItemResponse;
  unread_count: number;
}

export interface NotificationStreamTokenResponse {
  token: string;
  expires_in_seconds: number;
}

export interface PersistedNotificationResult {
  userId: string;
  action: 'created' | 'updated';
  notification: Notification;
  unreadCount: number;
}
