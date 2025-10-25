import express from "express";
import {
  handshake,
  connectDb,
  tableInfo,
  databaseScan,
} from "../controllers/userControllers.js";

const router = express.Router();

router.post("/initialHandshake", handshake);
router.post("/connectDb", connectDb);
router.post("/tableInfo", tableInfo);
router.post("/scanDb" , databaseScan);

export default router;
