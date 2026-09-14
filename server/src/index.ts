// Load env before anything that reads process.env at import time (auth middleware).
import "dotenv/config";
import { app } from "./app";

const port = Number(process.env.PORT) || 3002;

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
