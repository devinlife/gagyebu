export class DataError extends Error {}

export class UsageError extends Error {
  constructor(message, usage) {
    super(message);
    this.usage = usage;
  }
}
