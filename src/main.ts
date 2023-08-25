import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
const {WebhookResponse} = require('@jambonz/node-client');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const opts = Object.assign({
    timestamp: () => `, "time": "${new Date().toISOString()}"`,
    level: process.env.LOGLEVEL || 'info'
  });
  const logger = require('pino')(opts);
  const port = process.env.HTTP_PORT || 3060;
  await app.listen(port);
}
bootstrap();
