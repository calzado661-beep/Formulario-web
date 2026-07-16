import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = [];
let closing = false;

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function startNode(args, label) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });
  children.push(child);
  child.once("exit", (code) => {
    if (!closing && code) {
      console.error(`${label} termino con codigo ${code}.`);
      shutdown(code);
    }
  });
  return child;
}

function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  children.forEach((child) => {
    if (!child.killed) child.kill();
  });
  setTimeout(() => process.exit(code), 100);
}

if (!(await portIsOpen(5180))) {
  startNode(["server.mjs"], "Backend");
} else {
  console.log("Backend disponible en http://127.0.0.1:5180");
}

startNode(["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], "Vite");

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
