import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { getUniqConferenceName } from "src/utils/until";
const WebhookResponse = require("@jambonz/node-client").WebhookResponse;
const jambonz = require("@jambonz/node-client");
const axios = require("axios");

type UpdateConferenceOption = {
  conf_hold_status?: string;
  conf_mute_status?: string;
  wait_hook?: string;
};
const ConferenceType = {
  start: "start",
  leave: "leave",
  join: "join",
  end: "end",
};
const redisConferenceCallingData = {};
@Controller("call-controller")
export class CallControllerController {
  private client: any = jambonz(process.env.JAMBONZ_ACCOUNT_SID, process.env.JAMBONZ_API_KEY, {
    baseUrl: process.env.JAMBONZ_REST_API_BASE_URL,
  });

  @Get()
  test(): string {
    return "Call controller";
  }

  @Post("voicemail")
  voiceMail(@Req() req: Request, @Res() res: Response): any {
    const { body } = req;
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
      const { from } = req.body;
      // create unique name for conference
      const uniqNameConference = getUniqConferenceName();
      const app = new WebhookResponse();
      console.log("🚀 ~ file: call-controller.controller.ts:42 ~ CallControllerController ~ callerCreateConference ~ uniqNameConference:", uniqNameConference);
      // enable recording.
      // app.config({
      //   listen: {
      //     url: `${process.env.WEBSOCKET_URL}${process.env.WS_RECORD_PATH}`,
      //     mixType: "stereo",
      //     enable: true,
      //   },
      // });
      // end record
      app
        .say({
          text: "Hello You are calling to Group ONE, We are calling to all members to of this group",
          synthesizer: {
            vendor: "google",
            language: "en-US",
          },
        })
        .conference({
          name: uniqNameConference,
          statusEvents: [ConferenceType.end, ConferenceType.start, ConferenceType.join, ConferenceType.leave],
          statusHook: "/call-controller/conference-status",
          waitHook: "/call-controller/conference-wait-hook",
          startConferenceOnEnter: true,
          endConferenceOnExit: true,
        });
      // conference created
      res.status(200).json(app);
      redisConferenceCallingData[uniqNameConference] = {
        isOneOfMemberAnswer: false,
      };
      const listMember = [
        {
          type: "user",
          name: "test8sub@voice.chatchilladev.sip.jambonz.cloud",
        },
        {
          type: "user",
          name: "test8@voice.chatchilladev.sip.jambonz.cloud",
        },
      ];
      const listPhoneRinging = [];
      Promise.all(
        listMember.map(async member => {
          const callRingingSid = await this.client.calls.create({
            from: from,
            to: member,
            call_hook: {
              url: `${process.env.BACKEND_URL}/call-controller/person-join-conference/${uniqNameConference}`,
              method: "GET",
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
          listPhoneRinging.push(callRingingSid);
        }),
      )
        .then(values => {
          redisConferenceCallingData[uniqNameConference] = { ...redisConferenceCallingData[uniqNameConference], ...{ listPhoneRinging: listPhoneRinging } };
        })
        .catch(err => {
          console.log("🚀 ~ file: call-controller.controller.ts:85 ~ CallControllerController ~ callerCreateConference ~ err:", err);
          res.sendStatus(503);
        });
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:86 ~ CallControllerController ~ callerCreateConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("agent-join-or-conference")
  async agentJoinOrCreateConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      // Call Api to chatchilla to get name of the conference want to join, if outbound will make new conference.
      const response = {
        isOutBoundCall: true,
        to: {
          type: "phone",
          number: "17147520454",
        },
        uniqNameConference: "",
        from: "16164413854",
      }; //call api
      //case 1: join conference
      const app = new WebhookResponse();
      if (!response?.isOutBoundCall) {
        const { uniqNameConference } = response; // from response;
        app
          .say({
            text: "Your conference will begin when the moderator arrives",
            synthesizer: {
              vendor: "google",
              language: "en-US",
            },
          })
          .conference({
            name: uniqNameConference,
            statusEvents: [ConferenceType.start, ConferenceType.end, ConferenceType.join, ConferenceType.leave],
            statusHook: "/call-controller/conference-status",
          });
        return res.status(200).json(app);
      } else {
        const { to, from } = response;
        const uniqNameConference = getUniqConferenceName();
        console.log("🚀 ~ file: call-controller.controller.ts:151 ~ CallControllerController ~ agentJoinOrCreateConference ~ uniqNameConference:", uniqNameConference);
        app
          .say({
            text: "we will now begin the conference",
            synthesizer: {
              vendor: "google",
              language: "en-US",
            },
          })
          .conference({
            name: uniqNameConference,
            statusEvents: [ConferenceType.start, ConferenceType.end, ConferenceType.join, ConferenceType.leave],
            statusHook: "/call-controller/conference-status",
            startConferenceOnEnter: true,
            endConferenceOnExit: true,
          }); // conference created.
        res.status(200).json(app);
        await this.client.calls.create({
          from,
          to,
          call_hook: {
            url: `${process.env.BACKEND_URL}/call-controller/person-join-conference/${uniqNameConference}`,
            method: "GET",
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
      }
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:86 ~ CallControllerController ~ agentJoinOrCreateConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("make-invite-conference")
  async makeInviteConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    // console.log("🚀 ~ file: call-controller.controller.ts:134 ~ CallControllerController ~ dialInviteCustomer ~ req:", req.body);
    try {
      const {
        from = "16164413854",
        uniqNameConference,
        to = {
          type: "user",
          name: "test8sub@voice.chatchilladev.sip.jambonz.cloud",
        },
      } = req.body;
      const log = await this.client.calls.create({
        from,
        to,
        call_hook: {
          url: `${process.env.BACKEND_URL}/call-controller/person-join-conference/${uniqNameConference}`,
          method: "GET",
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

  @Get("person-join-conference/:conferenceName")
  personJoinConference(@Req() req: Request, @Res() res: Response): any {
    try {
      const { conferenceName } = req.params;
      const app = new WebhookResponse();
      // create unique name for conference
      app.conference({
        name: conferenceName,
        statusEvents: [ConferenceType.start, ConferenceType.end, ConferenceType.join, ConferenceType.leave],
        statusHook: "/call-controller/conference-status",
      });
      redisConferenceCallingData[conferenceName].isOneOfMemberAnswer = true;
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
  async conferenceStatus(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      // console.log("🚀 ~ file: call-controller.controller.ts:256 ~ CallControllerController ~ conferenceStatus ~ conferenceStatus");
      const { body } = req;
      const { conference_sid, event, members, friendly_name, call_sid } = body;
      console.log("🚀 ~ file: call-controller.controller.ts:258 ~ CallControllerController ~ conferenceStatus:", body);

      if (event === ConferenceType.start) {
        const response = await axios.put(
          `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
          { call_hook: `${process.env.BACKEND_URL}/call-controller/conference-wait-hook?conferenceName=${friendly_name}&callSid=${call_sid}` },
          {
            headers: {
              Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
            },
          },
        );
      }
      if (event === ConferenceType.join && members > 1) {
        const { listPhoneRinging = [] } = redisConferenceCallingData[friendly_name];
        const filterAcceptCallSid = listPhoneRinging.filter((ringingCall: string) => ringingCall !== call_sid);
        Promise.all(
          filterAcceptCallSid.map(async (call: string) => {
            await axios.put(
              `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call}`,
              { call_status: "no-answer" },
              {
                headers: {
                  Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
                },
              },
            );
          }),
        );
      }
      res.sendStatus(200);
    } catch (error) {
      console.log("🚀 ~ file: call-controller.controller.ts:362 ~ CallControllerController ~ conferenceStatus ~ error:", error);
      res.sendStatus(503);
    }
  }

  @Post("conference-hold-hook")
  conferenceHoldHook(@Req() req: Request, @Res() res: Response): any {
    // console.log("🚀 ~ file: call-controller.controller.ts:256 ~ CallControllerController ~ conferenceStatus ~ conferenceStatus");
    const text = `
    You have been placed on brief hold while we try to find a team member to help you.
    We shall search far and wide to find just the right person for you.
    So please do continue to wait just a bit longer, if you would.`;
    const app = new WebhookResponse();
    app.say({ text });
    res.status(200).json(app);
  }

  @Post("call-status")
  callStatus(@Req() req: Request, @Res() res: Response): any {
    const { body } = req;
    // console.log("🚀 ~ file: call-controller.controller.ts:45 ~ CallControllerController ~ callStatus ~ body:", body);
    res.sendStatus(200);
  }

  @Post("conference-wait-hook")
  conferenceWaitHook(@Req() req: Request, @Res() res: Response): any {
    const conferenceName: any = req.query.conferenceName;
    const callSid = req.query.callSid;
    setTimeout(async () => {
      const { isOneOfMemberAnswer } = redisConferenceCallingData[conferenceName];
      if (!isOneOfMemberAnswer) {
        console.log("🚀 ~ file: call-controller.controller.ts:371 ~ CallControllerController ~ setTimeout ~ isOneOfMemberAnswer:", isOneOfMemberAnswer);
        const app = new WebhookResponse();
        app.say({
          text: "No one pickup the phone, the call will be hang up automatically",
          synthesizer: {
            vendor: "google",
            language: "en-US",
          },
        });
        res.status(200).json(app);
      }
    }, 20000);
  }
}
