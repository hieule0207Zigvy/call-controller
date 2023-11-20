import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import { JambonzService } from "./jambonz.service";
import { Request, Response } from "express";

@Controller("jambonz")
export class JambonzController {
  constructor(private jambonzService: JambonzService) {}

  @Get()
  async test(@Req() req: Request, @Res() res: Response): Promise<any> {
    // const response = await this.jambonzService.registerPhoneNumber({ number: "+16161998349", voip_carrier_sid: "03125a29-8ca2-4d0c-86de-ebc3fe5f57a3" });
    return res.status(200).json({ msg: "OK" });
  }

  @Post()
  async createVoipCarrier(@Req() req: Request, @Res() res: Response): Promise<any> {
    // const response = await this.jambonzService.registerPhoneNumber({ number: "+16161998349", voip_carrier_sid: "03125a29-8ca2-4d0c-86de-ebc3fe5f57a3" });
    const { trunkDomain, username } = req.body;
    if (!trunkDomain || !username) return res.status(400).json({ msg: "payload error for createVoipCarrier" });
    const newCarrierSid = await this.jambonzService.createTwilioVoidCarrier({ trunkDomain, username });
    if (!newCarrierSid) return res.status(500).json({ msg: "Failed to createVoipCarrier" });
    return res.status(200).json({ newCarrierSid });
  }

  @Post("create-sip-account")
  async createSipClient(@Req() req: Request, @Res() res: Response): Promise<any> {
    // const response = await this.jambonzService.registerPhoneNumber({ number: "+16161998349", voip_carrier_sid: "03125a29-8ca2-4d0c-86de-ebc3fe5f57a3" });
    const { email } = req.body;
    if (!email) return res.status(400).json({ msg: "payload error for createSipClient" });
    const isCreated = await this.jambonzService.createSipAccount({ email });
    if (!isCreated) return res.status(500).json({ msg: "Failed to createSipClient" });
    return res.status(200).json({ isCreated });
  }

  @Post("assign-phone-number")
  async assignPhoneNumber(@Req() req: Request, @Res() res: Response): Promise<any> {
    // const response = await this.jambonzService.registerPhoneNumber({ number: "+16161998349", voip_carrier_sid: "03125a29-8ca2-4d0c-86de-ebc3fe5f57a3" });
    const { number, voip_carrier_sid } = req.body;
    if (!number || !voip_carrier_sid) return res.status(400).json({ msg: "payload error for assignPhoneNumber" });
    const isCreated = await this.jambonzService.registerPhoneNumber({ number, voip_carrier_sid });
    if (!isCreated) return res.status(500).json({ msg: "Failed to assignPhoneNumber" });
    return res.status(200).json({ isCreated });
  }
}
