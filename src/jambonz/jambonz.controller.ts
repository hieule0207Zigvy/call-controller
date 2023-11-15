import { Controller, Get } from "@nestjs/common";
import { JambonzService } from "./jambonz.service";

@Controller("jambonz")
export class JambonzController {
  constructor(private jambonzService: JambonzService) {}

  @Get()
  async test(): Promise<any> {
    // const response = await this.jambonzService.registerPhoneNumber({ number: "+16161998349", voip_carrier_sid: "03125a29-8ca2-4d0c-86de-ebc3fe5f57a3" });
    const response = await this.jambonzService.createTwilioVoidCarrier({
      trunkData: "pbx-3404f9ed-3775-436a-b6a3-a79b80d658a2.pstn.twilio.com",
      email: "test20@gmail.com",
      username: "d08a479c30f13b7a1e8ebd193ea79276",
    });
    return true;
  }
}
