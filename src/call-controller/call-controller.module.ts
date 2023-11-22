import { Module } from '@nestjs/common';
import { CallControllerController } from './call-controller.controller';
import { CallControllerService } from './call-controller.service';
import { JambonzService } from 'src/jambonz/jambonz.service';

@Module({
  controllers: [CallControllerController],
  providers: [CallControllerService, JambonzService]
})
export class CallControllerModule {}
