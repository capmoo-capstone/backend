export interface PaginatedResponse<T> {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  data: Array<Partial<T>>;
}

export interface ListResponse<T> {
  total: number;
  data: Array<Partial<T>>;
}

export interface DataResponse<T> {
  data: T;
}
