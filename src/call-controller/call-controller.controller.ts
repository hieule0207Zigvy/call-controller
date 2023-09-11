import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
const WebhookResponse = require("@jambonz/node-client").WebhookResponse;
const jambonz = require("@jambonz/node-client");
const axios = require("axios");

type UpdateConferenceOption = {
  conf_hold_status?: string;
  conf_mute_status?: string;
  wait_hook?: string;
};

@Controller("call-controller")
export class CallControllerController {
  @Get()
  test(): string {
    return "Call controller";
  }

  @Post("voicemail")
  voiceMail(@Req() req: Request, @Res() res: Response): any {
    const { body } = req;
    console.log("🚀 ~ file: call-controller.controller.ts:14 ~ CallControllerController ~ helloWorld ~ body:", body);
    const text = `<speak>
    Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.
    </speak>`;
    const app = new WebhookResponse();
    app.say({ text });
    res.status(200).json(app);
  }

  @Post("caller-create-conference")
  async callerCreateConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const client = jambonz(process.env.JAMBONZ_ACCOUNT_SID, process.env.JAMBONZ_API_KEY, {
        baseUrl: process.env.JAMBONZ_REST_API_BASE_URL,
      });
      // console.log("🚀 ~ file: call-controller.controller.ts:76 ~ CallControllerController ~ callerCreateConference ~ req.body:", req.body);
      const app = new WebhookResponse();
      // record function call
      app.config({
        listen: {
          url: `${process.env.WEBSOCKET_URL}${process.env.WS_RECORD_PATH}`,
          mixType: "stereo",
          enable: true,
          // actionHook: "/call-controller/listen-hook",
        },
      });
      // end record
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
        // direct invite customer to join the conference
      // const log = await client.calls.create({
      //   from: "16164413854",
      //   to: {
      //     type: "user",
      //     name: "test8sub@voice.chatchilladev.sip.jambonz.cloud",
      //   },
      //   call_hook: {
      //     url: `${process.env.BACKEND_URL}/call-controller/customer-join-conference`,
      //     method: "POST",
      //   },
      //   call_status_hook: {
      //     url: `${process.env.BACKEND_URL}/call-controller/call-status`,
      //     method: "POST",
      //   },
      //   speech_synthesis_vendor: "google",
      //   speech_synthesis_language: "en-US",
      //   speech_synthesis_voice: "en-US-Standard-C",
      //   speech_recognizer_vendor: "google",
      //   speech_recognizer_language: "en-US",
      // });
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
      const client = jambonz(process.env.JAMBONZ_ACCOUNT_SID, process.env.JAMBONZ_API_KEY, {
        baseUrl: process.env.JAMBONZ_REST_API_BASE_URL,
      });
      // console.log("🚀 ~ file: call-controller.controller.ts:137 ~ CallControllerController ~ dialInviteCustomer ~ client:", client);
      const log = await client.calls.create({
        from: "16164413854",
        to: {
          type: "user",
          name: "test8sub@voice.chatchilladev.sip.jambonz.cloud",
        },
        call_hook: {
          url: `${process.env.BACKEND_URL}/call-controller/customer-join-conference`,
          method: "POST",
        },
        call_status_hook: {
          url: `${process.env.BACKEND_URL}/call-controller/call-status`,
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
  async holdConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    console.log("🚀 ~ file: call-controller.controller.ts:236 ~ CallControllerController ~ holdConference ~ holdConference:");
    try {
      const { conf_hold_status, call_sid } = req.body; // 'hold' or 'unhold'.
      const updateOption: UpdateConferenceOption = {
        conf_hold_status,
      };
      if (conf_hold_status === "hold") {
        updateOption.wait_hook = "/call-controller/conference-hold-hook";
      }
      const response = await axios.put(`${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`, updateOption, {
        headers: {
          Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
        },
      });
      return res.sendStatus(response?.status);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:140 ~ CallControllerController ~ holdConference ~ err:", err);
      return res.sendStatus(503);
    }
  }

  @Post("mute-conference")
  async muteConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { conf_mute_status = "mute", call_sid } = req.body;
      const text = conf_mute_status === "mute" ? "Muted" : "Unmuted";
      const app = new WebhookResponse();
      app.say({ text }).pause({ length: 1.5 });
      res.status(200).json(app);
      const response = await axios.put(
        `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
        { conf_mute_status },
        {
          headers: {
            Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
          },
        },
      );
      return res.sendStatus(response?.status);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:226 ~ CallControllerController ~ muteConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("conference-status")
  conferenceStatus(@Req() req: Request, @Res() res: Response): any {
    // console.log("🚀 ~ file: call-controller.controller.ts:256 ~ CallControllerController ~ conferenceStatus ~ conferenceStatus");
    const { body } = req;
    console.log("🚀 ~ file: call-controller.controller.ts:258 ~ CallControllerController ~ conferenceStatus:", body);
    res.sendStatus(200);
  }

  @Post("conference-hold-hook")
  conferenceHoldHook(@Req() req: Request, @Res() res: Response): any {
    // console.log("🚀 ~ file: call-controller.controller.ts:256 ~ CallControllerController ~ conferenceStatus ~ conferenceStatus");
    const text = `
    You have been placed on brief hold while we try to find a team member to help you.
    We shall search far and wide to find just the right person for you.
    So please do continue to wait just a bit longer, if you would.`;
    const app = new WebhookResponse();
    app.say({ text }).pause({ length: 3 });
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

  @Post("call-status")
  callStatus(@Req() req: Request, @Res() res: Response): any {
    const { body } = req;
    // console.log("🚀 ~ file: call-controller.controller.ts:45 ~ CallControllerController ~ callStatus ~ body:", body);
    res.sendStatus(200);
  }
}
