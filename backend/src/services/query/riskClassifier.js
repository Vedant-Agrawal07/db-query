/**
 * Helper to determine risk level of a query.
 */
export const getQueryRiskLabel = (query, dbType) => {
  if (!query || typeof query !== "string") return "SAFE";

  // Strip comments and string literals (same regex as safetyValidator)
  let cleanQuery = query;
  cleanQuery = cleanQuery.replace(/--.*$/gm, "");
  cleanQuery = cleanQuery.replace(/\/\*[\s\S]*?\*\//g, "");
  cleanQuery = cleanQuery.replace(/\/\/.*$/gm, "");
  cleanQuery = cleanQuery.replace(/'[^']*'/g, "''");
  cleanQuery = cleanQuery.replace(/"[^"]*"/g, '""');

  const cleanTrimmed = cleanQuery.trim();
  const cleanUpper = cleanTrimmed.toUpperCase();

  if (dbType === "mongoDb") {
    if (/\b(drop|dropDatabase)\b/i.test(cleanQuery)) {
      return "HIGH_RISK";
    }
    if (/\b(createCollection|createIndex)\b/i.test(cleanQuery)) {
      return "MODIFIES_SCHEMA";
    }
    if (/\b(insert|update|delete|remove|save|replaceOne|updateOne|updateMany|insertOne|insertMany|deleteOne|deleteMany)\b/i.test(cleanQuery)) {
      return "MODIFIES_DATA";
    }
    
    if (/\b(aggregate|lookup|group|bucket|facet)\b/i.test(cleanQuery) || !/\b(limit)\b/i.test(cleanQuery)) {
      return "READ_ONLY";
    }
    return "SAFE";
  } else {
    // SQL Risk Check
    if (/\b(DROP|TRUNCATE)\b/i.test(cleanUpper)) {
      return "HIGH_RISK";
    }
    if (/\b(CREATE|ALTER)\b/i.test(cleanUpper)) {
      return "MODIFIES_SCHEMA";
    }
    if (/\b(INSERT|UPDATE|DELETE)\b/i.test(cleanUpper)) {
      return "MODIFIES_DATA";
    }
    
    const hasJoin = /\bJOIN\b/i.test(cleanUpper);
    const hasGroupBy = /\bGROUP\s+BY\b/i.test(cleanUpper);
    const hasAggregates = /\b(COUNT|SUM|AVG|MIN|MAX)\b/i.test(cleanUpper);
    const hasLimit = /\bLIMIT\b/i.test(cleanUpper);

    if (hasJoin || hasGroupBy || hasAggregates || !hasLimit) {
      return "READ_ONLY";
    }
    return "SAFE";
  }
};
