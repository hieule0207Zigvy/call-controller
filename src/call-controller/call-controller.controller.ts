import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
const WebhookResponse = require("@jambonz/node-client").WebhookResponse;
const jambonz = require("@jambonz/node-client");
const axios = require("axios");

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
            name: "test8sub@voice.chatchilladev.sip.jambonz.cloud",
          },
          {
            type: "user",
            name: "test8@voice.chatchilladev.sip.jambonz.cloud",
          },
        ],
      });
      res.status(200).json(app);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:68 ~ CallControllerController ~ dialCome ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("caller-create-conference")
  callerCreateConference(@Req() req: Request, @Res() res: Response): any {
    try {
      const { outDialNumber = "17147520454", callerId = "+16164413854" } = req.body;
      // console.log("🚀 ~ file: call-controller.controller.ts:76 ~ CallControllerController ~ callerCreateConference ~ req.body:", req.body);
      const app = new WebhookResponse();
      app.pause({ length: 2 });
      app
        .say({
          text: "we will now begin the conference",
          synthesizer: {
            vendor: "google",
            language: "en-US",
          },
        })
        .conference({
          name: process.env.CONFERENCE_NAME || "test-conf",
          statusEvents: ["start", "end", "join", "leave"],
          statusHook: "/call-controller/conference-status",
          startConferenceOnEnter: true,
          endConferenceOnExit: true,
        });
      res.status(200).json(app);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:86 ~ CallControllerController ~ callerCreateConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("callee-join-conference")
  calleeJoinConference(@Req() req: Request, @Res() res: Response): any {
    try {
      const { outDialNumber = "17147520454", callerId = "+16164413854" } = req.body;
      // console.log("🚀 ~ file: call-controller.controller.ts:95 ~ CallControllerController ~ calleeJoinConference ~ req.body:", req.body);
      const app = new WebhookResponse();
      app.pause({ length: 2 });
      app
        .say({
          text: "Your conference will begin when the moderator arrives",
          synthesizer: {
            vendor: "google",
            language: "en-US",
          },
        })
        .conference({
          name: process.env.CONFERENCE_NAME || "test-conf",
          statusEvents: ["start", "end", "join", "leave"],
          statusHook: "/call-controller/conference-status",
          startConferenceOnEnter: false,
          endConferenceOnExit: false,
        });
      res.status(200).json(app);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:86 ~ CallControllerController ~ callerCreateConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("dial-invite-customer")
  async dialInviteCustomer(@Req() req: Request, @Res() res: Response): Promise<any> {
    // console.log("🚀 ~ file: call-controller.controller.ts:134 ~ CallControllerController ~ dialInviteCustomer ~ req:", req.body);
    try {
      const client = jambonz("fbbbcf97-139e-4b99-81c5-58f482a42bf2", "599a2ea1-8d33-4ce7-ab9b-9e193c59beda", {
        baseUrl: "https://jambonz.cloud/api/v1",
      });
      // console.log("🚀 ~ file: call-controller.controller.ts:137 ~ CallControllerController ~ dialInviteCustomer ~ client:", client);
      const log = await client.calls.create({
        from: "16164413854",
        to: {
          type: "user",
          name: "test8sub@voice.chatchilladev.sip.jambonz.cloud",
        },
        call_hook: {
          url: `https://e443-115-73-208-186.ngrok-free.app/call-controller/customer-join-conference`,
          method: "POST",
        },
        call_status_hook: {
          url: `https://e443-115-73-208-186.ngrok-free.app/call-controller/call-status`,
          method: "POST",
        },
        speech_synthesis_vendor: "google",
        speech_synthesis_language: "en-US",
        speech_synthesis_voice: "en-US-Standard-C",
        speech_recognizer_vendor: "google",
        speech_recognizer_language: "en-US",
      });
      return log;
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:151 ~ CallControllerController ~ dialInviteCustomer ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("customer-join-conference")
  customerJoinConference(@Req() req: Request, @Res() res: Response): any {
    try {
      const { outDialNumber = "17147520454", callerId = "+16164413854" } = req.body;
      const app = new WebhookResponse();
      app.pause({ length: 2 });
      app
        .say({
          text: "Your has been invite to this conference",
          synthesizer: {
            vendor: "google",
            language: "en-US",
          },
        })
        .conference({
          name: process.env.CONFERENCE_NAME || "test-conf",
          statusEvents: ["start", "end", "join", "leave"],
          statusHook: "/call-controller/conference-status",
          startConferenceOnEnter: false,
          endConferenceOnExit: false,
        });
      res.status(200).json(app);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:86 ~ CallControllerController ~ callerCreateConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("hold-conference")
  holdConference(@Req() req: Request, @Res() res: Response): any {
    try {
      const text = `
  You have been placed on brief hold while we try to find a team member to help you.
  We shall search far and wide to find just the right person for you.
  So please do continue to wait just a bit longer, if you would.`;
      const { length = 10 } = req.body;
      console.log("🚀 ~ file: call-controller.controller.ts:136 ~ CallControllerController ~ holdConference ~ req.body:", req.body);
      const app = new WebhookResponse();
      app.say({ text }).pause({ length });
      res.status(200).json(app);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:140 ~ CallControllerController ~ holdConference ~ err:", err);
      res.sendStatus(503);
    }
  }
  @Post("mute-conference")
  async muteConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      // const client = jambonz("fbbbcf97-139e-4b99-81c5-58f482a42bf2", "599a2ea1-8d33-4ce7-ab9b-9e193c59beda", {
      //   baseUrl: "https://jambonz.cloud/api/v1",
      // });
      const { conf_mute_status = "mute", call_sid } = req.body;
      console.log("🚀 ~ file: call-controller.controller.ts:219 ~ CallControllerController ~ muteConference ~ req.body:", req.body);
      const text = conf_mute_status === "mute" ? "Muted" : "Unmuted";
      const app = new WebhookResponse();
      app.say({ text }).pause({ length: 1.5 });
      res.status(200).json(app);
      // const log = await client.calls.update(call_sid, {conf_mute_status: 'mute'});
      const response = await axios.put(
        `https://jambonz.cloud/api/v1/Accounts/fbbbcf97-139e-4b99-81c5-58f482a42bf2/Calls/${call_sid}`,
        {conf_mute_status},
        {
          headers: {
            Authorization: `Bearer 599a2ea1-8d33-4ce7-ab9b-9e193c59beda`,
          },
        }
      );
  
      console.log('Call update successfully:', response.data);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:226 ~ CallControllerController ~ muteConference ~ err:", err);
      res.sendStatus(503);
    }
  }
  @Post("mute-call")
  async muteCall(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const client = jambonz("fbbbcf97-139e-4b99-81c5-58f482a42bf2", "599a2ea1-8d33-4ce7-ab9b-9e193c59beda", {
        baseUrl: "https://jambonz.cloud/api/v1",
      });
      const { mute_status = false, call_sid } = req.body;
      const text = mute_status ? "Muted" : "Unmuted";
      const app = new WebhookResponse();
      app.say({ text }).pause({ length: 1.5 });
      res.status(200).json(app);
      const log = await client.calls.update(call_sid, { mute_status });
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:226 ~ CallControllerController ~ muteConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("call-status")
  callStatus(@Req() req: Request, @Res() res: Response): any {
    const { body } = req;
    // console.log("🚀 ~ file: call-controller.controller.ts:45 ~ CallControllerController ~ callStatus ~ body:", body);
    res.sendStatus(200);
  }

  @Post("conference-status")
  conferenceStatus(@Req() req: Request, @Res() res: Response): any {
    console.log("🚀 ~ file: call-controller.controller.ts:256 ~ CallControllerController ~ conferenceStatus ~ conferenceStatus");
    const { body } = req;
    console.log("🚀 ~ file: call-controller.controller.ts:258 ~ CallControllerController ~ conferenceStatus ~ body:", body);
    res.sendStatus(200);
  }
}
