import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { authMiddleware } from "./middleware/authMiddleware";
import { errorHandler, notFoundHandler } from "./lib/errors";
import tenantRoutes from "./routes/tenantRoutes";
import managerRoutes from "./routes/managerRoutes";
import propertyRoutes from "./routes/propertyRoutes";
import leaseRoutes from "./routes/leaseRoutes";
import applicationRoutes from "./routes/applicationRoutes";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

/**
 * CORS_ORIGIN is a comma-separated allowlist of browser origins, e.g.
 * "https://rentiful.example.com,http://localhost:3000". When unset the API
 * reflects any origin, which is fine for local development only.
 */
const allowedOrigins = process.env.CORS_ORIGIN?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && !allowedOrigins?.length) {
  console.warn("CORS_ORIGIN is not set; the API will accept requests from any origin.");
}

/** The configured Express app, without a listening socket, so tests can import it. */
export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: allowedOrigins?.length ? allowedOrigins : true }));
if (!isTest) {
  app.use(morgan(isProduction ? "combined" : "dev"));
}
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

/* ROUTES */
app.get("/", (_req, res) => {
  res.json({ name: "Rentiful API", status: "ok" });
});
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/applications", applicationRoutes);
app.use("/properties", propertyRoutes);
app.use("/leases", leaseRoutes);
app.use("/tenants", authMiddleware(["tenant"]), tenantRoutes);
app.use("/managers", authMiddleware(["manager"]), managerRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
