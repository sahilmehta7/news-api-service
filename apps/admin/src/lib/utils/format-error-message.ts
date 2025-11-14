/**
 * Formats error messages from the database into user-friendly messages.
 * Handles both new formatted messages and legacy technical Prisma errors.
 */
export function formatErrorMessage(errorMessage: string | null | undefined): string {
  if (!errorMessage) {
    return "Unknown error occurred";
  }

  // If it's already a user-friendly message (doesn't contain Prisma error patterns), return as-is
  if (!isTechnicalError(errorMessage)) {
    return errorMessage;
  }

  // Handle Prisma unique constraint errors
  if (errorMessage.includes("Unique constraint failed") || errorMessage.includes("P2002")) {
    if (errorMessage.includes("feed_id") && errorMessage.includes("source_url")) {
      return "Article with this URL already exists in this feed";
    }
    if (errorMessage.includes("source_url")) {
      return "Article with this URL already exists";
    }
    return "Duplicate entry - this record already exists";
  }

  // Handle Prisma foreign key errors
  if (errorMessage.includes("Foreign key constraint") || errorMessage.includes("P2003")) {
    return "Referenced record does not exist";
  }

  // Handle Prisma not found errors
  if (errorMessage.includes("Record to") && errorMessage.includes("does not exist") || errorMessage.includes("P2025")) {
    return "Record not found";
  }

  // Handle Prisma validation errors
  if (errorMessage.includes("Invalid `") || errorMessage.includes("Argument") || errorMessage.includes("Unknown argument")) {
    return "Invalid data provided";
  }

  // Handle network/timeout errors
  if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("ETIMEDOUT")) {
    return "Connection failed - service may be unavailable";
  }

  if (errorMessage.includes("timeout") || errorMessage.includes("TIMEOUT")) {
    return "Request timed out - the operation took too long";
  }

  // Handle module not found errors
  if (errorMessage.includes("Cannot find module")) {
    return "Internal error - required module not found";
  }

  // Handle generic Prisma errors
  if (errorMessage.includes("Prisma") || errorMessage.includes("prisma")) {
    return "Database error occurred";
  }

  // For other technical errors, return a generic message
  return "An error occurred during processing";
}

/**
 * Checks if an error message appears to be a technical error that needs formatting
 */
function isTechnicalError(message: string): boolean {
  const technicalPatterns = [
    /Unique constraint failed/i,
    /Foreign key constraint/i,
    /Record to .* does not exist/i,
    /Invalid `.*` invocation/i,
    /P2002|P2003|P2025/i, // Prisma error codes
    /Cannot find module/i,
    /ECONNREFUSED|ETIMEDOUT/i,
    /PrismaClient/i,
    /at \w+ \(/i, // Stack trace patterns
    /Error \[ERR_/i
  ];

  return technicalPatterns.some(pattern => pattern.test(message));
}

