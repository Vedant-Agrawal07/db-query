import express from "express";
import userRoutes from "./routes/userRoutes.js";
import "./config/env.js";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("api success");
});

app.use("/api/user", userRoutes);

const PORT = 8125 || process.env.PORT;
app.listen(PORT, () => {
  console.log(`server running at PORT ${PORT}`);
});
