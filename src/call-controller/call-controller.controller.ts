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
const redisConferenceCallingData = {};
@Controller("call-controller")
export class CallControllerController {
  private jambonz: any = new WebhookResponse();
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
    console.log("🚀 ~ file: call-controller.controller.ts:14 ~ CallControllerController ~ helloWorld ~ body:", body);
    const text = `<speak>
    Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.
    </speak>`;
    this.jambonz.say({ text });
    const app = this.jambonz;
    res.status(200).json(app);
  }

  @Post("caller-create-conference")
  async callerCreateConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { from } = req.body;
      // create unique name for conference
      const uniqNameConference = getUniqConferenceName();
      console.log("🚀 ~ file: call-controller.controller.ts:42 ~ CallControllerController ~ callerCreateConference ~ uniqNameConference:", uniqNameConference);
      // enable recording.
      // this.jambonz.config({
      //   listen: {
      //     url: `${process.env.WEBSOCKET_URL}${process.env.WS_RECORD_PATH}`,
      //     mixType: "stereo",
      //     enable: true,
      //   },
      // });
      // end record
      this.jambonz
        .say({
          text: "Hello You are calling to Group ONE, We are calling to all members to of this group. If no one pickup the phone in next 60 seconds, the call will be hang up automatically",
          synthesizer: {
            vendor: "google",
            language: "en-US",
          },
        })
        .conference({
          name: uniqNameConference,
          statusEvents: ["start", "end", "join", "leave"],
          statusHook: "/call-controller/conference-status",
          startConferenceOnEnter: true,
          endConferenceOnExit: true,
        }); // conference created
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
      Promise.all(
        listMember.map(async member => {
          await this.client.calls.create({
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
        }),
      ).catch(err => {
        console.log("🚀 ~ file: call-controller.controller.ts:85 ~ CallControllerController ~ callerCreateConference ~ err:", err);
        res.sendStatus(503);
      });
      const app = this.jambonz;
      res.status(200).json(app);
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

      if (!response?.isOutBoundCall) {
        const { uniqNameConference } = response; // from response;
        this.jambonz.pause({ length: 2 });
        this.jambonz
          .say({
            text: "Your conference will begin when the moderator arrives",
            synthesizer: {
              vendor: "google",
              language: "en-US",
            },
          })
          .conference({
            name: uniqNameConference,
            statusEvents: ["start", "end", "join", "leave"],
            statusHook: "/call-controller/conference-status",
            startConferenceOnEnter: false,
            endConferenceOnExit: false,
          });
        const app = this.jambonz;
        return res.status(200).json(app);
      } else {
        const { to, from } = response;
        const uniqNameConference = getUniqConferenceName();
        console.log("🚀 ~ file: call-controller.controller.ts:151 ~ CallControllerController ~ agentJoinOrCreateConference ~ uniqNameConference:", uniqNameConference);
        this.jambonz.pause({ length: 2 });
        this.jambonz
          .say({
            text: "we will now begin the conference",
            synthesizer: {
              vendor: "google",
              language: "en-US",
            },
          })
          .conference({
            name: uniqNameConference,
            statusEvents: ["start", "end", "join", "leave"],
            statusHook: "/call-controller/conference-status",
            startConferenceOnEnter: true,
            endConferenceOnExit: true,
          }); // conference created.
        const app = this.jambonz;
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

  @Post("agent-invite-customer")
  async agentInviteCustomer(@Req() req: Request, @Res() res: Response): Promise<any> {
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
    console.log("🚀 ~ file: call-controller.controller.ts:176 ~ CallControllerController ~ customerJoinConference ~ customerJoinConference");
    try {
      const { conferenceName } = req.params;
      console.log("🚀 ~ file: call-controller.controller.ts:178 ~ CallControllerController ~ customerJoinConference ~ conferenceName:", conferenceName);
      // create unique name for conference
      this.jambonz.pause({ length: 2 });
      this.jambonz
        .say({
          text: "Your has been invite to this conference",
          synthesizer: {
            vendor: "google",
            language: "en-US",
          },
        })
        .conference({
          name: conferenceName,
          statusEvents: ["start", "end", "join", "leave"],
          statusHook: "/call-controller/conference-status",
          startConferenceOnEnter: false,
          endConferenceOnExit: false,
        });
      redisConferenceCallingData[conferenceName].isOneOfMemberAnswer = true;
      const app = this.jambonz;
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
      this.jambonz.say({ text }).pause({ length: 1.5 });
      const app = this.jambonz;
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
    // console.log("🚀 ~ file: call-controller.controller.ts:256 ~ CallControllerController ~ conferenceStatus ~ conferenceStatus");
    const { body } = req;
    const { conference_sid, event, member, friendly_name, call_sid } = body;
    // console.log("🚀 ~ file: call-controller.controller.ts:258 ~ CallControllerController ~ conferenceStatus:", body);
    if (event === "start") {
      setTimeout(async () => {
        const { isOneOfMemberAnswer } = redisConferenceCallingData[friendly_name];
        if (!isOneOfMemberAnswer) {
          try {
            const response = await axios.put(
              `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
              { call_status: "completed" },
              {
                headers: {
                  Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
                },
              },
            );
            console.log("🚀 ~ file: call-controller.controller.ts:332 ~ CallControllerController ~ setTimeout ~ response:", response);
          } catch (error) {
            console.error("Error updating call status:", error);
          }
        }
      }, 20000);
    }
    res.sendStatus(200);
  }

  @Post("conference-hold-hook")
  conferenceHoldHook(@Req() req: Request, @Res() res: Response): any {
    // console.log("🚀 ~ file: call-controller.controller.ts:256 ~ CallControllerController ~ conferenceStatus ~ conferenceStatus");
    const text = `
    You have been placed on brief hold while we try to find a team member to help you.
    We shall search far and wide to find just the right person for you.
    So please do continue to wait just a bit longer, if you would.`;
    this.jambonz.say({ text }).pause({ length: 3 });
    const app = this.jambonz;
    res.status(200).json(app);
  }

  @Post("call-status")
  callStatus(@Req() req: Request, @Res() res: Response): any {
    const { body } = req;
    // console.log("🚀 ~ file: call-controller.controller.ts:45 ~ CallControllerController ~ callStatus ~ body:", body);
    res.sendStatus(200);
  }
}
