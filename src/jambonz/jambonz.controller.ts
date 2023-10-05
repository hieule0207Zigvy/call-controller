import { Controller, Get } from "@nestjs/common";
import { JambonzService } from "./jambonz.service";

@Controller("jambonz")
export class JambonzController {
  constructor(private jambonzService: JambonzService) {}

  @Get()
  async test(): Promise<any> {
    const response = await this.jambonzService.registerPhoneNumber({ number: "+16161998349", voip_carrier_sid: "03125a29-8ca2-4d0c-86de-ebc3fe5f57a3" });
    console.log("🚀 ~ file: jambonz.controller.ts:11 ~ JambonzController ~ test ~ response:", response);
    return true;
  }
}
