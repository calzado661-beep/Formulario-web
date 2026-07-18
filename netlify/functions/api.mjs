import { Readable } from "node:stream";
import { handleRequest } from "../../server.mjs";

function requestUrl(event) {
  if (event.rawUrl) {
    const url = new URL(event.rawUrl);
    return `${url.pathname}${url.search}`;
  }
  const params = new URLSearchParams(event.multiValueQueryStringParameters || event.queryStringParameters || {});
  const query = params.toString();
  return `${event.path || "/api"}${query ? `?${query}` : ""}`;
}

export async function handler(event) {
  const request = Readable.from(event.body ? [Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")] : []);
  request.method = event.httpMethod || "GET";
  request.url = requestUrl(event);
  request.headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value])
  );
  request.headers.host ||= "netlify.local";

  return new Promise((resolve) => {
    let statusCode = 200;
    let headers = {};
    const response = {
      writeHead(status, nextHeaders = {}) {
        statusCode = status;
        headers = { ...headers, ...nextHeaders };
      },
      end(body = "") {
        resolve({ statusCode, headers, body: Buffer.isBuffer(body) ? body.toString("utf8") : String(body) });
      }
    };

    handleRequest(request, response, { serveFiles: false }).catch((error) => {
      resolve({
        statusCode: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: error.message || "Error interno del backend." })
      });
    });
  });
}
