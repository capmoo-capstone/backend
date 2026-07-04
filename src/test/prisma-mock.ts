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
  'upsert',
] as const;

const MODEL_NAMES = [
  'auditEvent',
  'auditLog',
  'budgetPlan',
  'department',
  'holiday',
  'project',
  'projectCancellation',
  'projectContractNumber',
  'projectHistory',
  'projectSubmission',
  'submissionDocument',
  'unit',
  'user',
  'userDelegation',
  'userOrganizationRole',
] as const;

type MockModel = Record<
  (typeof MODEL_METHODS)[number],
  ReturnType<typeof vi.fn>
>;

const createModelMock = (): MockModel =>
  Object.fromEntries(
    MODEL_METHODS.map((method) => [method, vi.fn()])
  ) as MockModel;

const createClientMock = () =>
  Object.fromEntries(MODEL_NAMES.map((model) => [model, createModelMock()]));

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
