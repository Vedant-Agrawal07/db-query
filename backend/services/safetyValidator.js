/**
 * Validates AI-generated queries to prevent dangerous actions and ensure schema integrity.
 * Allows all queries to be returned for display, but flags whether they are executable.
 * 
 * @param {string} query - The generated SQL or MQL query
 * @param {string} dbType - Database type ('mySql', 'postgres', 'mongoDb')
 * @param {Array<{table: string, columns: string[]}>} fullSchema - Entire database schema
 * @returns {{isValid: boolean, executable: boolean, warning: string|null}} Validation result
 */
export const validateQuery = (query, dbType, fullSchema) => {
  if (!query || typeof query !== "string" || query.trim() === "") {
    return {
      isValid: true,
      executable: false,
      warning: "⚠ This query will not be executed, but you can review or edit it."
    };
  }

  // 1. Clean query of comments and string literals to avoid false positives
  let cleanQuery = query;
  // Remove standard single-line comments
  cleanQuery = cleanQuery.replace(/--.*$/gm, "");
  // Remove multi-line comments
  cleanQuery = cleanQuery.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove MongoDB-style double-slash comments
  cleanQuery = cleanQuery.replace(/\/\/.*$/gm, "");
  // Remove string literals (replace with empty string to ignore their contents)
  cleanQuery = cleanQuery.replace(/'[^']*'/g, "''");
  cleanQuery = cleanQuery.replace(/"[^"]*"/g, '""');

  // 2. Scan for forbidden write operations (SQL & MQL)
  const dangerousSQLKeywords = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE"];
  for (const keyword of dangerousSQLKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(cleanQuery)) {
      return {
        isValid: true,
        executable: false,
        warning: "⚠ This operation modifies data. Proceed with caution."
      };
    }
  }

  if (dbType !== "mongoDb") {
    // Check if SQL query starts with SELECT, WITH, SHOW, DESC, or EXPLAIN
    const firstWordMatch = cleanQuery.trim().match(/^[a-zA-Z_]+/);
    const firstWord = firstWordMatch ? firstWordMatch[0].toUpperCase() : "";
    const safeStarts = ["SELECT", "WITH", "SHOW", "DESC", "EXPLAIN"];
    if (firstWord && !safeStarts.includes(firstWord)) {
      return {
        isValid: true,
        executable: false,
        warning: "⚠ This operation modifies data. Proceed with caution."
      };
    }
  } else {
    // Check for write operations in MongoDB queries
    const dangerousMongoOps = ["drop", "delete", "remove", "update", "insert", "save", "create"];
    for (const op of dangerousMongoOps) {
      const regex = new RegExp(`\\b${op}\\b|\\.${op}`, "i");
      if (regex.test(cleanQuery)) {
        return {
          isValid: true,
          executable: false,
          warning: "⚠ This operation modifies data. Proceed with caution."
        };
      }
    }
  }

  // 3. Verify that tables and columns exist in the database schema
  if (fullSchema && Array.isArray(fullSchema) && fullSchema.length > 0) {
    const allTableNames = fullSchema.map(t => t.table.toLowerCase());
    const allColumnNames = new Set();
    const tableToColumns = {};

    fullSchema.forEach(t => {
      tableToColumns[t.table.toLowerCase()] = t.columns.map(c => c.toLowerCase());
      t.columns.forEach(c => allColumnNames.add(c.toLowerCase()));
    });

    if (dbType !== "mongoDb") {
      // Parse referenced table names in SQL (following FROM or JOIN)
      const tableRegex = /(?:from|join)\s+[\`"]?([a-zA-Z0-9_]+)[\`"]?/gi;
      let match;
      const referencedTables = new Set();
      while ((match = tableRegex.exec(cleanQuery)) !== null) {
        referencedTables.add(match[1].toLowerCase());
      }

      // Check referenced tables against schema
      for (const tableName of referencedTables) {
        if (!allTableNames.includes(tableName)) {
          return {
            isValid: true,
            executable: false,
            warning: "⚠ This query will not be executed, but you can review or edit it."
          };
        }
      }

      // Map table aliases (e.g. "users AS u" or "users u")
      const aliasMap = {};
      const aliasRegex = /(?:from|join)\s+[\`"]?([a-zA-Z0-9_]+)[\`"]?(?:\s+as)?\s+([a-zA-Z0-9_]+)/gi;
      let aliasMatch;
      while ((aliasMatch = aliasRegex.exec(cleanQuery)) !== null) {
        const tableName = aliasMatch[1].toLowerCase();
        const aliasName = aliasMatch[2].toLowerCase();
        const sqlKeywords = new Set(["on", "where", "group", "order", "limit", "using", "as", "inner", "left", "right", "and", "or"]);
        if (allTableNames.includes(tableName) && !sqlKeywords.has(aliasName)) {
          aliasMap[aliasName] = tableName;
        }
      }

      // Verify dot-notation column references (e.g., "u.id" or "users.id")
      const dotRegex = /\b([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\b/g;
      let dotMatch;
      const verifiedDotColumns = new Set();
      while ((dotMatch = dotRegex.exec(cleanQuery)) !== null) {
        const qualifier = dotMatch[1].toLowerCase();
        const colName = dotMatch[2].toLowerCase();
        verifiedDotColumns.add(colName);

        const resolvedTable = aliasMap[qualifier] || (allTableNames.includes(qualifier) ? qualifier : null);
        if (resolvedTable) {
          const validColumns = tableToColumns[resolvedTable] || [];
          if (!validColumns.includes(colName)) {
            return {
              isValid: true,
              executable: false,
              warning: "⚠ This query will not be executed, but you can review or edit it."
            };
          }
        }
      }

      // Check other referenced columns (without table prefixes)
      const queryWords = cleanQuery.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
      const sqlKeywords = new Set([
        "select", "from", "where", "join", "on", "and", "or", "not", "in", "is", "null",
        "as", "group", "by", "order", "having", "limit", "offset", "like", "inner",
        "left", "right", "outer", "cross", "natural", "using", "with", "case", "when",
        "then", "else", "end", "count", "sum", "avg", "min", "max", "coalesce", "concat",
        "substring", "length", "now", "curdate", "year", "month", "day", "true", "false",
        "exists", "between", "any", "all", "some", "union"
      ]);

      const activeTables = referencedTables.size > 0 ? Array.from(referencedTables) : allTableNames;
      const allowedColumns = new Set();
      activeTables.forEach(t => {
        const cols = tableToColumns[t];
        if (cols) {
          cols.forEach(c => allowedColumns.add(c));
        }
      });

      for (const word of queryWords) {
        const lowerWord = word.toLowerCase();
        // If it's a known column in the database schema but is not allowed on the referenced tables
        if (!sqlKeywords.has(lowerWord) && !allTableNames.includes(lowerWord) && !aliasMap[lowerWord]) {
          if (allColumnNames.has(lowerWord) && !allowedColumns.has(lowerWord)) {
            return {
              isValid: true,
              executable: false,
              warning: "⚠ This query will not be executed, but you can review or edit it."
            };
          }
          // If the column name does not exist in the database schema at all, and is not a dot-notation column we already verified
          if (!allColumnNames.has(lowerWord) && !verifiedDotColumns.has(lowerWord) && !sqlKeywords.has(lowerWord)) {
            const commonFunctions = new Set(["concat", "length", "now", "coalesce"]);
            if (!commonFunctions.has(lowerWord) && lowerWord.length > 2) {
              return {
                isValid: true,
                executable: false,
                warning: "⚠ This query will not be executed, but you can review or edit it."
              };
            }
          }
        }
      }
    } else {
      // MongoDB collection name validation
      const collectionMatch = cleanQuery.match(/db\.([a-zA-Z0-9_]+)\./);
      if (collectionMatch) {
        const colName = collectionMatch[1].toLowerCase();
        if (!allTableNames.includes(colName)) {
          return {
            isValid: true,
            executable: false,
            warning: "⚠ This query will not be executed, but you can review or edit it."
          };
        }
      }
    }
  }

  return {
    isValid: true,
    executable: true,
    warning: null
  };
};
