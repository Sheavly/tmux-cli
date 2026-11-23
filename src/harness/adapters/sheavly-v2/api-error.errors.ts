/** The server answered, and said no: `status` is the HTTP status, the message is its own words. */
export class ApiError extends Error {
  readonly status: number;

  constructor(params: { message: string; status: number }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
  }
}
