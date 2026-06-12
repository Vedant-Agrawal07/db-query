import expressAsyncHandler from "express-async-handler";
import userPool from "../config/poolStore.js";
import { filterSchema } from "../utils/schemaFilter.js";
import { buildPrompt } from "../services/gemini/promptBuilder.js";
import { generateQuery } from "../services/gemini/geminiService.js";
import { validateQuery } from "../validators/safetyValidator.js";
import { fetchFullSchema } from "../services/databaseService.js";
import { executeMongoQuery } from "../services/query/queryExecutor.js";
import { getQueryRiskLabel } from "../services/query/riskClassifier.js";

/**
 * Endpoint for /api/user/ask-ai/:db
 */
const askAi = expressAsyncHandler(async (req, res) => {
  const { threadId, question } = req.body;
  const { db } = req.params; // 'mySql', 'postgres', 'mongoDb'

  if (!threadId) {
    res.status(400).json({ message: "threadId is required to access your database connection." });
    return;
  }
  if (!question) {
    res.status(400).json({ message: "question is required." });
    return;
  }

  const connection = userPool.get(threadId);
  if (!connection) {
    res.status(404).json({ message: "No active database connection found for this threadId. Please connect first." });
    return;
  }

  try {
    // 1. Fetch full schema from DB
    const fullSchema = await fetchFullSchema(connection, db);

    // 2. Filter schema based on user question keywords
    const filteredSchema = filterSchema(fullSchema, question);

    // 3. Build prompt
    const prompt = buildPrompt(db, filteredSchema, question);

    // 4. Send prompt to Gemini API (Single Call)
    const geminiResult = await generateQuery(prompt);

    if (geminiResult.error) {
      res.status(500).json({
        sql: "",
        query: "",
        explanation: "Gemini API generation failed",
        executable: false,
        warning: geminiResult.error,
        warnings: [geminiResult.error],
        result: null,
        results: []
      });
      return;
    }

    const generatedQuery = geminiResult.query;
    const explanation = geminiResult.explanation;

    // 5. Validate the generated query
    const validation = validateQuery(generatedQuery, db, fullSchema);

    // 6. Execute query on DB only if validation says it is executable
    let queryResults = [];
    let queryError = null;

    if (validation.executable) {
      try {
        if (db === "mySql") {
          const [rows] = await connection.query(generatedQuery);
          queryResults = rows;
        } else if (db === "postgres") {
          const { rows } = await connection.query(generatedQuery);
          queryResults = rows;
        } else if (db === "mongoDb") {
          queryResults = await executeMongoQuery(connection, generatedQuery);
        }
      } catch (err) {
        queryError = `Execution error: ${err.message}`;
      }
    }

    const finalWarning = queryError || validation.warning || null;

    const responseData = {
      sql: generatedQuery,
      query: generatedQuery, // backward compatibility for frontend
      explanation,
      executable: validation.executable,
      warning: finalWarning,
      warnings: finalWarning ? [finalWarning] : [], // backward compatibility for frontend
      result: (validation.executable && !queryError) ? queryResults : null,
      results: (validation.executable && !queryError) ? queryResults : [], // backward compatibility for frontend
      preview: geminiResult.preview || null
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error("Error in ask-ai endpoint:", error);
    res.status(500).json({
      sql: "",
      query: "",
      explanation: "An unexpected error occurred in AI query generation",
      executable: false,
      warning: error.message,
      warnings: [error.message],
      result: null,
      results: [],
      preview: null
    });
  }
});

/**
 * Endpoint to safely execute query after frontend approval and backend validation.
 */
const executeQuery = expressAsyncHandler(async (req, res) => {
  const { threadId, query } = req.body;
  const { db } = req.params; // 'mySql', 'postgres', 'mongoDb'

  if (!threadId) {
    res.status(400).json({ message: "threadId is required." });
    return;
  }
  if (!query) {
    res.status(400).json({ message: "Query is required." });
    return;
  }

  const connection = userPool.get(threadId);
  if (!connection) {
    res.status(404).json({ message: "Active database connection not found." });
    return;
  }

  // 1. Validate the query again (Risk check + safetyValidator table/column existence check)
  const risk = getQueryRiskLabel(query, db);
  if (risk === "HIGH_RISK") {
    res.status(400).json({ message: "Validation failed: High risk queries are blocked from execution." });
    return;
  }

  try {
    const fullSchema = await fetchFullSchema(connection, db);
    const validation = validateQuery(query, db, fullSchema);
    
    // Check if safety validator returned an error about non-existent table/column
    if (validation.warning === "⚠ This query will not be executed, but you can review or edit it.") {
      res.status(400).json({ message: "Validation failed: The query contains invalid tables or columns." });
      return;
    }

    // 2. Execute the query
    let queryResults = [];
    let affectedRows = 0;
    let queryType = "SELECT";
    let message = "Executed successfully.";

    const isMongo = db === "mongoDb";
    
    if (isMongo) {
      const lowerQuery = query.toLowerCase();
      if (lowerQuery.includes(".insert") || lowerQuery.includes(".save")) {
        queryType = "INSERT";
      } else if (lowerQuery.includes(".update") || lowerQuery.includes(".replace")) {
        queryType = "UPDATE";
      } else if (lowerQuery.includes(".delete") || lowerQuery.includes(".remove")) {
        queryType = "DELETE";
      } else if (lowerQuery.includes(".create")) {
        queryType = "CREATE";
      }

      const rawResult = await executeMongoQuery(connection, query);
      if (rawResult) {
        if (queryType === "INSERT") {
          affectedRows = rawResult.insertedCount || (rawResult.insertedId ? 1 : 0) || 0;
          message = `${affectedRows} document(s) inserted.`;
        } else if (queryType === "UPDATE") {
          affectedRows = rawResult.modifiedCount || rawResult.matchedCount || 0;
          message = `${affectedRows} document(s) updated.`;
        } else if (queryType === "DELETE") {
          affectedRows = rawResult.deletedCount || 0;
          message = `${affectedRows} document(s) deleted.`;
        } else if (queryType === "CREATE") {
          message = "Collection created successfully.";
        } else {
          queryResults = Array.isArray(rawResult) ? rawResult : [rawResult];
        }
      }
    } else {
      const firstWordMatch = query.trim().match(/^[a-zA-Z_]+/);
      const firstWord = firstWordMatch ? firstWordMatch[0].toUpperCase() : "";
      
      if (firstWord === "INSERT") {
        queryType = "INSERT";
      } else if (firstWord === "UPDATE") {
        queryType = "UPDATE";
      } else if (firstWord === "DELETE") {
        queryType = "DELETE";
      } else if (firstWord === "CREATE" || firstWord === "ALTER") {
        queryType = "SCHEMA";
      }

      if (db === "mySql") {
        const [result] = await connection.query(query);
        if (queryType === "SELECT" || Array.isArray(result)) {
          queryResults = result;
          queryType = "SELECT";
        } else {
          affectedRows = result.affectedRows || 0;
          message = `Query executed. ${affectedRows} row(s) affected.`;
        }
      } else {
        // postgres
        const result = await connection.query(query);
        if (queryType === "SELECT" || result.command === "SELECT" || (Array.isArray(result.rows) && result.command === "SELECT")) {
          queryResults = result.rows;
          queryType = "SELECT";
        } else {
          affectedRows = result.rowCount || 0;
          message = `Query executed. ${affectedRows} row(s) affected.`;
          if (queryType === "SCHEMA") {
            message = `${result.command} executed successfully.`;
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      type: queryType,
      results: queryResults,
      affectedRows,
      message
    });

  } catch (err) {
    res.status(400).json({ message: `Execution failed: ${err.message}` });
  }
});

export { askAi, executeQuery };
