/** Transport-neutral application error safe to use from shared domain modules. */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
