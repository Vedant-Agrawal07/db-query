import expressAsyncHandler from "express-async-handler";
import { initalConnect, dbPool, fetchTableData, scanDb } from "../db/mysqlConnector";
import userPool from "../poolStore";

const handshake = expressAsyncHandler(async (req, res) => {
  const { host, user, password } = req.body;
  try {
    res.status(201).json(await initalConnect(host, user, password));
  } catch (error) {
    res.status(400).json({ message: "error occured", issue: error });
  }
});

const connectDb = expressAsyncHandler(async (req, res) => {
  const { host, user, password, database } = req.body;
  try {
    const { pool, tables } = await dbPool(host, user, password, database);
    userPool.set(pool.threadId, pool);
    res.status(201).json({ threadId: pool.threadId, tables: tables });
  } catch (error) {
    res.status(400).json({ message: "error occured", issue: error });
  }
});

const tableInfo = expressAsyncHandler(async (req, res) => {
  const { poolId, tableName } = req.body;
  const pool = userPool.get(poolId);
  const {rows, columns} = await fetchTableData(tableName, pool);
  try {
    res.status(201).json({
      rowData: rows,
      columnData: columns,
    });
  } catch (error) {
    res.status(400).json({ message: "error occured", issue: error });
  }
});

const databaseScan = expressAsyncHandler(async(req,res)=>{
const {poolId} = req.body;
const pool = userPool.get(poolId);
// const {databases} = await scanDb(pool);
 try {
   res.status(201).json(await scanDb(pool));
 } catch (error) {
   res.status(400).json({ message: "error occured", issue: error });
 }
})

export { handshake, connectDb, tableInfo, databaseScan };
