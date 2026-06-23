function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function printJsonError(message: string): void {
  console.error(JSON.stringify({ error: message }, null, 2));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { errorMessage, printJson, printJsonError };
