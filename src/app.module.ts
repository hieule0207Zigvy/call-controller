import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CallControllerModule } from './call-controller/call-controller.module';

@Module({
  imports: [CallControllerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
