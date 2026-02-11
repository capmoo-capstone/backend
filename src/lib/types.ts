import { UserRole } from '@prisma/client';

export interface UserPayload {
  id: string;
  role?: UserRole | null;
  unit?: {
    id: string;
    name: string;
  };
  dept?: {
    id: string;
    name: string;
    code: string;
  };
}
