import express from "express";
import dotenv from 'dotenv'
const app = express();
dotenv.config();

app.get("/", (req, res) => {
  res.send("api success");
});

const PORT = 8125 || process.env.PORT;
app.listen(PORT, () => {
  console.log(`server running at PORT ${PORT}`);
});
