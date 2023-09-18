import { Controller, Get, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { getUniqConferenceName, isPhoneNumberOrSIP } from "src/utils/until";
const WebhookResponse = require("@jambonz/node-client").WebhookResponse;
const jambonz = require("@jambonz/node-client");
const axios = require("axios");
import { IUpdateConferenceOption, IToUserType, ILegMember, IConfCall } from "./../types/type";
import { ConfCallStatus, MemberType, LegMemberStatus, ConferenceType } from "./../enums/enum";

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
      console.log("🚀 ~ file: call-controller.controller.ts:53 ~ CallControllerController ~ callerCreateConference ~ uniqNameConference:", uniqNameConference);
      const app = new WebhookResponse();
      // enable recording.
      // app.config({
      //   listen: {
      //     url: `${process.env.WEBSOCKET_URL}${process.env.WS_RECORD_PATH}`,
      //     mixType: "stereo",
      //     enable: true,
      //   },
      // });
      // end record
      // call api to chatchilla to get all did.
      //if from is one of did of chatchilla, do nothing. Already handle in agent create conference.
      if (from !== "16164413854" && from !== "16164399715") {
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
            statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
            statusHook: "/call-controller/conference-status",
            waitHook: "/call-controller/conference-wait-hook",
            // startConferenceOnEnter: true,
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
            name: "test8@voice.chatchilladev.sip.jambonz.cloud",
          },
          {
            type: "user",
            name: "test8sub@voice.chatchilladev.sip.jambonz.cloud",
          },
        ];
        const listPhoneFirstInviteRinging = [];
        const members = [];
        setTimeout(() => {
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
              console.log("🚀 ~ file: call-controller.controller.ts:118 ~ CallControllerController ~ setTimeout ~ callRingingSid:", callRingingSid);
              listPhoneFirstInviteRinging.push(callRingingSid);
              const memberData = {
                callId: callRingingSid,
                type: MemberType.USER,
                status: LegMemberStatus.calling,
                value: member.name,
              };
              members.push(memberData);
            }),
          )
            .then(values => {
              redisConferenceCallingData[uniqNameConference] = {
                ...redisConferenceCallingData[uniqNameConference],
                ...{ listPhoneFirstInviteRinging: listPhoneFirstInviteRinging, members: members },
              };
              console.log(
                "🚀 ~ file: call-controller.controller.ts:119 ~ CallControllerController ~ setTimeout ~ redisConferenceCallingData[uniqNameConference]:",
                redisConferenceCallingData[uniqNameConference],
              );
            })
            .catch(err => {
              console.log("🚀 ~ file: call-controller.controller.ts:85 ~ CallControllerController ~ callerCreateConference ~ err:", err);
              res.sendStatus(503);
            });
        }, 2000);
      } else res.status(200);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:86 ~ CallControllerController ~ callerCreateConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("agent-create-conference")
  async agentCreateConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      // Call Api to chatchilla to get did of sip account is calling.
      const { from, to } = req.body;
      let toUser: IToUserType = {};
      let fromDid = "";
      if (from === "test8") fromDid = "16164413854";
      if (from === "test8sub") fromDid = "16164399715";
      if (isPhoneNumberOrSIP(to) === "sip") {
        toUser.type = "user";
        toUser.name = to;
      } else {
        if (to === "16164413854") {
          toUser.type = "user";
          toUser.name = "test8@voice.chatchilladev.sip.jambonz.cloud";
        } else if (to === "16164399715") {
          toUser.type = "user";
          toUser.name = "test8sub@voice.chatchilladev.sip.jambonz.cloud";
        } else {
          toUser.type = "phone";
          toUser.number = to.length <= 10 ? `1${to}` : to;
        }
      }
      const app = new WebhookResponse();
      const uniqNameConference = getUniqConferenceName();
      console.log("🚀 ~ file: call-controller.controller.ts:151 ~ CallControllerController ~ agentJoinOrCreateConference ~ uniqNameConference:", uniqNameConference);
      app.config({
        listen: {
          url: `${process.env.WEBSOCKET_URL}${process.env.WS_RECORD_PATH}`,
          mixType: "stereo",
          enable: true,
        },
      });
      app.conference({
        name: uniqNameConference,
        statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
        statusHook: "/call-controller/conference-status",
        // startConferenceOnEnter: true,
        endConferenceOnExit: true,
      }); // conference created.
      redisConferenceCallingData[uniqNameConference] = {
        isOneOfMemberAnswer: false,
      };
      res.status(200).json(app);
      const log = await this.client.calls.create({
        from: fromDid,
        to: toUser,
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
      if (!!log) {
        redisConferenceCallingData[uniqNameConference].listPhoneFirstInviteRinging = [log];
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
      // const {
      //   from = "16164413854",
      //   uniqNameConference,
      //   to = {
      //     type: "user",
      //     name: "test8sub@voice.chatchilladev.sip.jambonz.cloud",
      //   },
      //to = {"type": "phone", "number": "17147520454"},
      // } = req.body;
      const { from, to, uniqNameConference } = req.body;
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
      return res.status(200).json(log);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:151 ~ CallControllerController ~ dialInviteCustomer ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Get("person-join-conference/:conferenceName")
  personJoinConference(@Req() req: Request, @Res() res: Response): any {
    try {
      const { conferenceName } = req.params;
      console.log("🚀 ~ file: call-controller.controller.ts:226 ~ CallControllerController ~ personJoinConference ~ conferenceName:", conferenceName);
      const app = new WebhookResponse();
      // create unique name for conference
      app.conference({
        name: conferenceName,
        statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
        statusHook: "/call-controller/conference-status",
      });
      res.status(200).json(app);
      redisConferenceCallingData[conferenceName].isOneOfMemberAnswer = true;
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
      const updateOption: IUpdateConferenceOption = {
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

  @Post("mute-member-conference")
  async muteMemberConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { conf_mute_status = "mute", call_sid } = req.body;
      const response = await axios.put(
        `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
        { conf_mute_status },
        {
          headers: {
            Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
          },
        },
      );
      return res.status(response?.status).json({ status: response?.status });
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:226 ~ CallControllerController ~ muteConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("remove-member-conference")
  async removeMemberConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { call_sid } = req.body;
      const response = await axios.put(
        `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
        { call_status: "completed" },
        {
          headers: {
            Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
          },
        },
      );
      return res.status(response?.status).json({ status: response?.status });
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:226 ~ CallControllerController ~ muteConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("conference-status")
  async conferenceStatus(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { body } = req;
      const { conference_sid, event, members, friendly_name, call_sid } = body;
      console.log("🚀 ~ file: call-controller.controller.ts:258 ~ CallControllerController ~ conferenceStatus:", body);
      const listPhoneFirstInviteRinging = redisConferenceCallingData[friendly_name]?.listPhoneFirstInviteRinging || [];
      const newMembers = redisConferenceCallingData[friendly_name]?.members;
      newMembers.forEach((m: ILegMember) => {
        if (call_sid === m.callId) {
          m.status = LegMemberStatus[event];
        }
      });
      redisConferenceCallingData[friendly_name].members = newMembers;
      if (event === ConferenceType.START) {
        redisConferenceCallingData[friendly_name].status = ConfCallStatus.START;
        redisConferenceCallingData[friendly_name].fallOverTimeOut = setTimeout(async () => {
          const response = await axios.put(
            `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
            { call_hook: `${process.env.BACKEND_URL}/call-controller/conference-wait-hook` },
            {
              headers: {
                Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
              },
            },
          );
          console.log("🚀 ~ file: call-controller.controller.ts:367 ~ CallControllerController ~ conferenceStatus ~ response:", response);
        }, 10000);
      }
      if (event === ConferenceType.JOIN && members > 1 && listPhoneFirstInviteRinging.includes(call_sid)) {
        clearTimeout(redisConferenceCallingData[friendly_name].fallOverTimeOut);
        const filterAcceptCallSid = listPhoneFirstInviteRinging.filter((ringingCall: string) => ringingCall !== call_sid);
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
      if ((event === ConferenceType.LEAVE && members === 0) || event === ConferenceType.END) redisConferenceCallingData[friendly_name].status = ConfCallStatus.END;
      console.log(
        "🚀 ~ file: call-controller.controller.ts:360 ~ CallControllerController ~ conferenceStatus ~  redisConferenceCallingData[friendly_name]:",
        redisConferenceCallingData[friendly_name],
      );
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
    // console.log("🚀 ~ file: call-controller.controller.ts:383 ~ CallControllerController ~ callStatus ~ body:", body);
    res.sendStatus(200);
  }

  // @Post("conference-wait-hook")
  // conferenceWaitHook(@Req() req: Request, @Res() res: Response): any {
  //   const conferenceName: any = req.query.conferenceName;
  //   const callSid = req.query.callSid;
  //   setTimeout(async () => {
  //     if (!redisConferenceCallingData[conferenceName]?.isOneOfMemberAnswer) {
  //       const app = new WebhookResponse();
  //       app.say({
  //         text: "No one pickup the phone, the call will be hang up automatically",
  //         synthesizer: {
  //           vendor: "google",
  //           language: "en-US",
  //         },
  //       });
  //       res.status(200).json(app);
  //     }
  //   }, 20000);
  // }

  @Post("conference-wait-hook")
  conferenceWaitHook(@Req() req: Request, @Res() res: Response): any {
    const conferenceName: any = req.query.conferenceName;
    const callSid = req.query.callSid;
    if (!redisConferenceCallingData[conferenceName]?.isOneOfMemberAnswer) {
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
  }
}
