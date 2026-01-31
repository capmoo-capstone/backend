export interface UserPayload {
  id: string;
  role?: string;
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
