import { Notification, NotificationCategory } from '@prisma/client';
import {
  NotificationListItemResponse,
  type NotificationKind,
} from '../../types/notification.type';

export const getNotificationKind = (item: {
  category: NotificationCategory;
  requires_action: boolean;
  metadata: unknown;
}): NotificationKind => {
  if (item.metadata && typeof item.metadata === 'object') {
    const metadataKind = (item.metadata as Record<string, unknown>)
      .notification_kind;
    if (typeof metadataKind === 'string') {
      return metadataKind as NotificationKind;
    }
  }

  switch (item.category) {
    case NotificationCategory.DEADLINES:
      return 'DUE_SOON';
    case NotificationCategory.CANCELLATIONS:
      return item.requires_action ? 'CANCEL_REQUESTED' : 'CANCEL_APPROVED';
    case NotificationCategory.APPROVALS:
      return item.requires_action ? 'WAITING_APPROVE' : 'APPROVED_STEP';
    case NotificationCategory.DELEGATION:
      return 'DELEGATION_STARTED';
    case NotificationCategory.VENDOR_SUBMISSIONS:
      return 'ASSIGNED_DOCUMENT';
    case NotificationCategory.FINANCE_HANDOFFS:
      return 'FINANCE_SUBMIT';
    case NotificationCategory.WORKFLOW_UPDATES:
      return 'APPROVED_STEP';
    case NotificationCategory.ASSIGNMENTS:
    case NotificationCategory.SYSTEM_ACCOUNT:
    default:
      return 'ASSIGNED_PROJECTS';
  }
};

export const mapNotificationRecord = (
  item: Notification
): NotificationListItemResponse => ({
  id: item.id,
  kind: getNotificationKind(item),
  category: item.category,
  priority: item.priority,
  title: item.title,
  body: item.body,
  target_path: item.target_path,
  action_label: item.action_label,
  requires_action: item.requires_action,
  is_read: item.is_read,
  read_at: item.read_at,
  created_at: item.created_at,
  metadata: item.metadata,
});
