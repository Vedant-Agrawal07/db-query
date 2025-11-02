import express from "express";
import {
  handshake,
  connectDb,
  tableInfo,
  databaseScan,
  tableScan,
} from "../controllers/userControllers.js";

const router = express.Router();

router.post("/initialHandshake/:db", handshake);
router.post("/connectDb/:db", connectDb);
router.post("/tableInfo/:db", tableInfo);
router.post("/scanDb/:db", databaseScan);
router.post("/scanTable/:db", tableScan);

export default router;
