import { prisma } from '../config/prisma';
import { Department, Prisma, Unit, UserRole } from '@prisma/client';
import { NotFoundError } from '../lib/errors';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from '../schemas/department.schema';
import { AuthPayload } from '../types/auth.type';
import {
  DepartmentListItem,
  DepartmentsListOptions,
  DepartmentsListResponse,
} from '../types/department.type';

export const listDepartments = async (
  _user: AuthPayload,
  options: DepartmentsListOptions = {}
): Promise<DepartmentsListResponse> => {
  const where: Prisma.DepartmentWhereInput = options.excludeDeptIds?.length
    ? { id: { notIn: options.excludeDeptIds } }
    : {};
  const include: Prisma.DepartmentInclude = options.withUnit
    ? {
        units: {
          select: {
            id: true,
            dept_id: true,
            name: true,
            type: true,
            organization_roles: {
              where: {
                role: UserRole.REPRESENTATIVE,
              },
              select: {
                user: {
                  select: {
                    id: true,
                    full_name: true,
                  },
                },
              },
            },
          },
        },
      }
    : {};
  const [departments, total] = await prisma.$transaction([
    prisma.department.findMany({
      where,
      include: options.withUnit ? include : undefined,
      orderBy: { name: 'asc' },
    }),
    prisma.department.count({ where }),
  ]);

  return {
    total,
    data: departments.map((department) => {
      const departmentWithUnits =
        department as unknown as DepartmentListItem & {
          units?: {
            id: string;
            dept_id: string;
            name: string;
            type: Unit['type'];
            organization_roles: {
              user: {
                id: string;
                full_name: string;
              };
            }[];
          }[];
        };
      const data: DepartmentListItem = {
        id: department.id,
        name: department.name,
      };

      if (options.withUnit) {
        const unitRows = (departmentWithUnits.units ?? []) as {
          id: string;
          dept_id: string;
          name: string;
          type: Unit['type'];
          organization_roles: {
            user: {
              id: string;
              full_name: string;
            };
          }[];
        }[];
        data.units = unitRows.map((unit) => {
          const rep = unit.organization_roles[0]?.user;
          return {
            id: unit.id,
            dept_id: unit.dept_id,
            name: unit.name,
            type: unit.type,
            rep: rep
              ? {
                  id: rep.id,
                  full_name: rep.full_name,
                }
              : null,
          };
        });
      }

      return data;
    }),
  };
};

export const getById = async (id: string): Promise<Department> => {
  const department = await prisma.department.findUnique({
    where: { id },
    include: {
      units: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  if (!department) {
    throw new NotFoundError('Department not found');
  }
  return department;
};

export const createDepartment = async (
  data: CreateDepartmentDto
): Promise<Department> => {
  return await prisma.department.create({
    data: {
      id: data.id,
      name: data.name,
    },
  });
};

export const updateDepartment = async (
  data: UpdateDepartmentDto
): Promise<Department> => {
  await getById(data.id);
  return await prisma.department.update({
    where: { id: data.id },
    data: { ...data },
  });
};

export const deleteDepartment = async (id: string): Promise<Department> => {
  await getById(id);
  return await prisma.department.delete({
    where: { id },
  });
};
