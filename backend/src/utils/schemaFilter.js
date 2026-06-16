/**
 * Selects a subset of the database schema based on keywords in the user query.
 * If no matches are found, it falls back to returning the full schema.
 *
 * @param {Array<{table: string, columns: string[]}>} fullSchema - Complete database schema
 * @param {string} question - Natural language user question
 * @returns {Array<{table: string, columns: string[]}>} Filtered subset of the schema
 */
export const filterSchema = (fullSchema, question) => {
  if (!fullSchema || !Array.isArray(fullSchema) || fullSchema.length === 0) {
    return [];
  }

  // Normalize user question: lowercase and tokenize by non-alphanumeric (except underscores)
  const normalizedQuestion = question.toLowerCase();
  const words = normalizedQuestion.split(/[^a-zA-Z0-9_]+/).filter(Boolean);

  const filtered = [];

  for (const tableObj of fullSchema) {
    const tableName = tableObj.table.toLowerCase();

    // Check direct matches, substring matches, or if a word is in the table name
    let isMatched = words.some(
      (word) =>
        word === tableName ||
        tableName.includes(word) ||
        word.includes(tableName),
    );

    // If not matched by table name, check column names
    if (!isMatched && tableObj.columns && Array.isArray(tableObj.columns)) {
      for (const col of tableObj.columns) {
        const colName = col.toLowerCase();
        if (
          words.some(
            (word) =>
              word === colName ||
              colName.includes(word) ||
              word.includes(colName),
          )
        ) {
          isMatched = true;
          break;
        }
      }
    }

    if (isMatched) {
      filtered.push(tableObj);
    }
  }

  // Fallback: If no match found, return the full schema
  return filtered.length > 0 ? filtered : fullSchema;
};
