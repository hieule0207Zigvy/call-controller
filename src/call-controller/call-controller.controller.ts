import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
const WebhookResponse = require("@jambonz/node-client").WebhookResponse;

@Controller("call-controller")
export class CallControllerController {
  @Get()
  test(): string {
    return "Call controller";
  }
  @Post("hello-world")
  helloWorld(@Req() req: Request, @Res() res: Response): any {
    const { body } = req;
    console.log("🚀 ~ file: call-controller.controller.ts:14 ~ CallControllerController ~ helloWorld ~ body:", body);
    const text = `<speak>
    Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.
    </speak>`;
    const app = new WebhookResponse();
    app.say({ text });
    res.status(200).json(app);
  }

  @Post("dial")
  dial(@Req() req: Request, @Res() res: Response): any {
    try {
      const app = new WebhookResponse();
      const { outDialNumber = "17147520454", callerId = "+16164413854" } = req.body;
      console.log("🚀 ~ file: call-controller.controller.ts:26 ~ CallControllerController ~ dial ~ req.body:", req.body);
      app.dial({
        answerOnBridge: true,
        callerId,
        target: [
          {
            type: "phone",
            number: outDialNumber,
          },
        ],
      });
      res.status(200).json(app);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:28 ~ CallControllerController ~ dial ~ err:", err);
      res.sendStatus(503);
    }
  }
  @Post("dial-come")
  dialCome(@Req() req: Request, @Res() res: Response): any {
    try {
      const app = new WebhookResponse();
      const { outDialNumber = "17147520454", callerId = "+16164413854" } = req.body;
      console.log("🚀 ~ file: call-controller.controller.ts:26 ~ CallControllerController ~ dial ~ req.body:", req.body);
      app.dial({
        answerOnBridge: true,
        callerId: req.body.from,
        target: [
            {
              type: "user",
              name: 'test8@voice.chatchilladev.sip.jambonz.cloud',
            },
          ],
      });
      res.status(200).json(app);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:28 ~ CallControllerController ~ dial ~ err:", err);
      res.sendStatus(503);
    }
  }
  @Post("call-status")
  callStatus(@Req() req: Request, @Res() res: Response): any {
    const { body } = req;
    console.log("🚀 ~ file: call-controller.controller.ts:45 ~ CallControllerController ~ callStatus ~ body:", body);
    res.sendStatus(200);
  }
}
