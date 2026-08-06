import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { serverConfig, transmissionConfig } from "./config";
import { TransmissionClient } from "./transmissionClient";
import { buildRouter } from "./routes";
import { loadOpenApiSpec } from "./swagger";

const app = express();
const client = new TransmissionClient(transmissionConfig);

app.use(cors());
// Raised limit to comfortably fit base64-encoded .torrent files.
app.use(express.json({ limit: "10mb" }));

// Swagger UI + raw OpenAPI JSON, served openly (before the API key check)
// so the docs page itself is browsable even when API_KEY is set. Requests
// made from the "Try it out" button still hit the auth middleware below.
const openApiSpec = loadOpenApiSpec();
app.get("/openapi.json", (_req, res) => res.json(openApiSpec));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

// Optional shared-secret auth for this wrapper API itself (separate from
// Transmission's own RPC username/password). Set API_KEY to enable it.
if (serverConfig.apiKey) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.header("x-api-key") !== serverConfig.apiKey) {
      res.status(401).json({ error: "Invalid or missing X-API-Key header" });
      return;
    }
    next();
  });
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/", buildRouter(client));

app.listen(serverConfig.port, () => {
  console.log(`transmission-api listening on port ${serverConfig.port}`);
  console.log(
    `-> proxying Transmission at ${transmissionConfig.protocol}://${transmissionConfig.host}:${transmissionConfig.port}${transmissionConfig.path}`
  );
});