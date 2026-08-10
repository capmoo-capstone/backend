import { RegistrationStatus, UserRole, RegisterType } from '@prisma/client';
import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, txMock } from '../../test/prisma-mock';
import {
  approveRegistrationRequest,
  createRegistrationRequest,
  listRegistrationRequests,
  rejectRegistrationRequest,
} from '../registration.service';

vi.mock('bcrypt', () => ({
  default: { hash: vi.fn() },
  hash: vi.fn(),
}));

const actor = {
  id: 'admin-1',
  username: 'admin',
  full_name: 'Admin User',
  token: 'token',
  roles: [],
  is_delegated: false,
  delegated_by: [],
};

const requestData = {
  username: 'portal.staff',
  email: 'staff@chula.ac.th',
  full_name: 'Portal Staff',
  dept_id: 'dept-1',
  unit_id: 'unit-1',
};

const mockDepartmentAndUnit = () => {
  txMock.department.findUnique.mockResolvedValue({ id: 'dept-1' });
  txMock.unit.findUnique.mockResolvedValue({ id: 'unit-1', dept_id: 'dept-1' });
};

describe('account-registration.service', () => {
  beforeEach(() => {
    vi.mocked(bcrypt.hash).mockReset();
  });

  it('creates a pending SSO request without creating a user', async () => {
    mockDepartmentAndUnit();
    txMock.registrationRequest.create.mockResolvedValue({
      id: 'request-1',
      ...requestData,
      register_type: RegisterType.SSO,
      status: RegistrationStatus.PENDING,
      created_at: new Date('2026-08-10T00:00:00.000Z'),
    });

    const result = await createRegistrationRequest(requestData);

    expect(result.status).toBe(RegistrationStatus.PENDING);
    expect(txMock.registrationRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ register_type: RegisterType.SSO }),
    });
    expect(txMock.user.create).not.toHaveBeenCalled();
    expect(txMock.auditEvent.create).toHaveBeenCalled();
  });

  it('rejects a request whose unit is in another department', async () => {
    txMock.department.findUnique.mockResolvedValue({ id: 'dept-1' });
    txMock.unit.findUnique.mockResolvedValue({
      id: 'unit-1',
      dept_id: 'dept-2',
    });

    await expect(createRegistrationRequest(requestData)).rejects.toThrow(
      'Unit does not belong to this department'
    );

    expect(txMock.registrationRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate pending request with the same username or email', async () => {
    mockDepartmentAndUnit();
    txMock.registrationRequest.findFirst.mockResolvedValue({
      id: 'pending-request-1',
    });

    await expect(createRegistrationRequest(requestData)).rejects.toThrow(
      'A matching registration request is already pending'
    );

    expect(txMock.registrationRequest.create).not.toHaveBeenCalled();
  });

  it('approves a pending request as an SSO user with a guest role', async () => {
    mockDepartmentAndUnit();
    txMock.registrationRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      ...requestData,
      register_type: RegisterType.SSO,
      status: RegistrationStatus.PENDING,
    });
    txMock.user.create.mockResolvedValue({
      id: 'user-1',
      ...requestData,
      register_type: RegisterType.SSO,
      created_at: new Date('2026-08-10T00:00:00.000Z'),
      role_updated_at: new Date('2026-08-10T00:00:00.000Z'),
      roles: [],
    });
    txMock.registrationRequest.update.mockResolvedValue({
      id: 'request-1',
      ...requestData,
      register_type: RegisterType.SSO,
      status: RegistrationStatus.APPROVED,
      reviewed_at: new Date('2026-08-10T00:00:00.000Z'),
    });

    const result = await approveRegistrationRequest(
      actor as any,
      'request-1'
    );

    expect(result.register_type).toBe(RegisterType.SSO);
    expect(txMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          password: null,
          register_type: RegisterType.SSO,
          roles: {
            create: {
              role: UserRole.GUEST,
              dept_id: 'dept-1',
              unit_id: 'unit-1',
            },
          },
        }),
      })
    );
    expect(txMock.registrationRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RegistrationStatus.APPROVED,
          created_user_id: 'user-1',
        }),
      })
    );
  });

  it('rejects a pending request and records the reason', async () => {
    txMock.registrationRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      ...requestData,
      register_type: RegisterType.SSO,
      status: RegistrationStatus.PENDING,
    });
    txMock.registrationRequest.update.mockResolvedValue({
      id: 'request-1',
      ...requestData,
      register_type: RegisterType.SSO,
      status: RegistrationStatus.REJECTED,
      reviewed_at: new Date('2026-08-10T00:00:00.000Z'),
    });

    const result = await rejectRegistrationRequest(
      actor as any,
      'request-1'
    );

    expect(result.status).toBe(RegistrationStatus.REJECTED);
    expect(txMock.user.create).not.toHaveBeenCalled();
    expect(txMock.auditEvent.create).toHaveBeenCalled();
  });

  it('does not approve a request that has already been reviewed', async () => {
    txMock.registrationRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      ...requestData,
      register_type: RegisterType.SSO,
      status: RegistrationStatus.APPROVED,
    });

    await expect(
      approveRegistrationRequest(actor as any, 'request-1')
    ).rejects.toThrow('Registration request has already been reviewed');

    expect(txMock.user.create).not.toHaveBeenCalled();
  });

  it('lists registration requests with pagination', async () => {
    const mockList = [
      {
        id: 'request-1',
        ...requestData,
        register_type: RegisterType.SSO,
        status: RegistrationStatus.PENDING,
      },
    ];
    prismaMock.$transaction.mockResolvedValue([mockList, 1]);

    const result = await listRegistrationRequests(
      1,
      10,
      {
        status: RegistrationStatus.PENDING,
      }
    );

    expect(result).toEqual({
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      data: mockList,
    });
    expect(prismaMock.registrationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: RegistrationStatus.PENDING },
        skip: 0,
        take: 10,
      })
    );
    expect(prismaMock.registrationRequest.count).toHaveBeenCalledWith({
      where: { status: RegistrationStatus.PENDING },
    });
  });
});
