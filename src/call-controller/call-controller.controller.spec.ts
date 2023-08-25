import { Test, TestingModule } from '@nestjs/testing';
import { CallControllerController } from './call-controller.controller';

describe('CallControllerController', () => {
  let controller: CallControllerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CallControllerController],
    }).compile();

    controller = module.get<CallControllerController>(CallControllerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
