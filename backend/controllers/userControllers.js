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

import crypto from "crypto";

const handshake = expressAsyncHandler(async (req, res) => {
  const { host, user, password, uri } = req.body;
  // "uri" will be empty for db mySql and postgres
  const { db } = req.params;
  if (db === "mongoDb") {
    try {
      res.status(201).json(await initalConnectMongo(uri));
      return;
    } catch (error) {
      res.status(400).json({ message: "error occured", issue: error });
      return;
    }
  } else if (db === "mySql") {
    try {
      res.status(201).json(await initalConnect(host, user, password));
      return;
    } catch (error) {
      res.status(400).json({ message: "error occured", issue: error });
      return;
    }
  }
});

const connectDb = expressAsyncHandler(async (req, res) => {
  const { host, user, password, database, uri } = req.body;
  const { db } = req.params;
  if (db === "mongoDb") {
    // here uri , database will be used
    try {
      const { client, collections } = await dbPoolMongo(uri, database);
      const clientId = crypto.randomUUID();
      userPool.set(clientId, client);
      console.log(client);
      res.status(201).json({ threadId: clientId, tables: collections });
    } catch (error) {
      res.status(400).json({ message: "error occured", issue: error });
    }
  } else if (db === "mySql") {
    try {
      const { pool, tables } = await dbPool(host, user, password, database);
      const poolId = crypto.randomUUID();
      userPool.set(poolId, pool);
      // console.log(pool);
      res.status(201).json({ threadId: poolId, tables: tables });
    } catch (error) {
      res.status(400).json({ message: "error occured", issue: error });
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
  }
});

export { handshake, connectDb, tableInfo, databaseScan, tableScan };
