import fs from "fs";
import path from "path";
import yaml from "js-yaml";

/**
 * Loads the OpenAPI spec from openapi.yaml at the project root.
 * Read once at startup and reused for every /docs request.
 */
export function loadOpenApiSpec(): Record<string, unknown> {
  const specPath = path.join(__dirname, "..", "openapi.yaml");
  const raw = fs.readFileSync(specPath, "utf8");
  return yaml.load(raw) as Record<string, unknown>;
}