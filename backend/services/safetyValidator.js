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
      const words = cleanQuery.match(/\b[a-zA-Z0-9_]+\b/g) || [];
      const referencedTables = new Set();
      const aliasMap = {};
      const definedAliases = new Set();

      const sqlKeywords = new Set([
        "select", "from", "join", "on", "where", "group", "by", "order", "having", "limit", 
        "offset", "union", "as", "inner", "left", "right", "outer", "cross", "natural", 
        "using", "and", "or", "not", "in", "is", "null", "case", "when", "then", "else", 
        "end", "count", "sum", "avg", "min", "max", "coalesce", "concat", "substring", 
        "length", "now", "curdate", "year", "month", "day", "true", "false", "exists", 
        "between", "any", "all", "some"
      ]);

      // Parse referenced tables and their aliases
      for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase();
        if (word === "from" || word === "join") {
          if (i + 1 < words.length) {
            const tableName = words[i + 1].toLowerCase();
            // If the table name is not in the schema, and is not a SQL keyword (which indicates a subquery or syntax), block it.
            if (!allTableNames.includes(tableName)) {
              if (!sqlKeywords.has(tableName)) {
                return {
                  isValid: true,
                  executable: false,
                  warning: "⚠ This query will not be executed, but you can review or edit it."
                };
              }
            } else {
              referencedTables.add(tableName);
              
              if (i + 2 < words.length) {
                const nextWord = words[i + 2].toLowerCase();
                if (nextWord === "as") {
                  if (i + 3 < words.length) {
                    const aliasName = words[i + 3].toLowerCase();
                    if (!sqlKeywords.has(aliasName)) {
                      aliasMap[aliasName] = tableName;
                    }
                  }
                } else if (!sqlKeywords.has(nextWord) && !allTableNames.includes(nextWord)) {
                  aliasMap[nextWord] = tableName;
                }
              }
            }
          }
        } else if (word === "as" && i + 1 < words.length) {
          definedAliases.add(words[i + 1].toLowerCase());
        }
      }

      // Verify dot-notation column references (e.g., "u.id" or "users.id")
      const dotRegex = /\b([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\b/g;
      let dotMatch;
      while ((dotMatch = dotRegex.exec(cleanQuery)) !== null) {
        const qualifier = dotMatch[1].toLowerCase();
        const colName = dotMatch[2].toLowerCase();

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
        if (!sqlKeywords.has(lowerWord) && !allTableNames.includes(lowerWord) && !aliasMap[lowerWord] && !definedAliases.has(lowerWord)) {
          if (allColumnNames.has(lowerWord) && !allowedColumns.has(lowerWord)) {
            return {
              isValid: true,
              executable: false,
              warning: "⚠ This query will not be executed, but you can review or edit it."
            };
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
