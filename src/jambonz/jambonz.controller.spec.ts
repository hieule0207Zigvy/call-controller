import { Test, TestingModule } from '@nestjs/testing';
import { JambonzController } from './jambonz.controller';

describe('JambonzController', () => {
  let controller: JambonzController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JambonzController],
    }).compile();

    controller = module.get<JambonzController>(JambonzController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
