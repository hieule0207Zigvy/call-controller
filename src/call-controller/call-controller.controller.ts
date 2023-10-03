import { Controller, Get, Post, Req, Res, Inject } from "@nestjs/common";
import { Request, Response } from "express";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { getUniqConferenceName, isPhoneNumberOrSIP } from "src/utils/until";
const WebhookResponse = require("@jambonz/node-client").WebhookResponse;
const jambonz = require("@jambonz/node-client");
const axios = require("axios");
import { IUpdateConferenceOption, IToUserType, ILegMember, IConfCall, ITypeOfToUser } from "./../types/type";
import { ConfCallStatus, MemberType, LegMemberStatus, ConferenceType, GroupCallSettingRingingType } from "./../enums/enum";
import { CallControllerService } from "./call-controller.service";
import { Cache } from "cache-manager";

@Controller("call-controller")
export class CallControllerController {
  constructor(private callControllerService: CallControllerService) {}

  private client: any = jambonz(process.env.JAMBONZ_ACCOUNT_SID, process.env.JAMBONZ_API_KEY, {
    baseUrl: process.env.JAMBONZ_REST_API_BASE_URL,
  });

  @Get()
  async test(): Promise<string> {
    return "Call controller";
  }
  // call inbound
  @Post("caller-create-conference")
  async callerCreateConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { from, to } = req.body;
      // create unique name for conference
      const uniqNameConference = getUniqConferenceName();
      const app = new WebhookResponse();

      // call api to chatchilla to get all did.
      //if from is one of did of chatchilla, do nothing. Already handle in agent create conference.
      const checkDidResponse = await axios
        .post(`${process.env.CHATCHILLA_BACKEND_URL}/dids/check_did`, { did: from })
        .catch(err => console.log("🚀 ~ file: call-controller.service.ts:33 ~ CallControllerService ~ callSids.map ~ err:", err));

      if (checkDidResponse.status !== 200) return res.status(500);

      const isCallComeFromChatchillaDid = checkDidResponse?.data?.isDid;

      if (!isCallComeFromChatchillaDid) {
        const groupCallSettingResponse = await axios
          .post(`${process.env.CHATCHILLA_BACKEND_URL}/group/call_settings`, {
            DID: to,
            CustomerNumber: from,
          })
          .catch(err => console.log("🚀 ~ file: call-controller.service.ts:33 ~ CallControllerService ~ callSids.map ~ err:", err));
        if (groupCallSettingResponse?.status !== 200 || !groupCallSettingResponse?.data?.call_settings) return res.status(500);
        const callSettingData = groupCallSettingResponse?.data?.call_settings;
        const conversationId = groupCallSettingResponse?.data?.conversationId;
        const {
          // welcomeMedia,
          // queueMedia,
          // timeoutMedia,
          // voicemailMedia,
          queueTimeout,
          voicemailTimeout,
          fromNumber,
          isHangup,
          memberNeedToCall,
          isEnableRecord,
          isEnableVoiceMail,
          isForwardCall,
          callForwardPhoneNumber,
        } = this.callControllerService.getCallSettings(callSettingData);
        const welcomeMedia = "https://smartonhold.com.au/wp-content/uploads/2021/11/FEMALE-DEMO-1-Monica-Devine-5-11-21.mp3";
        const queueMedia = "https://smartonhold.com.au/wp-content/uploads/2021/11/FEMALE-DEMO-2-Inga-Feitsma-5-11-21.mp3";
        const timeoutMedia = "https://smartonhold.com.au/wp-content/uploads/2023/07/Male-Demo-Rick-Davey.mp3";
        const voicemailMedia = "https://smartonhold.com.au/wp-content/uploads/2023/04/Male-Demo-1Mark-Fox.mp3";
        // if (hangup) return res.status(200);
        if (isHangup) {
          if (!!welcomeMedia) {
            app.play({ url: welcomeMedia });
          }
          return res.status(200).json(app);
        }

        if (isForwardCall) {
          if (!!welcomeMedia) {
            app.play({ url: welcomeMedia });
          }
          app.dial({
            answerOnBridge: true,
            callerId: fromNumber,
            target: [
              {
                type: "phone",
                number: callForwardPhoneNumber,
              },
            ],
          });
          return res.status(200).json(app);
        }

        if (isEnableRecord) {
          // enable recording.
          // app.config({
          //   listen: {
          //     url: `${process.env.WEBSOCKET_URL}${process.env.WS_RECORD_PATH}`,
          //     mixType: "stereo",
          //     enable: true,
          //   },
          // });
          // end record
        }
        app.tag({
          data: {
            listMember: memberNeedToCall,
            uniqNameConference,
            from: fromNumber ? fromNumber : from,
          },
        });
        // if (!welcomeMedia) {
        app
          .tag({
            data: {
              listMember: memberNeedToCall,
              uniqNameConference,
              from: fromNumber ? fromNumber : from,
            },
          })
          .play({ url: welcomeMedia, actionHook: "/call-controller/call-hook" })
          .conference({
            name: uniqNameConference,
            statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
            statusHook: "/call-controller/conference-status",
            startConferenceOnEnter: true,
            endConferenceOnExit: true,
          })
          .play({ url: welcomeMedia, actionHook: "/call-controller/timeout-media-hook", timeoutSecs: queueTimeout });
        // }
        // else {
        //   const welcomeOption = {
        //     url: welcomeMedia,
        //     actionHook: "/call-controller/call-hook",
        //   };
        //   const queueOption = {
        //     url: queueMedia,
        //     timeoutSecs: queueTimeout,
        //     actionHook: "/call-controller/timeout-media-hook",
        //   };
        //   if (queueMedia) {
        //       app.play(welcomeOption)
        //       .conference({
        //         name: uniqNameConference,
        //         statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
        //         statusHook: "/call-controller/conference-status",
        //         startConferenceOnEnter: true,
        //         endConferenceOnExit: true,
        //       })
        //       // .play(queueOption);
        //   } else {
        //     app
        //       .tag({
        //         data: {
        //           listMember: memberNeedToCall,
        //           uniqNameConference,
        //           from: fromNumber ? fromNumber : from,
        //         },
        //       })
        //       .play(welcomeOption)
        //       .conference({
        //         name: uniqNameConference,
        //         statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
        //         statusHook: "/call-controller/conference-status",
        //         startConferenceOnEnter: true,
        //         endConferenceOnExit: true,
        //       });
        //   }
        // }
        // conference created
        res.status(200).json(app);
        const initCallLog: IConfCall = {
          isOneOfMemberAnswer: false,
          confUniqueName: uniqNameConference,
          masterCallId: "",
          status: ConfCallStatus.START,
          members: [],
          currentMemberInConf: 0,
          fallOverTimeOutSid: "",
          isOutboundCall: false,
          listPhoneFirstInviteRinging: [],
          eventTime: "",
          conversationId,
          isEnableFallOver: isEnableVoiceMail,
          fallOverMediaUrl: voicemailMedia,
          fallOverTimeout: voicemailTimeout * 1000,
          timeoutMediaUrl: timeoutMedia,
        };
        await this.callControllerService.setCallLogToRedis(uniqNameConference, initCallLog, null);
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
      const { from, sip } = req.body;
      const { headers } = sip || {};
      let toUser: IToUserType = {};
      let fromDid = "";
      console.log("🚀 ~ file: call-controller.controller.ts:113 ~ CallControllerController ~ agentCreateConference ~  req.body:", req.body);
      if (!headers) return res.status(400);
      const { ani = "", to } = headers;
      fromDid = `${from}@${process.env.CHATCHILLA_SIP_DOMAIN}`;
      if (!!ani) fromDid = ani;
      const isMatchPhoneFormat = to.match(/<sip:(\d+)@/) || to.match(/<sip:(\+\d+)@/);
      if (isMatchPhoneFormat && isMatchPhoneFormat.length > 1) {
        const extractedNumber = isMatchPhoneFormat[1]; // Output: +17147520454
        toUser.type = MemberType.EXTERNAL_PHONE;
        toUser.number = extractedNumber.includes("+") ? extractedNumber : `+${extractedNumber}`;
      } else {
        const isMatchSipFormat = to.match(/<sip:(.*?)@/);
        if (isMatchSipFormat && isMatchSipFormat.length > 1) {
          const extractedText = isMatchSipFormat[1];
          toUser.type = MemberType.USER;
          toUser.name = `${extractedText}@${process.env.CHATCHILLA_SIP_DOMAIN}`;
        } else {
          return res.status(400);
        }
      }
      // for mocking purposes
      // const { from, to } = req.body;
      // let toUser: IToUserType = {};
      // let fromDid = "";
      // if (from === "test8") fromDid = "16164413854";
      // if (from === "test8sub") fromDid = "16164399715";
      // if (isPhoneNumberOrSIP(to) === MemberType.SIP_USER) {
      //   toUser.type = to.includes(process.env.CHATCHILLA_SIP_DOMAIN) ? MemberType.USER : MemberType.SIP_USER;
      //   toUser.name = to;
      // } else {
      //   if (to === "16164413854") {
      //     toUser.type = MemberType.USER;
      //     toUser.name = "test8@voice.chatchilladev.sip.jambonz.cloud";
      //   } else if (to === "16164399715") {
      //     toUser.type = MemberType.USER;
      //     toUser.name = "test8sub@voice.chatchilladev.sip.jambonz.cloud";
      //   } else {
      //     toUser.type = MemberType.EXTERNAL_PHONE;
      //     toUser.number = to.length <= 10 ? `1${to}` : to;
      //   }
      // }
      // if (to === "test8" || to === "test8sub") {
      //   toUser.type = MemberType.USER;
      //   toUser.name = `${to}@voice.chatchilladev.sip.jambonz.cloud`;
      // }
      const app = new WebhookResponse();
      const uniqNameConference = getUniqConferenceName();
      console.log("🚀 ~ file: call-controller.controller.ts:151 ~ CallControllerController ~ agentJoinOrCreateConference ~ uniqNameConference:", uniqNameConference);
      // app.config({
      //   listen: {
      //     url: `${process.env.WEBSOCKET_URL}${process.env.WS_RECORD_PATH}`,
      //     mixType: "stereo",
      //     enable: true,
      //   },
      // });
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
        fallOverTimeOutSid: "",
        isOutboundCall: true,
        listPhoneFirstInviteRinging: [],
        eventTime: "",
        // conversationId: sip?.headers?.conversationid || "",
        isEnableFallOver: false,
        fallOverMediaUrl: null,
        fallOverTimeout: null,
        timeoutMediaUrl: null,
      };
      console.log("🚀 ~ file: call-controller.controller.ts:173 ~ CallControllerController ~ agentCreateConference ~ initCallLog:", initCallLog);
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
      const response = await axios
        .put(`${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`, updateOption, {
          headers: {
            Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
          },
        })
        .catch(err => console.log("🚀 ~ file: call-controller.service.ts:33 ~ CallControllerService ~ callSids.map ~ err:", err));
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
      const response = await axios
        .put(
          `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
          { conf_mute_status },
          {
            headers: {
              Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
            },
          },
        )
        .catch(err => console.log("🚀 ~ file: call-controller.service.ts:33 ~ CallControllerService ~ callSids.map ~ err:", err));
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
      const response = await axios
        .put(
          `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
          { call_status: "completed" },
          {
            headers: {
              Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
            },
          },
        )
        .catch(err => console.log("🚀 ~ file: call-controller.service.ts:33 ~ CallControllerService ~ callSids.map ~ err:", err));
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

  @Post("timeout-media-hook")
  async timeoutMediaHook(@Req() req: Request, @Res() res: Response): Promise<any> {
    console.log("🚀 ~ file: call-controller.controller.ts:460 ~ CallControllerController ~ timeoutMediaHook ~ timeoutMediaHook:");
    const { body } = req;
    const { customerData = {} } = body;
    const { uniqNameConference } = customerData;
    const app = new WebhookResponse();
    const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(uniqNameConference);
    if (!currentCallLog?.isOneOfMemberAnswer) {
      const option = {
        url: "",
      };
      if (!!currentCallLog?.timeoutMediaUrl) option.url = currentCallLog.timeoutMediaUrl;
      app.play(option);
      res.status(200).json(app);
    } else return res.status(200);
  }

  @Post("conference-wait-hook/:conferenceName")
  async conferenceWaitHook(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { conferenceName } = req.params;
    const app = new WebhookResponse();
    const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(conferenceName);
    const option = {
      url: "",
    };
    if (!!currentCallLog?.fallOverMediaUrl) option.url = currentCallLog.fallOverMediaUrl;
    app.play(option);
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

  @Post("call-hook")
  callHook(@Req() req: Request, @Res() res: Response): any {
    const { body } = req;
    const { customerData = {} } = body;
    const { listMember = [], uniqNameConference, from } = customerData;
    const listPhoneFirstInviteRinging = [];
    const members = [];
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
    res.sendStatus(200);
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
      const listPhoneFirstInviteRinging = currentCallLog?.listPhoneFirstInviteRinging || [];
      const newMembers = currentCallLog.members || [];
      newMembers.forEach((m: ILegMember) => {
        if (call_sid === m.callId) {
          m.status = LegMemberStatus[event];
          m.eventTime = time;
        }
      });
      const newData = { members: newMembers, currentMemberInConf: members };
      await this.callControllerService.setCallLogToRedis(friendly_name, newData, currentCallLog);
      if (event === ConferenceType.START && currentCallLog?.isEnableFallOver) {
        const timeoutFallOverFunc = setTimeout(async () => {
          const test = await axios
            .put(
              `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
              { call_hook: `${process.env.BACKEND_URL}/call-controller/conference-wait-hook/${friendly_name}` },
              {
                headers: {
                  Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
                },
              },
            )
            .catch(err => console.log("🚀 ~ file: call-controller.service.ts:33 ~ CallControllerService ~ callSids.map ~ err:", err));
        }, currentCallLog?.fallOverTimeout);
        this.callControllerService.pushTimeOut(timeoutFallOverFunc, call_sid);
        const newData = { status: ConfCallStatus.START, masterCallId: call_sid, fallOverTimeOutSid: call_sid, eventTime: time };
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
        clearTimeout(currentCallLog.fallOverTimeOutSid);
        this.callControllerService.removeAndClearTimeout(currentCallLog.fallOverTimeOutSid);
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
          const newData = { fallOverTimeOutSid: null, currentMemberInConf: members, members: currentMembers };
          await this.callControllerService.setCallLogToRedis(friendly_name, newData, currentCallLog);
        } else {
          const newData = { fallOverTimeOutSid: null, currentMemberInConf: members };
          await this.callControllerService.setCallLogToRedis(friendly_name, newData, currentCallLog);
        }
      }
      if ((event === ConferenceType.LEAVE && members === 0) || event === ConferenceType.END) {
        if (currentCallLog.fallOverTimeOutSid) {
          clearTimeout(currentCallLog.fallOverTimeOutSid);
          this.callControllerService.removeAndClearTimeout(currentCallLog.fallOverTimeOutSid);
        }
        const filterRingingCallSid = currentCallLog.members.filter((member: ILegMember) => member.status == LegMemberStatus.calling).map((member: ILegMember) => member.callId);
        await this.callControllerService.endAllRingingCall(filterRingingCallSid);
        const currentMembers = currentCallLog.members;
        currentMembers.forEach((member: ILegMember) => {
          member.status = LegMemberStatus.leave;
          member.eventTime = time;
        });
        const newData = { status: ConfCallStatus.END, members: currentMembers, fallOverTimeOutSid: null, currentMemberInConf: members, eventTime: time };
        await this.callControllerService.setCallLogToRedis(friendly_name, newData, currentCallLog);
      }
      res.sendStatus(200);
    } catch (error) {
      console.log("🚀 ~ file: call-controller.controller.ts:362 ~ CallControllerController ~ conferenceStatus ~ error:", error);
      res.sendStatus(503);
    }
  }
}
