export class AppError extends Error {
  status: number;
  userMessage: string;
  details?: unknown;

  constructor({
    message,
    userMessage,
    status = 500,
    details,
  }: {
    message: string;
    userMessage: string;
    status?: number;
    details?: unknown;
  }) {
    super(message);
    this.status = status;
    this.userMessage = userMessage;
    this.details = details;
  }
}
