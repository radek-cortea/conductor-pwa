import { writeFile } from "node:fs/promises";

const url = "https://api.conductor.build/v0/openapi.json";
const response = await fetch(url);
if (!response.ok) {
  throw new Error(`Could not download the OpenAPI document (${response.status}).`);
}
const text = await response.text();
JSON.parse(text);
await writeFile(new URL("../openapi/conductor.json", import.meta.url), text);
console.log(`Pinned ${url}`);
