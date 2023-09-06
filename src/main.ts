import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
const { WebhookResponse } = require("@jambonz/node-client");
import { recordAudio } from "./utils/recordUtils";
import WebSocket, { WebSocketServer } from "ws";
import 'dotenv/config'

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const opts = Object.assign({
    timestamp: () => `, "time": "${new Date().toISOString()}"`,
    level: process.env.LOGLEVEL || "info",
  });
  const logger = require("pino")(opts);
  const port = process.env.HTTP_PORT || 3060;

  const server = await app.listen(port, () => {
    console.log("🚀 app listen at ~ port:", port);
  });

  const wsServer = new WebSocketServer({ noServer: true });
  wsServer.setMaxListeners(0);
  wsServer.on("connection", recordAudio.bind(null, logger));
  server.on("upgrade", (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head, socket => {
      if (request.url !== process.env.WS_RECORD_PATH) return socket.close(1000, "Connection closed");
      wsServer.emit("connection", socket, request);
    });
  });
}
bootstrap();
