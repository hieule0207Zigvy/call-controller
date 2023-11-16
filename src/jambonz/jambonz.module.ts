import { Module } from '@nestjs/common';
import { JambonzController } from './jambonz.controller';
import { JambonzService } from './jambonz.service';

@Module({
  controllers: [JambonzController],
  providers: [JambonzService]
})
export class JambonzModule {}
