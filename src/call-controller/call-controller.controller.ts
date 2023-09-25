import { Controller, Get, Post, Req, Res, Inject } from "@nestjs/common";
import { Request, Response } from "express";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { getUniqConferenceName, isPhoneNumberOrSIP } from "src/utils/until";
const WebhookResponse = require("@jambonz/node-client").WebhookResponse;
const jambonz = require("@jambonz/node-client");
const axios = require("axios");
import { IUpdateConferenceOption, IToUserType, ILegMember, IConfCall, ITypeOfToUser } from "./../types/type";
import { ConfCallStatus, MemberType, LegMemberStatus, ConferenceType } from "./../enums/enum";
import { CallControllerService } from "./call-controller.service";
import { Cache } from "cache-manager";

@Controller("call-controller")
export class CallControllerController {
  constructor(private callControllerService: CallControllerService, @Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  private client: any = jambonz(process.env.JAMBONZ_ACCOUNT_SID, process.env.JAMBONZ_API_KEY, {
    baseUrl: process.env.JAMBONZ_REST_API_BASE_URL,
  });

  @Get()
  async test(): Promise<string> {
    return "Call controller";
  }

  @Post("voicemail")
  voiceMail(@Req() req: Request, @Res() res: Response): any {
    const { body } = req;
    const text = `<speak>
    Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.
    </speak>`;
    const app = new WebhookResponse();
    // app.say({ text });
    res.status(200).json(app);
  }
  // call inbound
  @Post("caller-create-conference")
  async callerCreateConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { from } = req.body;
      // create unique name for conference
      const uniqNameConference = getUniqConferenceName();
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
        // app.say({
        //   text: "Hello You are calling to Group ONE, We are calling to all members to of this group",
        //   synthesizer: {
        //     vendor: "google",
        //     language: "en-US",
        //   },
        // })
        app.conference({
          name: uniqNameConference,
          statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
          statusHook: "/call-controller/conference-status",
          startConferenceOnEnter: true,
          endConferenceOnExit: true,
        });
        // conference created
        res.status(200).json(app);
        const initCallLog: IConfCall = {
          isOneOfMemberAnswer: false,
          confUniqueName: uniqNameConference,
          masterCallId: "",
          status: ConfCallStatus.START,
          members: [],
          currentMemberInConf: 0,
          fallOverTimeOut: "",
          isOutboundCall: false,
          listPhoneFirstInviteRinging: [],
          eventTime: "",
        };
        await this.callControllerService.setCallLogToRedis(uniqNameConference, initCallLog, null);
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
        // const listMember = [
        //   // {
        //   //   type: "user",
        //   //   name: "test8@voice.chatchilladev.sip.jambonz.cloud",
        //   // },
        //   {
        //     type: "sip",
        //     sipUri: "sip:hieule0207@sip.linphone.org",
        //   },
        // ];
        const listPhoneFirstInviteRinging = [];
        const members = [];
        setTimeout(() => {
          Promise.all(
            listMember.map(async (member: ITypeOfToUser) => {
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
                fromHost: "voice.chatchilladev.sip.jambonz.cloud",
                speech_synthesis_vendor: "google",
                speech_synthesis_language: "en-US",
                speech_synthesis_voice: "en-US-Standard-C",
                speech_recognizer_vendor: "google",
                speech_recognizer_language: "en-US",
              });
              listPhoneFirstInviteRinging.push(callRingingSid);
              const memberData = {
                callId: callRingingSid,
                type: MemberType.USER,
                status: LegMemberStatus.calling,
                value: member?.name,
                eventTime: "",
              };
              members.push(memberData);
            }),
          )
            .then(async values => {
              const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(uniqNameConference);
              const newData = { members, listPhoneFirstInviteRinging };
              await this.callControllerService.setCallLogToRedis(uniqNameConference, newData, currentCallLog);
            })
            .catch(err => {
              console.log("🚀 ~ file: call-controller.controller.ts:85 ~ CallControllerController ~ callerCreateConference ~ err:", err);
              res.sendStatus(503);
            });
        }, 7000);
      } else res.status(200);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:86 ~ CallControllerController ~ callerCreateConference ~ err:", err);
      res.sendStatus(503);
    }
  }
  //call outbound
  @Post("agent-create-conference")
  async agentCreateConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      // Call Api to chatchilla to get did of sip account is calling.
      const { from, to } = req.body;
      let toUser: IToUserType = {};
      let fromDid = "";
      if (from === "test8") fromDid = "16164413854";
      if (from === "test8sub") fromDid = "16164399715";
      if (isPhoneNumberOrSIP(to) === MemberType.SIP_USER) {
        toUser.type = to.includes(process.env.CHATCHILLA_SIP_DOMAIN) ? MemberType.USER : MemberType.SIP_USER;
        toUser.name = to;
      } else {
        if (to === "16164413854") {
          toUser.type = MemberType.USER;
          toUser.name = "test8@voice.chatchilladev.sip.jambonz.cloud";
        } else if (to === "16164399715") {
          toUser.type = MemberType.USER;
          toUser.name = "test8sub@voice.chatchilladev.sip.jambonz.cloud";
        } else {
          toUser.type = MemberType.EXTERNAL_PHONE;
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
        startConferenceOnEnter: true,
        endConferenceOnExit: true,
      }); // conference created.

      const initCallLog: IConfCall = {
        isOneOfMemberAnswer: false,
        confUniqueName: uniqNameConference,
        masterCallId: "",
        status: ConfCallStatus.START,
        members: [],
        currentMemberInConf: 0,
        fallOverTimeOut: "",
        isOutboundCall: true,
        listPhoneFirstInviteRinging: [],
        eventTime: "",
      };
      await this.callControllerService.setCallLogToRedis(uniqNameConference, initCallLog, null);

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
        timeout: 55,
      });
      if (!!log) {
        const memberData = {
          callId: log,
          type: toUser.type,
          status: LegMemberStatus.calling,
          value: toUser?.name || toUser?.number,
          eventTime: "",
        };
        const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(uniqNameConference);
        const newData = { members: [memberData], listPhoneFirstInviteRinging: [log] };
        await this.callControllerService.setCallLogToRedis(uniqNameConference, newData, currentCallLog);
      }
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:86 ~ CallControllerController ~ agentJoinOrCreateConference ~ err:", err);
      res.sendStatus(503);
    }
  }
  // api
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
        timeout: 55,
      });
      return res.status(200).json(log);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:151 ~ CallControllerController ~ dialInviteCustomer ~ err:", err);
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
  // hook
  @Get("person-join-conference/:conferenceName")
  async personJoinConference(@Req() req: Request, @Res() res: Response): Promise<any> {
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
      const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(conferenceName);
      const newData = { isOneOfMemberAnswer: true };
      await this.callControllerService.setCallLogToRedis(conferenceName, newData, currentCallLog);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:86 ~ CallControllerController ~ callerCreateConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("conference-wait-hook")
  conferenceWaitHook(@Req() req: Request, @Res() res: Response): any {
    const app = new WebhookResponse();
    // app.say({
    //   text: "No one pickup the phone, the call will be hang up automatically",
    //   synthesizer: {
    //     vendor: "google",
    //     language: "en-US",
    //   },
    // });
    res.status(200).json(app);
  }

  @Post("conference-hold-hook")
  conferenceHoldHook(@Req() req: Request, @Res() res: Response): any {
    // console.log("🚀 ~ file: call-controller.controller.ts:256 ~ CallControllerController ~ conferenceStatus ~ conferenceStatus");
    const text = `
    You have been placed on brief hold while we try to find a team member to help you.
    We shall search far and wide to find just the right person for you.
    So please do continue to wait just a bit longer, if you would.`;
    const app = new WebhookResponse();
    // app.say({ text });
    res.status(200).json(app);
  }
  // status logger
  @Post("call-status")
  callStatus(@Req() req: Request, @Res() res: Response): any {
    const { body } = req;
    // console.log("🚀 ~ file: call-controller.controller.ts:383 ~ CallControllerController ~ callStatus ~ body:", body);
    res.sendStatus(200);
  }

  @Post("conference-status")
  async conferenceStatus(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { body } = req;
      const { conference_sid, event, members, friendly_name, call_sid, to, time } = body;
      if (!event) return res.sendStatus(200);
      console.log("🚀 ~ file: call-controller.controller.ts:447 ~ CallControllerController ~ conferenceStatus ~ event:", body);
      // console.log("🚀 ~ file: call-controller.controller.ts:258 ~ CallControllerController ~ conferenceStatus:", body);
      const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(friendly_name);
      const listPhoneFirstInviteRinging = currentCallLog.listPhoneFirstInviteRinging || [];
      const newMembers = currentCallLog.members || [];

      newMembers.forEach((m: ILegMember) => {
        if (call_sid === m.callId) {
          m.status = LegMemberStatus[event];
          m.eventTime = time;
        }
      });
      const newData = { members: newMembers, currentMemberInConf: members };
      await this.callControllerService.setCallLogToRedis(friendly_name, newData, currentCallLog);
      if (event === ConferenceType.START) {
        const timeoutFallOverFunc = setTimeout(async () => {
          await axios.put(
            `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
            { call_hook: `${process.env.BACKEND_URL}/call-controller/conference-wait-hook` },
            {
              headers: {
                Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
              },
            },
          );
        }, 60000);

        this.callControllerService.pushTimeOut(timeoutFallOverFunc, call_sid);
        const newData = { status: ConfCallStatus.START, masterCallId: call_sid, fallOverTimeOut: call_sid, eventTime: time };
        await this.callControllerService.setCallLogToRedis(friendly_name, newData, currentCallLog);
      }
      if (event === ConferenceType.JOIN && call_sid !== currentCallLog.masterCallId) {
        const currentMembers = currentCallLog.members;
        const currentMemberCallSids = currentMembers.map((m: ILegMember) => m.callId);

        if (!currentMemberCallSids.includes(call_sid)) {
          currentMembers.push({
            callId: call_sid,
            type: isPhoneNumberOrSIP(to) === MemberType.SIP_USER ? MemberType.USER : MemberType.EXTERNAL_PHONE,
            status: LegMemberStatus.join,
            value: to,
            eventTime: time,
          });
          const newData = { members: currentMembers, currentMemberInConf: members };
          await this.callControllerService.setCallLogToRedis(friendly_name, newData, currentCallLog);
        }
      }
      if (event === ConferenceType.JOIN && members > 1 && listPhoneFirstInviteRinging.includes(call_sid)) {
        clearTimeout(currentCallLog.fallOverTimeOut);
        this.callControllerService.removeAndClearTimeout(currentCallLog.fallOverTimeOut);
        if (!currentCallLog.isOutboundCall) {
          const filterAcceptCallSid = listPhoneFirstInviteRinging.filter((ringingCall: string) => ringingCall !== call_sid);
          await this.callControllerService.endAllRingingCall(filterAcceptCallSid);
          const currentMembers = currentCallLog.members;
          currentMembers.forEach((member: ILegMember) => {
            if (filterAcceptCallSid.includes(member.callId)) {
              member.status = LegMemberStatus.leave;
              member.eventTime = time;
            }
          });
          const newData = { fallOverTimeOut: null, currentMemberInConf: members, members: currentMembers };
          await this.callControllerService.setCallLogToRedis(friendly_name, newData, currentCallLog);
        } else {
          const newData = { fallOverTimeOut: null, currentMemberInConf: members };
          await this.callControllerService.setCallLogToRedis(friendly_name, newData, currentCallLog);
        }
      }
      if ((event === ConferenceType.LEAVE && members === 0) || event === ConferenceType.END) {
        if (currentCallLog.fallOverTimeOut) {
          clearTimeout(currentCallLog.fallOverTimeOut);
          this.callControllerService.removeAndClearTimeout(currentCallLog.fallOverTimeOut);
        }
        const filterRingingCallSid = currentCallLog.members.filter((member: ILegMember) => member.status == LegMemberStatus.calling).map((member: ILegMember) => member.callId);
        await this.callControllerService.endAllRingingCall(filterRingingCallSid);
        const currentMembers = currentCallLog.members;
        currentMembers.forEach((member: ILegMember) => {
          member.status = LegMemberStatus.leave;
          member.eventTime = time;
        });
        const newData = { status: ConfCallStatus.END, members: currentMembers, fallOverTimeOut: null, currentMemberInConf: members, eventTime: time };
        await this.callControllerService.setCallLogToRedis(friendly_name, newData, currentCallLog);
      }
      res.sendStatus(200);
    } catch (error) {
      console.log("🚀 ~ file: call-controller.controller.ts:362 ~ CallControllerController ~ conferenceStatus ~ error:", error?.response?.data?.msg);
      console.log("🚀 ~ file: call-controller.controller.ts:362 ~ CallControllerController ~ conferenceStatus ~ error:", error?.response);
      res.sendStatus(503);
    }
  }
}
