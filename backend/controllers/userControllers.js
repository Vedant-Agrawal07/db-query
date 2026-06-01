import expressAsyncHandler from "express-async-handler";
import {
  initalConnect,
  dbPool,
  fetchTableData,
  scanDb,
  scanTables,
} from "../db/mysqlConnector.js";
import userPool from "../poolStore.js";

import {
  initalConnectMongo,
  dbPoolMongo,
  fetchCollectionData,
  scanDbMongo,
  scanCollections,
} from "../db/mongoDbConnector.js";

import {
  initialConnectPostgres,
  dbPoolPostgres,
  fetchTableDataPostgres,
  scanDbPostgres,
  scanTablesPostgres,
} from "../db/postgresConnector.js";

import crypto from "crypto";

const handshake = expressAsyncHandler(async (req, res) => {
  const { dbType, connectionString } = req.body;
  const db = dbType || req.params.db;

  const validDbTypes = new Set(["mysql", "postgres", "postgresql", "mongodb", "mySql", "mongoDb"]);
  if (!db || !validDbTypes.has(db)) {
    res.status(400).json({ message: "Invalid database type. Must be mysql, postgres, or mongodb." });
    return;
  }
  if (!connectionString || typeof connectionString !== "string" || connectionString.trim() === "") {
    res.status(400).json({ message: "connectionString is required and must be a non-empty string." });
    return;
  }

  // Normalize db type
  let normalizedDb = db.toLowerCase();
  if (normalizedDb === "postgresql") normalizedDb = "postgres";
  if (normalizedDb === "mysql") normalizedDb = "mySql";
  if (normalizedDb === "mongodb") normalizedDb = "mongoDb";

  if (normalizedDb === "mongoDb") {
    try {
      res.status(201).json(await initalConnectMongo(connectionString));
      return;
    } catch (error) {
      res.status(400).json({ message: "Connection handshake failed", issue: error });
      return;
    }
  } else if (normalizedDb === "mySql") {
    try {
      res.status(201).json(await initalConnect(connectionString));
      return;
    } catch (error) {
      res.status(400).json({ message: "Connection handshake failed", issue: error });
      return;
    }
  } else {
    try {
      res.status(201).json(await initialConnectPostgres(connectionString));
      return;
    } catch (error) {
      res.status(400).json({ message: "Connection handshake failed", issue: error });
      return;
    }
  }
});

const connectDb = expressAsyncHandler(async (req, res) => {
  const { dbType, connectionString } = req.body;
  const db = dbType || req.params.db;

  const validDbTypes = new Set(["mysql", "postgres", "postgresql", "mongodb", "mySql", "mongoDb"]);
  if (!db || !validDbTypes.has(db)) {
    res.status(400).json({ message: "Invalid database type. Must be mysql, postgres, or mongodb." });
    return;
  }
  if (!connectionString || typeof connectionString !== "string" || connectionString.trim() === "") {
    res.status(400).json({ message: "connectionString is required and must be a non-empty string." });
    return;
  }

  // Normalize db type
  let normalizedDb = db.toLowerCase();
  if (normalizedDb === "postgresql") normalizedDb = "postgres";
  if (normalizedDb === "mysql") normalizedDb = "mySql";
  if (normalizedDb === "mongodb") normalizedDb = "mongoDb";

  if (normalizedDb === "mongoDb") {
    try {
      const { client, collections } = await dbPoolMongo(connectionString);
      const clientId = crypto.randomUUID();
      userPool.set(clientId, client);
      res.status(201).json({ threadId: clientId, tables: collections });
    } catch (error) {
      res.status(400).json({ message: "Database connection failed", issue: error });
    }
  } else if (normalizedDb === "mySql") {
    try {
      const { pool, tables } = await dbPool(connectionString);
      const poolId = crypto.randomUUID();
      userPool.set(poolId, pool);
      res.status(201).json({ threadId: poolId, tables: tables });
    } catch (error) {
      res.status(400).json({ message: "Database connection failed", issue: error });
    }
  } else {
    try {
      const { pool, tables } = await dbPoolPostgres(connectionString);
      const poolId = crypto.randomUUID();
      userPool.set(poolId, pool);
      res.status(201).json({ threadId: poolId, tables: tables });
    } catch (error) {
      res.status(400).json({ message: "Database connection failed", issue: error });
    }
  }
});

const tableInfo = expressAsyncHandler(async (req, res) => {
  const { threadId, tableName } = req.body;
  const { db } = req.params;
  if (db === "mySql") {
    const pool = userPool.get(threadId);
    const { rows, columns } = await fetchTableData(tableName, pool);
    try {
      res.status(201).json({
        rowData: rows,
        columnData: columns,
      });
    } catch (error) {
      res.status(400).json({ message: "error occured", issue: error });
    }
  } else if (db === "mongoDb") {
    const client = userPool.get(threadId);
    const { rows, columns } = await fetchCollectionData(tableName, client);
    try {
      res.status(201).json({
        rowData: rows,
        columnData: columns,
      });
    } catch (error) {
      res.status(400).json({ message: "error occured", issue: error });
    }
  } else {
    const pool = userPool.get(threadId);
    const { rows, columns } = await fetchTableDataPostgres(tableName, pool);
    try {
      res.status(201).json({
        rowData: rows,
        columnData: columns,
      });
    } catch (error) {
      res.status(400).json({ message: "error occured", issue: error });
    }
  }
});

const databaseScan = expressAsyncHandler(async (req, res) => {
  const { threadId } = req.body;
  const { db } = req.params;
  if (db === "mySql") {
    const pool = userPool.get(threadId);
    // const {databases} = await scanDb(pool);
    try {
      res.status(201).json(await scanDb(pool));
    } catch (error) {
      res.status(400).json({ message: "error occured", issue: error });
    }
  } else if (db === "mongoDb") {
    const client = userPool.get(threadId);
    // const {databases} = await scanDb(pool);
    try {
      res.status(201).json(await scanDbMongo(client));
    } catch (error) {
      res.status(400).json({ message: "error occured", issue: error });
    }
  } else {
    const pool = userPool.get(threadId);
    // const {databases} = await scanDb(pool);
    try {
      res.status(201).json(await scanDbPostgres(pool));
    } catch (error) {
      res.status(400).json({ message: "error occured", issue: error });
    }
  }
});
const tableScan = expressAsyncHandler(async (req, res) => {
  const { threadId } = req.body;
  const { db } = req.params;
  if (db === "mySql") {
    const pool = userPool.get(threadId);
    // const {databases} = await scanDb(pool);
    try {
      res.status(201).json(await scanTables(pool));
    } catch (error) {
      res.status(400).json({ message: "error occured", issue: error });
    }
  } else if (db === "mongoDb") {
    const client = userPool.get(threadId);
    // const {databases} = await scanDb(pool);
    try {
      res.status(201).json(await scanCollections(client));
    } catch (error) {
      res.status(400).json({ message: "error occured", issue: error });
    }
  } else {
    const pool = userPool.get(threadId);
    // const {databases} = await scanDb(pool);
    try {
      res.status(201).json(await scanTablesPostgres(pool));
    } catch (error) {
      res.status(400).json({ message: "error occured", issue: error });
    }
  }
});

export { handshake, connectDb, tableInfo, databaseScan, tableScan };
