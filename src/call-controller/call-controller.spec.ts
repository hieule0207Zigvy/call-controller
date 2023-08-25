import { Test, TestingModule } from '@nestjs/testing';
import { CallController } from './call-controller.service';

describe('CallController', () => {
  let provider: CallController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CallController],
    }).compile();

    provider = module.get<CallController>(CallController);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
