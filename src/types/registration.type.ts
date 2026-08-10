import { PaginatedResponse } from "./common.type";
import { RegistrationRequest } from "@prisma/client";

type RegistrationRequestItem = RegistrationRequest & {
    department: { id: string; name: string };
    unit: { id: string; name: string } | null;
};

export type PaginatedRegistrationRequest = PaginatedResponse<RegistrationRequestItem>;