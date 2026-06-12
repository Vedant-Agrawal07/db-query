/**
 * Constructs a structured prompt for the Gemini API.
 * 
 * @param {string} dbType - Type of database ('mySql', 'postgres', 'mongoDb')
 * @param {Array<{table: string, columns: string[]}>} filteredSchema - Subset of schema tables and columns
 * @param {string} question - Natural language user question
 * @returns {string} Fully structured prompt text
 */
export const buildPrompt = (dbType, filteredSchema, question) => {
  // Format the filtered schema into a clean, readable text format
  const schemaDescription = filteredSchema
    .map(tableObj => {
      const colList = tableObj.columns && tableObj.columns.length > 0 
        ? tableObj.columns.join(", ") 
        : "(no columns or fields scanned)";
      return `Table/Collection: "${tableObj.table}"\nColumns/Fields: [${colList}]`;
    })
    .join("\n\n");

  // Determine standard syntax label based on dbType
  const queryLanguage = dbType === "mongoDb" ? "MongoDB MQL" : "SQL";

  const prompt = `You are a professional database AI assistant.
Your goal is to translate the user's natural language question into a valid, highly-curated query matching the requested action.

Database Type: ${dbType}
Target Query Language: ${queryLanguage}

=== DATABASE SCHEMA ===
${schemaDescription}

=== RULES & CONSTRAINTS ===
1. Reference tables/collections and columns/fields listed in the DATABASE SCHEMA above where applicable. If the user wants to create a new table, choose names and columns as specified.
2. DO NOT make assumptions about missing columns. If you are unsure or fields are missing, generate the best possible query with existing fields and explain it in the explanation.
3. You are permitted to generate all query types, including schema definition (CREATE, ALTER, DROP) and data manipulation (INSERT, UPDATE, DELETE). Do not refuse to write a query because it modifies the database; simply generate the query as requested.
4. Respond in a strict JSON format containing EXACTLY three keys: "sql", "explanation", and "preview".
   - "sql": The generated query string (e.g. standard SQL or MongoDB MQL string). This must be valid raw SQL/MQL only, with NO HTML tags, CSS classes, markdown formatting, decorations, or embedded explanations. Return ONLY valid JSON with raw SQL string. No HTML, no markdown, no formatting.
   - "explanation": A plain English walkthrough explaining how the query answers the user question .
   - "preview": If the query is a database write, creation, insertion, mock data generation, or modification operation (e.g., CREATE TABLE, INSERT INTO, UPDATE, ALTER, etc.), provide a mock representation of the final expected table state. The value must be a JSON object with two fields: "columns" (an array of column names) and "rows" (an array of arrays containing mock data values representing standard records). For read-only SELECT queries, set "preview" to null.
5. Return ONLY valid JSON with no markdown, no HTML, no formatting, and no extra text outside the JSON block. Do not wrap the JSON in markdown code blocks like \`\`\`json ... \`\`\`.

=== USER QUESTION ===
"${question}"`;

  return prompt;
};
