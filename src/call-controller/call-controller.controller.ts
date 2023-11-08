import { Controller, Get, Post, Req, Res, Inject } from "@nestjs/common";
import { Request, Response } from "express";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { getUniqConferenceName, isPhoneNumberOrSIP } from "src/utils/until";
const WebhookResponse = require("@jambonz/node-client").WebhookResponse;
const jambonz = require("@jambonz/node-client");
const axios = require("axios");
import { IUpdateConferenceOption, IToUserType, ILegMember, IConfCall, ITypeOfToUser } from "./../types/type";
import { ConfCallStatus, MemberType, LegMemberStatus, ConferenceType, GroupCallSettingRingingType, CallingType, CallStatus } from "./../enums/enum";
import { CallControllerService } from "./call-controller.service";
import { Cache } from "cache-manager";
var _ = require("lodash");

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
      const checkDidResponse = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/dids/check_did`, { did: from });

      if (checkDidResponse.status !== 200) return res.status(500);

      const isCallComeFromChatchillaDid = checkDidResponse?.data?.isDid;

      if (!isCallComeFromChatchillaDid) {
        const groupCallSettingResponse = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/group/call_settings`, {
          DID: to,
          CustomerNumber: from,
        });
        console.log(
          "🚀 ~ file: call-controller.controller.ts:49 ~ CallControllerController ~ callerCreateConference ~ groupCallSettingResponse?.data:",
          groupCallSettingResponse?.data,
        );
        if (groupCallSettingResponse?.status !== 200 || !groupCallSettingResponse?.data?.call_settings) return res.status(500);
        const callSettingData = groupCallSettingResponse?.data?.call_settings;
        const conversationId = groupCallSettingResponse?.data?.conversationId;
        const groupId = callSettingData.id;
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
          isWelcomeMedia,
          userId,
        } = this.callControllerService.getCallSettings(callSettingData);
        const welcomeMedia = "https://smartonhold.com.au/wp-content/uploads/2021/11/FEMALE-DEMO-1-Monica-Devine-5-11-21.mp3";
        const queueMedia = "https://smartonhold.com.au/wp-content/uploads/2021/11/FEMALE-DEMO-2-Inga-Feitsma-5-11-21.mp3";
        const timeoutMedia = "https://smartonhold.com.au/wp-content/uploads/2023/07/Male-Demo-Rick-Davey.mp3";
        const voicemailMedia = "https://smartonhold.com.au/wp-content/uploads/2023/04/Male-Demo-1Mark-Fox.mp3";
        if (isHangup) {
          if (!!welcomeMedia) {
            app.play({ url: welcomeMedia });
          }
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

        if (isForwardCall) {
          app
            .tag({
              data: {
                to,
                callForwardPhoneNumber,
              },
            })
            .play({ url: welcomeMedia, actionHook: "/call-controller/forwarding-hook" });
          return res.status(200).json(app);
        }

        app
          .tag({
            data: {
              listMember: memberNeedToCall,
              uniqNameConference,
              from: fromNumber ? fromNumber : from,
              conversationId,
              groupId,
              userId,
            },
          })
          .play({ url: "", actionHook: "/call-controller/call-hook" })
          .conference({
            name: uniqNameConference,
            statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
            statusHook: "/call-controller/conference-status",
            startConferenceOnEnter: true,
            endConferenceOnExit: true,
          });
        // conference created
        res.status(200).json(app);
        const initCallLog: IConfCall = {
          caller: from,
          isOneOfMemberAnswer: false,
          confUniqueName: uniqNameConference,
          masterCallId: "",
          status: ConfCallStatus.CREATED,
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
          queueMediaUrl: queueMedia,
          queueTimeout: queueTimeout,
          isTriggerQueueMedia: false,
          isWelcomeMedia,
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
      // console.log("🚀 ~ file: call-controller.controller.ts:157 ~ CallControllerController ~ agentCreateConference ~ req.body:", req.body)
      const { headers } = sip || {};
      let toUser: IToUserType = {};
      let fromDid = "";
      if (!headers) return res.status(400);
      const { ani = "", to, conferencename } = headers;
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
      let uniqNameConference = conferencename;
      if (!conferencename) uniqNameConference = getUniqConferenceName();
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
        caller: fromDid,
        isOneOfMemberAnswer: false,
        confUniqueName: uniqNameConference,
        masterCallId: "",
        status: ConfCallStatus.CREATED,
        members: [],
        currentMemberInConf: 0,
        fallOverTimeOutSid: "",
        isOutboundCall: true,
        listPhoneFirstInviteRinging: [],
        eventTime: "",
        conversationId: sip?.headers?.conversationid || "",
        isEnableFallOver: false,
        fallOverMediaUrl: null,
        fallOverTimeout: null,
        timeoutMediaUrl: null,
        queueMediaUrl: null,
        queueTimeout: null,
        isTriggerQueueMedia: null,
        isWelcomeMedia: null,
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
          url: `${process.env.BACKEND_URL}/call-controller/call-status/${uniqNameConference}`,
          method: "POST",
        },
        speech_synthesis_vendor: "google",
        speech_synthesis_language: "en-US",
        speech_synthesis_voice: "en-US-Standard-C",
        speech_recognizer_vendor: "google",
        speech_recognizer_language: "en-US",
        timeout: 55,
      });
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:271 ~ CallControllerController ~ agentCreateConference ~ err:", err);
      res.sendStatus(503);
    }
  }
  // api
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
      console.log("🚀 ~ file: call-controller.controller.ts:334 ~ CallControllerController ~ holdConference ~ err:", err);
      return res.sendStatus(503);
    }
  }

  @Post("conference-hold-hook")
  conferenceHoldHook(@Req() req: Request, @Res() res: Response): any {
    const text = `
    You have been placed on brief hold while we try to find a team member to help you.
    We shall search far and wide to find just the right person for you.
    So please do continue to wait just a bit longer, if you would.`;
    const app = new WebhookResponse();
    // app.say({ text });
    res.status(200).json(app);
  }

  @Post("make-invite-conference")
  async makeInviteConference(@Req() req: Request, @Res() res: Response): Promise<any> {
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
      const { from, to, uniqNameConference, headers = {} } = req.body;
      const log = await this.client.calls.create({
        from,
        to,
        call_hook: {
          url: `${process.env.BACKEND_URL}/call-controller/person-join-conference/${uniqNameConference}`,
          method: "GET",
        },
        call_status_hook: {
          url: `${process.env.BACKEND_URL}/call-controller/invite-call-status`,
          method: "POST",
        },
        speech_synthesis_vendor: "google",
        speech_synthesis_language: "en-US",
        speech_synthesis_voice: "en-US-Standard-C",
        speech_recognizer_vendor: "google",
        speech_recognizer_language: "en-US",
        timeout: 55,
        headers: { ...headers, conferenceName: uniqNameConference },
      });
      return res.status(200).json(log);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:310 ~ CallControllerController ~ makeInviteConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("mute-member-conference")
  async muteMemberConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { conf_mute_status = "mute", call_sid, conferenceName } = req.body;
      const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(conferenceName);
      const response = await axios.put(
        `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
        { conf_mute_status },
        {
          headers: {
            Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
          },
        },
      );
      const { members = [] } = currentCallLog;
      const updateMemberList = members;
      if (call_sid === currentCallLog?.masterCallId) {
        await this.callControllerService.setCallLogToRedis(conferenceName, { isMute: conf_mute_status === "mute" }, currentCallLog);
        const log = { ...currentCallLog, isMute: conf_mute_status === "mute" };
        const sendResponse = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log });
      } else {
        updateMemberList.forEach(member => {
          if (member.callId === call_sid) {
            member.isMute = conf_mute_status === "mute";
          }
        });
        const log = { ...currentCallLog, members: updateMemberList };
        const sendResponse = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log });
      }
      await this.callControllerService.setCallLogToRedis(conferenceName, { members: updateMemberList }, currentCallLog);

      return res.status(response?.status).json({ status: response?.status });
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:355 ~ CallControllerController ~ muteMemberConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("remove-member-conference")
  async removeMemberConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { call_sid, conferenceName } = req.body;
    const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(conferenceName);
    const isMasterCall = currentCallLog?.masterCallId === call_sid;
    try {
      const response = await axios.put(
        `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
        { call_status: "no-answer" },
        {
          headers: {
            Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
          },
        },
      );
      if (isMasterCall) {
        await this.callControllerService.setCallLogToRedis(conferenceName, { isCallerLeft: true }, currentCallLog);
        const log = { ...currentCallLog, isCallerLeft: true };
        const sendResponse = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log });
      }
      return res.status(response?.status).json({ status: response?.status, call_sid });
    } catch (err) {
      if (err?.response?.status === 422) {
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
          if (isMasterCall) {
            await this.callControllerService.setCallLogToRedis(conferenceName, { isCallerLeft: true }, currentCallLog);
            const log = { ...currentCallLog, isCallerLeft: true };
            const sendResponse = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log });
          }
          return res.status(response?.status).json({ status: response?.status, call_sid });
        } catch (error) {
          return res.sendStatus(500);
        }
      }
      return res.sendStatus(500);
    }
  }
  // hook
  @Get("person-join-conference/:conferenceName")
  async personJoinConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { conferenceName } = req.params;
      const app = new WebhookResponse();
      // create unique name for conference
      app.conference({
        name: conferenceName,
        statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
        statusHook: "/call-controller/conference-status",
      });
      const newData = { isOneOfMemberAnswer: true, status: ConfCallStatus.START };
      const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(conferenceName);
      await this.callControllerService.setCallLogToRedis(conferenceName, newData, currentCallLog);
      return res.status(200).json(app);
    } catch (err) {
      console.log("🚀 ~ file: call-controller.controller.ts:397 ~ CallControllerController ~ personJoinConference ~ err:", err);
      res.sendStatus(503);
    }
  }

  @Post("queue-hook/:conferenceName")
  async queueHook(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { conferenceName } = req.params;
    const app = new WebhookResponse();
    const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(conferenceName);
    const url = [currentCallLog.queueMediaUrl, "https://bigsoundbank.com/UPLOAD/mp3/0917.mp3"];
    const option = {
      url,
      timeoutSecs: currentCallLog.queueTimeout,
      actionHook: "/call-controller/timeout-media-hook",
    };
    if (!currentCallLog.queueMediaUrl) {
      option.url = ["https://bigsoundbank.com/UPLOAD/mp3/0917.mp3"];
    }
    const newData = { isTriggerQueueMedia: true };
    app.play(option);
    await this.callControllerService.setCallLogToRedis(conferenceName, newData, currentCallLog);
    res.status(200).json(app);
  }

  @Post("timeout-media-hook")
  async timeoutMediaHook(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { body } = req;
    const { customerData = {} } = body;
    const { uniqNameConference } = customerData;
    const app = new WebhookResponse();
    const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(uniqNameConference);
    if (!!currentCallLog.isOneOfMemberAnswer) return res.status(200).json(app);
    if (!!currentCallLog.timeoutMediaUrl) {
      app.play({ url: currentCallLog.timeoutMediaUrl });
    }
    if (!!currentCallLog.fallOverMediaUrl && !!currentCallLog.isEnableFallOver) {
      app.play({ url: currentCallLog.fallOverMediaUrl });
    }
    const currentDate = new Date();
    // Get the ISO 8601 formatted date string
    let eventTime = currentDate.toISOString();
    // Add milliseconds
    const milliseconds = String(currentDate.getUTCMilliseconds()).padStart(3, "0");
    eventTime = eventTime.slice(0, -1) + `.${milliseconds}Z`;
    await this.callControllerService.updateMemberAndStateOfEndedConference(currentCallLog, { friendly_name: currentCallLog.confUniqueName, time: eventTime });
    res.status(200).json(app);
  }

  @Post("rejoin-hook/:conferenceName")
  async reJoinConferenceHook(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { conferenceName } = req.params;
    const app = new WebhookResponse();
    app.conference({
      name: conferenceName,
      statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
      statusHook: "/call-controller/conference-status",
      startConferenceOnEnter: true,
      endConferenceOnExit: true,
    });
    res.status(200).json(app);
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

  @Post("call-hook")
  async callHook(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { body } = req;
    const { customerData = {} } = body;
    const { listMember = [], uniqNameConference, from, conversationId, groupId, userId } = customerData;
    // const members = [];
    const callList = _.uniqBy(listMember, "name");
    Promise.all(
      callList.map(async (member: ITypeOfToUser) => {
        let userIdData = "";
        userId.forEach(userData => {
          const id = userData[member.name];
          if (!!id) userIdData = id;
        });
        const callRingingSid = await this.client.calls.create({
          from,
          to: member,
          call_hook: {
            url: `${process.env.BACKEND_URL}/call-controller/person-join-conference/${uniqNameConference}`,
            method: "GET",
          },
          call_status_hook: {
            url: `${process.env.BACKEND_URL}/call-controller/call-status/${uniqNameConference}`,
            method: "POST",
          },
          speech_synthesis_vendor: "google",
          speech_synthesis_language: "en-US",
          speech_synthesis_voice: "en-US-Standard-C",
          speech_recognizer_vendor: "google",
          speech_recognizer_language: "en-US",
          timeout: 60,
          headers: {
            conversationId,
            conferenceName: uniqNameConference,
            groupId,
            isRequestJoinCall: false,
            parentSessionId: "",
            userId: userIdData,
          },
        });
      }),
    ).catch(err => {
      console.log("🚀 ~ file: call-controller.controller.ts:534 ~ CallControllerController ~ callHook ~ err:", err);
      res.sendStatus(503);
    });
    res.sendStatus(200);
  }

  @Post("forwarding-hook")
  async forwardingHook(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { body } = req;
    const { customerData = {} } = body;
    const { to, callForwardPhoneNumber } = customerData;
    // const { outDialNumber = "17147520454", callerId = "+16164413854" } = req.body;
    const app = new WebhookResponse();
    app.dial({
      callerId: to,
      answerOnBridge: true,
      target: [
        {
          type: "phone",
          number: callForwardPhoneNumber.replace(/[+\s]/g, ""),
        },
      ],
    });
    res.status(200).json(app);
  }
  // status logger
  @Post("invite-call-status")
  inviteCallStatus(@Req() req: Request, @Res() res: Response): any {
    const { body } = req;
    // console.log("🚀 ~ file: call-controller.controller.t s:383 ~ CallControllerController ~ callStatus ~ body:", body);
    res.sendStatus(200);
  }

  @Post("call-status/:conferenceName")
  async callStatus(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { conferenceName } = req.params;
    const { call_sid, sip_status, call_status, to } = req.body;
    console.log("🚀 ~ file: call-controller.controller.ts:575 ~ CallControllerController ~ callStatus ~ req.body:", req.body);
    const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(conferenceName);
    const { members = [], listPhoneFirstInviteRinging = [] } = currentCallLog;
    const updateMemberList = members;
    const memberIds = updateMemberList.map(m => m.callId);
    if (call_status === CallStatus.trying && !memberIds.includes(call_sid)) {
      let type = "";
      if (isPhoneNumberOrSIP(to) === MemberType.EXTERNAL_PHONE) {
        type = MemberType.EXTERNAL_PHONE;
      } else type = MemberType.USER;
      const memberData: ILegMember = {
        callId: call_sid,
        type,
        status: LegMemberStatus.calling,
        value: to,
      };
      updateMemberList.push(memberData);
      if (!listPhoneFirstInviteRinging.includes(call_sid)) listPhoneFirstInviteRinging.push(call_sid);
      await this.callControllerService.setCallLogToRedis(conferenceName, { members: updateMemberList, listPhoneFirstInviteRinging }, currentCallLog);
      const log = { ...currentCallLog, ...{ members: updateMemberList, listPhoneFirstInviteRinging } };
      const response = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log });
      return res.sendStatus(200);
    }
    if (call_status === CallStatus.in_progress && !memberIds.includes(call_sid)) {
      let type = "";
      if (isPhoneNumberOrSIP(to) === MemberType.EXTERNAL_PHONE) {
        type = MemberType.EXTERNAL_PHONE;
      } else type = MemberType.USER;
      const memberData: ILegMember = {
        callId: call_sid,
        type,
        status: LegMemberStatus.join,
        value: to,
      };
      updateMemberList.push(memberData);
    }
    if (call_status === CallStatus.no_answer || call_status === CallStatus.not_available) {
      updateMemberList.forEach((member: ILegMember) => {
        if (member.callId === call_sid) {
          if (call_status === CallStatus.not_available) {
            member.status = LegMemberStatus.not_available;
          } else member.status = LegMemberStatus.no_answer;
        }
      });
    }
    await this.callControllerService.setCallLogToRedis(conferenceName, { members: updateMemberList }, currentCallLog);
    const log = { ...currentCallLog, members: updateMemberList };
    const response = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log });
    return res.sendStatus(200);
  }

  @Post("conference-status")
  async conferenceStatus(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { body } = req;
      const { conference_sid, event, members, friendly_name, call_sid, to, time, direction } = body;
      if (!event) return res.sendStatus(200);
      console.log("🚀 ~ file: call-controller.controller.ts:258 ~ CallControllerController ~ conferenceStatus:", body);
      const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(friendly_name);
      const listPhoneFirstInviteRinging = currentCallLog?.listPhoneFirstInviteRinging || [];
      const isEnableQueueMedia = !!currentCallLog?.queueTimeout && currentCallLog?.isWelcomeMedia;
      const isTriggerQueueMedia = currentCallLog?.isTriggerQueueMedia;
      const isEnableFallOver = currentCallLog?.isEnableFallOver;
      const isOutboundCall = currentCallLog?.isOutboundCall;
      const isMemberCall = call_sid !== currentCallLog?.masterCallId && direction === CallingType.OUTBOUND;
      const conferenceStatus = currentCallLog?.status;
      const isTriggeredQueueMediaOrNotEnable = !isEnableQueueMedia || (isEnableQueueMedia && isTriggerQueueMedia);
      const isConferenceEnded =
        ((event === ConferenceType.LEAVE && members === 0) || event === ConferenceType.END) && isTriggeredQueueMediaOrNotEnable && conferenceStatus !== ConfCallStatus.QUEUE;
      await this.callControllerService.updateListMemberOfConference(currentCallLog, body); // update member whenever member join or leave
      if (event === ConferenceType.START) {
        const newestData = await this.callControllerService.getCallLogOfCall(friendly_name);
        if (isEnableFallOver && !isEnableQueueMedia && !isOutboundCall) {
          await this.callControllerService.triggerFallOverTimeoutWithoutQueueMedia(newestData, body);
        }
        if (isEnableQueueMedia && !isOutboundCall && !isTriggerQueueMedia) {
          await this.callControllerService.enableQueueMedia(newestData, body);
        }
      }
      if (event === ConferenceType.JOIN && isMemberCall) {
        if (!isOutboundCall) await this.callControllerService.removeQueueMedia(currentCallLog?.masterCallId, friendly_name);
        const newestData = await this.callControllerService.getCallLogOfCall(friendly_name);
        await this.callControllerService.reMappingMemberList(newestData, body);
      }
      if (event === ConferenceType.JOIN && members > 1 && listPhoneFirstInviteRinging.includes(call_sid)) {
        clearTimeout(currentCallLog.fallOverTimeOutSid);
        this.callControllerService.removeAndClearTimeout(currentCallLog.fallOverTimeOutSid);
        await this.callControllerService.endCallOfFirstInviteMemberAndUpdateListMember(currentCallLog, body);
      }
      if (isConferenceEnded) {
        if (currentCallLog.fallOverTimeOutSid) {
          clearTimeout(currentCallLog.fallOverTimeOutSid);
          this.callControllerService.removeAndClearTimeout(currentCallLog.fallOverTimeOutSid);
        }
        await this.callControllerService.updateMemberAndStateOfEndedConference(currentCallLog, body);
      }
      const log = await this.callControllerService.getCallLogOfCall(friendly_name);
      const response = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log });
      return res.sendStatus(200);
    } catch (error) {
      console.log("🚀 ~ file: call-controller.controller.ts:362 ~ CallControllerController ~ conferenceStatus ~ error:", error);
      res.sendStatus(503);
    }
  }

  // get - calllog by conference name
  @Post("get-call-log")
  async getCallLog(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { conferenceName } = req.body;
      if (!conferenceName) return res.status(400).send("Missing conference name");
      const log = await this.callControllerService.getCallLogOfCall(conferenceName);
      return res.status(200).json(log);
    } catch (error) {
      console.log("🚀 ~ file: call-controller.controller.ts:689 ~ CallControllerController ~ getCallLog ~ error:", error);
      return res.status(400);
    }
  }
}
