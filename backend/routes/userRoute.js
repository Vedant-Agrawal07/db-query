import express from "express";
import {
  handshake,
  connectDb,
  tableInfo,
  databaseScan,
  tableScan,
} from "../controllers/userControllers.js";
import { askAi, getSchema } from "../controllers/queryController.js";

const router = express.Router();

router.post("/initialHandshake/:db", handshake);
router.post("/connectDb/:db", connectDb);
router.post("/tableInfo/:db", tableInfo);
router.post("/scanDb/:db", databaseScan);
router.post("/scanTable/:db", tableScan);
router.post("/ask-ai/:db", askAi);
router.post("/schema/:db", getSchema);

export default router;

