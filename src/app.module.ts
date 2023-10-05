import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { CallControllerModule } from "./call-controller/call-controller.module";
import { CacheModule } from "@nestjs/cache-manager";
import { JambonzModule } from './jambonz/jambonz.module';
import * as redisStore from "cache-manager-redis-store";

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
      store: redisStore as any,
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    }),
    CallControllerModule,
    JambonzModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
