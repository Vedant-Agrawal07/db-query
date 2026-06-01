import expressAsyncHandler from "express-async-handler";
import userPool from "../poolStore.js";
import { filterSchema } from "../services/schemaFilter.js";
import { buildPrompt } from "../services/promptBuilder.js";
import { generateQuery } from "../services/geminiService.js";
import { validateQuery } from "../services/safetyValidator.js";

/**
 * Helper to fetch tables and their columns in a single run.
 */
const fetchFullSchema = async (connection, dbType) => {
  if (dbType === "mySql") {
    const [rows] = await connection.query(`
      SELECT TABLE_NAME as tableName, COLUMN_NAME as columnName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    const schemaMap = {};
    rows.forEach(r => {
      const table = r.tableName;
      const col = r.columnName;
      if (!schemaMap[table]) schemaMap[table] = [];
      schemaMap[table].push(col);
    });
    return Object.keys(schemaMap).map(table => ({
      table,
      columns: schemaMap[table]
    }));
  } else if (dbType === "postgres" || dbType === "postgreSql") {
    const { rows } = await connection.query(`
      SELECT table_name as "tableName", column_name as "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);
    const schemaMap = {};
    rows.forEach(r => {
      const table = r.tableName;
      const col = r.columnName;
      if (!schemaMap[table]) schemaMap[table] = [];
      schemaMap[table].push(col);
    });
    return Object.keys(schemaMap).map(table => ({
      table,
      columns: schemaMap[table]
    }));
  } else if (dbType === "mongoDb") {
    const collections = await connection.listCollections().toArray();
    const schema = [];
    for (const col of collections) {
      const colName = col.name;
      // Fetch a sample document to discover fields
      const doc = await connection.collection(colName).findOne();
      const columns = doc ? Object.keys(doc) : [];
      schema.push({ table: colName, columns });
    }
    return schema;
  }
  return [];
};

/**
 * Execute MongoDB queries represented as strings.
 * Expected format: db.collectionName.find({...}) or db.collectionName.aggregate([...])
 */
const executeMongoQuery = async (connection, queryStr) => {
  const mongoRegex = /db\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\(([\s\S]*)\)/;
  const match = queryStr.match(mongoRegex);
  if (!match) {
    throw new Error("Invalid MongoDB query format. Expected: db.collectionName.method(...)");
  }

  const collectionName = match[1];
  const method = match[2];
  const argsStr = match[3].trim();

  const collection = connection.collection(collectionName);

  if (typeof collection[method] !== "function") {
    throw new Error(`MongoDB collection does not support method "${method}"`);
  }

  let args = [];
  if (argsStr) {
    try {
      // Evaluate relaxed JSON/JS objects safely
      args = new Function(`return [${argsStr}]`)();
    } catch (e) {
      try {
        args = [JSON.parse(argsStr)];
      } catch (err) {
        throw new Error("Failed to parse MongoDB query arguments: " + e.message);
      }
    }
  }

  const cursor = collection[method](...args);

  if (cursor && typeof cursor.toArray === "function") {
    return await cursor.toArray();
  } else if (cursor && typeof cursor.then === "function") {
    return await cursor;
  } else {
    return cursor;
  }
};

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
 * Helper to fetch database schema for the Left Explorer Tree
 */
const getSchema = expressAsyncHandler(async (req, res) => {
  const { threadId } = req.body;
  const { db } = req.params;

  if (!threadId) {
    res.status(400).json({ message: "threadId is required." });
    return;
  }

  const connection = userPool.get(threadId);
  if (!connection) {
    res.status(404).json({ message: "Active database connection not found." });
    return;
  }

  try {
    const schema = await fetchFullSchema(connection, db);
    res.status(200).json({ schema });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch database schema", error: error.message });
  }
});

export { askAi, getSchema };
