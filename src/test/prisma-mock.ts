import { vi } from 'vitest';

const MODEL_METHODS = [
  'aggregate',
  'count',
  'create',
  'createMany',
  'createManyAndReturn',
  'delete',
  'deleteMany',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
] as const;

const MODEL_NAMES = [
  'registrationRequest',
  'auditEvent',
  'auditLog',
  'budgetPlan',
  'department',
  'holiday',
  'notification',
  'notificationDelivery',
  'notificationOutbox',
  'notificationReminder',
  'project',
  'projectCancellation',
  'projectContractNumber',
  'projectInstallment',
  'projectHistory',
  'projectSubmission',
  'samlRequestCache',
  'samlResponseReplay',
  'submissionDocument',
  'unit',
  'user',
  'userDelegation',
  'userOrganizationRole',
] as const;

type MockModel = Record<
  (typeof MODEL_METHODS)[number],
  ReturnType<typeof vi.fn>
> & {
  fields: Record<string, unknown>;
};

const createModelMock = (model?: (typeof MODEL_NAMES)[number]): MockModel =>
  ({
    ...Object.fromEntries(MODEL_METHODS.map((method) => [method, vi.fn()])),
    // Field references are passed through query objects by Prisma. Tests do not
    // execute SQL, so a stable marker is sufficient to emulate this API.
    fields:
      model === 'project'
        ? {
            procurement_completed_at: {
              name: 'procurement_completed_at',
            },
          }
        : {},
  }) as MockModel;

const createClientMock = () =>
  Object.fromEntries(
    MODEL_NAMES.map((model) => [model, createModelMock(model)])
  );

export const txMock = {
  ...createClientMock(),
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
} as any;

export const prismaMock = {
  ...createClientMock(),
  $connect: vi.fn(),
  $disconnect: vi.fn(),
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
} as any;

const resetClientModels = (client: Record<string, any>) => {
  for (const model of MODEL_NAMES) {
    for (const method of MODEL_METHODS) {
      client[model][method].mockReset();
    }
  }
};

export const resetPrismaMock = () => {
  resetClientModels(prismaMock);
  resetClientModels(txMock);

  prismaMock.$connect.mockReset();
  prismaMock.$disconnect.mockReset();
  prismaMock.$executeRaw.mockReset();
  prismaMock.$queryRaw.mockReset();
  prismaMock.$transaction.mockReset();
  txMock.$executeRaw.mockReset();
  txMock.$queryRaw.mockReset();

  prismaMock.$executeRaw.mockResolvedValue(undefined);
  txMock.$executeRaw.mockResolvedValue(undefined);
  prismaMock.$queryRaw.mockResolvedValue([]);
  txMock.$queryRaw.mockResolvedValue([]);
  prismaMock.notificationOutbox.findMany.mockResolvedValue([]);
  prismaMock.notificationOutbox.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.notificationOutbox.update.mockResolvedValue(undefined);
  prismaMock.notificationReminder.upsert.mockResolvedValue({
    id: 'notification-reminder-1',
    sent_at: null,
    notification_id: null,
    error_message: null,
  });
  prismaMock.notificationReminder.update.mockResolvedValue(undefined);
  txMock.notificationOutbox.create.mockResolvedValue(undefined);
  prismaMock.$transaction.mockImplementation(async (arg: any) => {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    if (typeof arg === 'function') {
      return arg(txMock);
    }
    return arg;
  });
};

resetPrismaMock();
