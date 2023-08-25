import { Module } from '@nestjs/common';
import { CallControllerController } from './call-controller.controller';
import { CallControllerService } from './call-controller.service';

@Module({
  controllers: [CallControllerController],
  providers: [CallControllerService]
})
export class CallControllerModule {}
