export class DataError extends Error {}

export class UsageError extends Error {
  constructor(message, usage) {
    super(message);
    this.usage = usage;
  }
}

export function unexpectedArgument(value, usage) {
  return new UsageError(`예상하지 않은 인자입니다: ${value}`, usage);
}
