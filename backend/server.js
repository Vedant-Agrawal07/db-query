import express from "express";
import dotenv from "dotenv";
import userRoute from "./routes/userRoute.js";
const app = express();
app.use(express.json());
dotenv.config();

app.get("/", (req, res) => {
  res.send("api success");
});

app.use("/api/user", userRoute);

const PORT = 8125 || process.env.PORT;
app.listen(PORT, () => {
  console.log(`server running at PORT ${PORT}`);
});
