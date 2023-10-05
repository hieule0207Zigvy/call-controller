import { Test, TestingModule } from '@nestjs/testing';
import { JambonzService } from './jambonz.service';

describe('JambonzService', () => {
  let service: JambonzService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JambonzService],
    }).compile();

    service = module.get<JambonzService>(JambonzService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
