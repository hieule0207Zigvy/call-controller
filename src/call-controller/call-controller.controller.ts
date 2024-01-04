import { Controller, Get, Post, Req, Res, Inject } from "@nestjs/common";
import { Request, Response } from "express";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { getUniqConferenceName, isPhoneNumberOrSIP } from "src/utils/until";
const WebhookResponse = require("@jambonz/node-client").WebhookResponse;
const jambonz = require("@jambonz/node-client");
import axios, { AxiosInstance } from "axios";
import { IUpdateConferenceOption, IToUserType, ILegMember, IConfCall, ITypeOfToUser } from "./../types/type";
import { ConfCallStatus, MemberType, LegMemberStatus, ConferenceType, GroupCallSettingRingingType, CallingType, CallStatus } from "./../enums/enum";
import { CallControllerService } from "./call-controller.service";
import { Cache } from "cache-manager";
import { JambonzService } from "src/jambonz/jambonz.service";
var _ = require("lodash");

@Controller("call-controller")
export class CallControllerController {
  private readonly axiosInstance: AxiosInstance;
  constructor(private callControllerService: CallControllerService, private jambonzService: JambonzService) {}

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
        if (groupCallSettingResponse?.status !== 200 || !groupCallSettingResponse?.data?.call_settings) return res.status(500);
        const callSettingData = groupCallSettingResponse?.data?.call_settings;
        const conversationId = groupCallSettingResponse?.data?.conversationId;
        const groupId = callSettingData.id;
        const {
          welcomeMedia,
          queueMedia,
          timeoutMedia,
          voicemailMedia,
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
          voipCarrier,
          groupCallSetting,
          isIVR,
          ivrData,
        } = await this.callControllerService.getCallSettings(callSettingData, to);
        if (isIVR) {
          app
            .tag({
              data: {
                ivrData,
                uniqNameConference,
                from: fromNumber ? fromNumber : from,
                conversationId,
                groupId,
                userId,
                groupCallSetting,
              },
            })
            // .play({ url: 'https://smartonhold.com.au/wp-content/uploads/2021/11/FEMALE-DEMO-1-Monica-Devine-5-11-21.mp3' })
            .gather({
              actionHook: "/call-controller/gather-dtmf-hook",
              input: ["digits"],
              dtmfBargein: true,
              listenDuringPrompt: true,
              numDigits: 1,
            });
          return res.status(200).json(app);
        }
        const welcomeSample = "https://smartonhold.com.au/wp-content/uploads/2021/11/FEMALE-DEMO-1-Monica-Devine-5-11-21.mp3";
        const queueSample = "https://smartonhold.com.au/wp-content/uploads/2021/11/FEMALE-DEMO-2-Inga-Feitsma-5-11-21.mp3";
        const timeoutSample = "https://smartonhold.com.au/wp-content/uploads/2023/07/Male-Demo-Rick-Davey.mp3";
        const voicemailSample = "https://smartonhold.com.au/wp-content/uploads/2023/04/Male-Demo-1Mark-Fox.mp3";

        const welcomeSampleMedia = welcomeMedia ? welcomeSample : "";
        const queueSampleMedia = queueMedia ? queueSample : "";
        const timeoutSampleMedia = timeoutMedia ? timeoutSample : "";
        const voicemailSampleMedia = voicemailMedia ? voicemailSample : "";
        if (isForwardCall) {
          app
            .tag({
              data: {
                to: fromNumber,
                callForwardPhoneNumber,
                voipCarrier,
              },
            })
            .play({ url: welcomeSampleMedia, actionHook: "/call-controller/forwarding-hook" });
          return res.status(200).json(app);
        }
        if (isEnableRecord) {
          // enable recording.
          app.config({
            listen: {
              url: `${process.env.WEBSOCKET_URL}${process.env.WS_RECORD_PATH}`,
              mixType: "stereo",
              enable: true,
            },
          });
          // end record
        }
        if (isHangup) {
          if (!!welcomeSampleMedia) {
            app.play({ url: welcomeSampleMedia });
          }
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
              queueTimeout,
            },
          })
          .play({ url: welcomeSampleMedia, actionHook: "/call-controller/call-hook" })
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
          fallOverMediaUrl: voicemailSampleMedia,
          fallOverTimeout: voicemailTimeout * 1000,
          timeoutMediaUrl: timeoutSampleMedia,
          queueMediaUrl: queueSampleMedia,
          queueTimeout: queueTimeout,
          isTriggerQueueMedia: false,
          isWelcomeMedia,
          groupCallSetting,
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
      const { ani = "", to, conferencename, carrier, userid } = headers;
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
      // toUser.trunk = "Twilio-test8";
      const carrierName = await this.jambonzService.getCarrierName(carrier);
      toUser.trunk = carrierName;
      const app = new WebhookResponse();
      let uniqNameConference = conferencename;
      if (!conferencename) uniqNameConference = getUniqConferenceName();
      // app
      //   .config({
      //     listen: {
      //       url: `${process.env.WEBSOCKET_URL}${process.env.WS_RECORD_PATH}`,
      //       mixType: "stereo",
      //       enable: true,
      //     },
      //   })
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
        callerUserId: userid,
      };

      await this.callControllerService.setCallLogToRedis(uniqNameConference, initCallLog, null);

      res.status(200).json(app);
      const log = await this.client.calls.create({
        from: fromDid.replace(/[+\s]/g, ""),
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
      const { from, to, uniqNameConference, headers = {}, carrier } = req.body;
      const carrierName = await this.jambonzService.getCarrierName(carrier);
      let destination = to;
      destination.trunk = carrierName;
      const log = await this.client.calls.create({
        from,
        to: destination,
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
      const members = currentCallLog?.members || [];
      const updateMemberList = members;
      if (call_sid === currentCallLog?.masterCallId) {
        await this.callControllerService.setCallLogToRedis(conferenceName, { isMute: conf_mute_status === "mute" }, currentCallLog);
        const updatedLog = { ...currentCallLog, isMute: conf_mute_status === "mute" };
        const sendResponse = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log: updatedLog });
      } else {
        updateMemberList.forEach(member => {
          if (member.callId === call_sid) {
            member.isMute = conf_mute_status === "mute";
          }
        });
        const updatedLog = { ...currentCallLog, members: updateMemberList };
        const sendResponse = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log: updatedLog });
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

    if (isMasterCall) {
      const allCallIdInCall = [];

      const members = currentCallLog?.members || [];
      members.forEach(member => {
        if (member?.status === LegMemberStatus.join || member?.status === LegMemberStatus.calling) {
          allCallIdInCall.push(member?.callId);
        }
      });
      allCallIdInCall.push(currentCallLog?.masterCallId);
      const status = await this.callControllerService.endAllRingingCall(allCallIdInCall);
      await this.callControllerService.setCallLogToRedis(conferenceName, { isCallerLeft: true }, currentCallLog);
      const updatedLog = { ...currentCallLog, isCallerLeft: true };
      const sendResponse = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log: updatedLog });
      return res.status(202).json({ status: status });
    } else {
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
            return res.status(response?.status).json({ status: response?.status });
          } catch (error) {
            return res.sendStatus(500);
          }
        }
        return res.sendStatus(500);
      }
    }
  }
  // hook
  @Post("gather-dtmf-hook")
  async gatherDtmfHook(@Req() req: Request, @Res() res: Response): Promise<any> {
    const app = new WebhookResponse();
    const { body } = req;
    const { customerData, digits, call_sid } = body;
    const { timeoutData, failoverData, actionData, listenDtmf, timeout = 45 } = customerData.ivrData;
    console.log("🚀 ~ file: call-controller.controller.ts:461 ~ CallControllerController ~ gatherDtmfHook ~ timeoutData:", timeoutData);
    console.log("🚀 ~ file: call-controller.controller.ts:461 ~ CallControllerController ~ gatherDtmfHook ~ failoverData:", failoverData);
    const { uniqNameConference, from, conversationId, groupId, userId, groupCallSetting } = customerData;
    const allDtmf = listenDtmf.map(item => item.toString());
    const isDtmfInListenList = allDtmf.includes(digits);
    console.log("🚀 ~ file: call-controller.controller.ts:465 ~ CallControllerController ~ gatherDtmfHook ~ isDtmfInListenList:", isDtmfInListenList);
    if (!isDtmfInListenList) {
      const { failoverMedia } = failoverData;
      app
        .tag({ data: { failoverData, confUniqueName: uniqNameConference, conversationId, groupId, callerNumber: from } })
        .play({
          url: "https://smartonhold.com.au/wp-content/uploads/2021/11/FEMALE-DEMO-1-Monica-Devine-5-11-21.mp3",
          actionHook: "/call-controller/ivr-failover-call-hook",
        })
        .conference({
          name: uniqNameConference,
          statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
          statusHook: "/call-controller/conference-status-ivr",
          startConferenceOnEnter: true,
          endConferenceOnExit: true,
        });
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
        isEnableFallOver: false,
        fallOverMediaUrl: "",
        fallOverTimeout: 0,
        timeoutMediaUrl: "",
        queueMediaUrl: "",
        queueTimeout: 0,
        isTriggerQueueMedia: false,
        isWelcomeMedia: false,
        groupCallSetting,
        ivrTimeoutData: timeoutData,
        groupId,
        callerNumber: from,
      };
      await this.callControllerService.setCallLogToRedis(uniqNameConference, initCallLog, null);
      return res.status(200).json(app);
    }
    const dtmfToIvr = actionData[digits];
    console.log("🚀 ~ file: call-controller.controller.ts:512 ~ CallControllerController ~ gatherDtmfHook ~ dtmfToIvr:", dtmfToIvr.userId);
    if (dtmfToIvr.isHangup) {
      app.play({ url: "https://smartonhold.com.au/wp-content/uploads/2021/11/FEMALE-DEMO-1-Monica-Devine-5-11-21.mp3" });
      return res.status(200).json(app);
    }
    if (dtmfToIvr.isForward) {
      app.tag({ data: dtmfToIvr }).play({
        url: "https://smartonhold.com.au/wp-content/uploads/2021/11/FEMALE-DEMO-1-Monica-Devine-5-11-21.mp3",
        actionHook: "/call-controller/dtmf-forward-call-hook",
      });
      return res.status(200).json(app);
    }
    app
      .tag({ data: { dtmfToIvr, from, conversationId, groupId, userId, uniqNameConference } })
      .play({ url: "https://smartonhold.com.au/wp-content/uploads/2021/11/FEMALE-DEMO-1-Monica-Devine-5-11-21.mp3", actionHook: "/call-controller/dtmf-invite-call-hook" })
      .conference({
        name: uniqNameConference,
        statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
        statusHook: "/call-controller/conference-status-ivr",
        startConferenceOnEnter: true,
        endConferenceOnExit: true,
      });
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
      isEnableFallOver: false,
      fallOverMediaUrl: "",
      fallOverTimeout: 0,
      timeoutMediaUrl: "",
      queueMediaUrl: "",
      queueTimeout: 0,
      isTriggerQueueMedia: false,
      isWelcomeMedia: false,
      groupCallSetting,
      ivrTimeoutData: timeoutData,
      groupId,
      callerNumber: from,
    };
    await this.callControllerService.setCallLogToRedis(uniqNameConference, initCallLog, null);

    return res.status(200).json(app);
  }

  @Post("dtmf-forward-call-hook")
  async dtmfForwardCallHook(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { customerData, digits, call_sid } = req.body;
    const { fromNumber, memberNeedToCall } = customerData;
    const app = new WebhookResponse();
    app.dial({
      callerId: fromNumber,
      answerOnBridge: true,
      target: [
        {
          type: MemberType.EXTERNAL_PHONE,
          number: memberNeedToCall[0]?.number.replace(/[^0-9+]/g, ""),
          trunk: memberNeedToCall[0]?.trunk,
        },
      ],
    });
    return res.status(200).json(app);
  }

  @Post("dtmf-invite-call-hook")
  async dtmfInviteCallHook(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { customerData } = req.body;
    const { dtmfToIvr, from, conversationId, groupId, userId, uniqNameConference } = customerData;
    const callList = _.uniqBy(dtmfToIvr.memberNeedToCall, "name");
    Promise.all(
      callList.map(async (member: ITypeOfToUser) => {
        const userIdList = [];
        dtmfToIvr?.userId.forEach(user => {
          const id = user[member.name];
          if (id) userIdList.push(id);
        });
        const callRingingSid = await this.client.calls.create({
          from,
          to: member,
          call_hook: {
            url: `${process.env.BACKEND_URL}/call-controller/ivr-person-join-conference/${uniqNameConference}`,
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
          timeout: 45,
          headers: {
            conversationId,
            conferenceName: uniqNameConference,
            groupId,
            isRequestJoinCall: false,
            parentSessionId: "",
            userId: userIdList,
          },
        });
      }),
    ).catch(err => {
      console.log("🚀 ~ file: call-controller.controller.ts:534 ~ CallControllerController ~ callHook ~ err:", err);
      res.sendStatus(503);
    });
    res.sendStatus(200);
  }

  @Post("conference-timeout-ivr-hook/:conferenceName")
  async conferenceTimeoutIvr(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { conferenceName } = req.params;
    const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(conferenceName);
    if (currentCallLog.isOneOfMemberAnswer) {
      return res.sendStatus(200);
    }
    const app = new WebhookResponse();
    const { ivrTimeoutData, confUniqueName, conversationId, callerNumber, groupId } = currentCallLog;
    // const option = {
    //   url: ivrTimeoutData.timeoutMedia,
    // };
    const option = {
      url: "https://smartonhold.com.au/wp-content/uploads/2023/07/Male-Demo-Rick-Davey.mp3",
      actionHook: "/call-controller/ivr-timeout-call-hook",
    };
    app
      .tag({ data: { ivrTimeoutData, confUniqueName, conversationId, callerNumber, groupId } })
      .play(option)
      .conference({
        name: confUniqueName,
        statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
        statusHook: "/call-controller/conference-status-ivr",
        startConferenceOnEnter: true,
        endConferenceOnExit: true,
      });
    res.status(200).json(app);
  }

  @Post("ivr-timeout-call-hook")
  async ivrTimeoutCallHook(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { customerData } = req.body;
    const { ivrTimeoutData, confUniqueName, conversationId, groupId, callerNumber } = customerData;
    if (ivrTimeoutData.timeoutMemberNeedToCall[0]?.type === MemberType.EXTERNAL_PHONE) {
      const app = new WebhookResponse();
      app.dial({
        callerId: ivrTimeoutData.fromNumber,
        answerOnBridge: true,
        target: [
          {
            type: MemberType.EXTERNAL_PHONE,
            number: ivrTimeoutData.timeoutMemberNeedToCall[0]?.number.replace(/[^0-9+]/g, ""),
            trunk: ivrTimeoutData.timeoutMemberNeedToCall[0]?.trunk,
          },
        ],
      });
      return res.status(200).json(app);
    }
    const callList = _.uniqBy(ivrTimeoutData.timeoutMemberNeedToCall, "name");
    Promise.all(
      callList.map(async (member: ITypeOfToUser) => {
        const userIdList = [];
        ivrTimeoutData?.timeoutUserId.forEach(user => {
          const id = user[member.name];
          if (id) userIdList.push(id);
        });
        const callRingingSid = await this.client.calls.create({
          from: callerNumber,
          to: member,
          call_hook: {
            url: `${process.env.BACKEND_URL}/call-controller/ivr-person-join-conference/${confUniqueName}`,
            method: "GET",
          },
          call_status_hook: {
            url: `${process.env.BACKEND_URL}/call-controller/call-status/${confUniqueName}`,
            method: "POST",
          },
          speech_synthesis_vendor: "google",
          speech_synthesis_language: "en-US",
          speech_synthesis_voice: "en-US-Standard-C",
          speech_recognizer_vendor: "google",
          speech_recognizer_language: "en-US",
          timeout: 45,
          headers: {
            conversationId,
            conferenceName: confUniqueName,
            groupId,
            isRequestJoinCall: false,
            parentSessionId: "",
            userId: userIdList,
          },
        });
        console.log("🚀 ~ file: call-controller.controller.ts:590 ~ CallControllerController ~ callList.map ~ callRingingSid:", callRingingSid);
      }),
    ).catch(err => {
      console.log("🚀 ~ file: call-controller.controller.ts:534 ~ CallControllerController ~ callHook ~ err:", err);
      res.sendStatus(503);
    });
    res.sendStatus(200);
  }

  @Post("ivr-failover-call-hook")
  async ivrFailoverCallHook(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { customerData } = req.body;
    const { failoverData, confUniqueName, conversationId, groupId, callerNumber } = customerData;
    console.log("🚀 ~ file: call-controller.controller.ts:739 ~ CallControllerController ~ ivrTimeoutCallHook ~ customerData:", confUniqueName);
    if (failoverData.failoverMemberNeedToCall[0]?.type === MemberType.EXTERNAL_PHONE) {
      const app = new WebhookResponse();
      app.dial({
        callerId: failoverData.fromNumber,
        answerOnBridge: true,
        target: [
          {
            type: MemberType.EXTERNAL_PHONE,
            number: failoverData.failoverMemberNeedToCall[0]?.number.replace(/[^0-9+]/g, ""),
            trunk: failoverData.failoverMemberNeedToCall[0]?.trunk,
          },
        ],
      });
      return res.status(200).json(app);
    }
    const callList = _.uniqBy(failoverData.failoverMemberNeedToCall, "name");
    Promise.all(
      callList.map(async (member: ITypeOfToUser) => {
        const userIdList = [];
        failoverData?.failoverUserId.forEach(user => {
          const id = user[member.name];
          if (id) userIdList.push(id);
        });
        const callRingingSid = await this.client.calls.create({
          from: callerNumber,
          to: member,
          call_hook: {
            url: `${process.env.BACKEND_URL}/call-controller/ivr-person-join-conference/${confUniqueName}`,
            method: "GET",
          },
          call_status_hook: {
            url: `${process.env.BACKEND_URL}/call-controller/call-status/${confUniqueName}`,
            method: "POST",
          },
          speech_synthesis_vendor: "google",
          speech_synthesis_language: "en-US",
          speech_synthesis_voice: "en-US-Standard-C",
          speech_recognizer_vendor: "google",
          speech_recognizer_language: "en-US",
          timeout: 45,
          headers: {
            conversationId,
            conferenceName: confUniqueName,
            groupId,
            isRequestJoinCall: false,
            parentSessionId: "",
            userId: userIdList,
          },
        });
        console.log("🚀 ~ file: call-controller.controller.ts:590 ~ CallControllerController ~ callList.map ~ callRingingSid:", callRingingSid);
      }),
    ).catch(err => {
      console.log("🚀 ~ file: call-controller.controller.ts:534 ~ CallControllerController ~ callHook ~ err:", err);
      res.sendStatus(503);
    });
    res.sendStatus(200);
  }

  @Get("ivr-person-join-conference/:conferenceName")
  async ivrPersonJoinConference(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { conferenceName } = req.params;
      const app = new WebhookResponse();
      // create unique name for conference
      app.conference({
        name: conferenceName,
        statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
        statusHook: "/call-controller/conference-status-ivr",
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
    // const url = [currentCallLog.queueMediaUrl, "https://bigsoundbank.com/UPLOAD/mp3/0917.mp3"];
    const option = {
      url: currentCallLog.queueMediaUrl,
      timeoutSecs: currentCallLog.queueTimeout,
      actionHook: "/call-controller/timeout-media-hook",
    };
    if (!currentCallLog.queueMediaUrl) {
      const silentOption = {
        url: "https://bigsoundbank.com/UPLOAD/mp3/0917.mp3",
        timeoutSecs: currentCallLog.queueTimeout,
        actionHook: "/call-controller/timeout-media-hook",
      };
      app.play(silentOption);
    } else {
      app.play(option);
    }
    const newData = { isTriggerQueueMedia: true };
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
    await this.callControllerService.updateMemberAndStateOfEndedConference(currentCallLog, { friendly_name: currentCallLog.confUniqueName, time: eventTime }, true, true);
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
    const { listMember = [], uniqNameConference, from, conversationId, groupId, userId, queueTimeout } = customerData;
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
          timeout: queueTimeout ? queueTimeout : 60,
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
    const { to, callForwardPhoneNumber, voipCarrier } = customerData;
    // const { outDialNumber = "17147520454", callerId = "+16164413854" } = req.body;
    const carrierName = await this.jambonzService.getCarrierName(voipCarrier);
    const app = new WebhookResponse();
    app.dial({
      callerId: to,
      answerOnBridge: true,
      target: [
        {
          type: MemberType.EXTERNAL_PHONE,
          number: callForwardPhoneNumber.replace(/[+\s]/g, ""),
          trunk: carrierName,
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
    const { listPhoneFirstInviteRinging = [] } = currentCallLog;
    const members = currentCallLog?.members || [];
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
        statusList: [LegMemberStatus.calling],
      };
      updateMemberList.push(memberData);
      if (!listPhoneFirstInviteRinging.includes(call_sid)) listPhoneFirstInviteRinging.push(call_sid);
      await this.callControllerService.setCallLogToRedis(conferenceName, { members: updateMemberList, listPhoneFirstInviteRinging }, currentCallLog);
      const updatedLog = { ...currentCallLog, ...{ members: updateMemberList, listPhoneFirstInviteRinging } };
      const response = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log: updatedLog });
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
        statusList: [LegMemberStatus.calling, LegMemberStatus.join],
      };
      updateMemberList.push(memberData);
    }
    if (call_status === CallStatus.no_answer || call_status === CallStatus.not_available) {
      updateMemberList.forEach((member: ILegMember) => {
        if (member.callId === call_sid) {
          if (call_status === CallStatus.not_available) {
            member.status = LegMemberStatus.not_available;
            member.statusList = [LegMemberStatus.calling, LegMemberStatus.not_available];
          } else {
            member.status = LegMemberStatus.no_answer;
            member.statusList = [LegMemberStatus.calling, LegMemberStatus.no_answer];
          }
        }
      });
    }
    if (call_status === CallStatus.completed) {
      updateMemberList.forEach((member: ILegMember) => {
        if (call_status === CallStatus.not_available) {
          member.status = LegMemberStatus.leave;
          member.statusList = [...member.statusList, LegMemberStatus.leave];
        }
      });
    }
    await this.callControllerService.setCallLogToRedis(conferenceName, { members: updateMemberList }, currentCallLog);
    const updatedLog = { ...currentCallLog, members: updateMemberList };
    const response = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log: updatedLog });
    return res.sendStatus(200);
  }

  @Post("conference-status")
  async conferenceStatus(@Req() req: Request, @Res() res: Response): Promise<any> {
    try {
      const { body } = req;
      const { conference_sid, event, members, friendly_name, call_sid, to, time, direction, duration } = body;
      console.log("🚀 ~ file: call-controller.controller.ts:686 ~ CallControllerController ~ conferenceStatus ~ body:", body);
      if (!event) return res.sendStatus(200);
      const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(friendly_name);
      const groupCallSetting = currentCallLog?.groupCallSetting;
      const callSettingDidNotHaveQueueMedia =
        groupCallSetting === GroupCallSettingRingingType.OTHER_GROUP ||
        groupCallSetting === GroupCallSettingRingingType.EXTERNAL_NUMBER ||
        groupCallSetting === GroupCallSettingRingingType.HANG_UP ||
        groupCallSetting === GroupCallSettingRingingType.A_ROLE_IN_GROUP ||
        groupCallSetting === GroupCallSettingRingingType.CALL_FORWARDING ||
        groupCallSetting === GroupCallSettingRingingType.IVR;
      const listPhoneFirstInviteRinging = currentCallLog?.listPhoneFirstInviteRinging || [];
      const isEnableQueueMedia = !!currentCallLog?.queueTimeout && currentCallLog?.isWelcomeMedia && !callSettingDidNotHaveQueueMedia;
      const isTriggerQueueMedia = currentCallLog?.isTriggerQueueMedia;
      const isEnableFallOver = currentCallLog?.isEnableFallOver;
      const isOutboundCall = currentCallLog?.isOutboundCall;
      const isMemberCall = call_sid !== currentCallLog?.masterCallId && direction === CallingType.OUTBOUND;
      const conferenceStatus = currentCallLog?.status;
      const isTriggeredQueueMediaOrNotEnable = (!isEnableQueueMedia || (isEnableQueueMedia && isTriggerQueueMedia)) && conferenceStatus !== ConfCallStatus.QUEUE;
      const callLegMembers = currentCallLog.members;
      const isCallerLeft = currentCallLog?.isCallerLeft;
      const isAllLegsMembersLeaveCall = callLegMembers.every((leg: ILegMember) => leg.status !== LegMemberStatus.join) || (members === 1 && isCallerLeft && isOutboundCall);
      const isOutboundCallEnded = isCallerLeft && isAllLegsMembersLeaveCall && isOutboundCall;
      const isLogEnded = (event === ConferenceType.LEAVE && members === 0) || event === ConferenceType.END || (members === 1 && isCallerLeft && !isOutboundCall);
      const isConferenceEnded = (isLogEnded && isTriggeredQueueMediaOrNotEnable) || isOutboundCallEnded;

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
        if (!isOutboundCall && isEnableQueueMedia && isTriggerQueueMedia) await this.callControllerService.removeQueueMedia(currentCallLog?.masterCallId, friendly_name);
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
        await this.callControllerService.updateMemberAndStateOfEndedConference(currentCallLog, body, isEnableQueueMedia, false);
      }
      const updatedLog = await this.callControllerService.getCallLogOfCall(friendly_name);
      const response = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log: updatedLog });
      return res.sendStatus(200);
    } catch (error) {
      console.log("🚀 ~ file: call-controller.controller.ts:362 ~ CallControllerController ~ conferenceStatus ~ error:", error);
      res.sendStatus(503);
    }
  }

  @Post("conference-status-ivr")
  async conferenceStatusIVR(@Req() req: Request, @Res() res: Response): Promise<any> {
    const { body } = req;
    const { conference_sid, event, members, friendly_name, call_sid, to, time, direction, duration } = body;
    if (!event) return res.sendStatus(200);
    const currentCallLog: IConfCall = await this.callControllerService.getCallLogOfCall(friendly_name);
    const listPhoneFirstInviteRinging = currentCallLog?.listPhoneFirstInviteRinging || [];
    await this.callControllerService.updateListMemberOfConference(currentCallLog, body);
    if (event === ConferenceType.START) {
      await this.callControllerService.triggerTimeoutActionIvr(currentCallLog, body);
    }
    if (event === ConferenceType.JOIN && members > 1) {
      clearTimeout(currentCallLog.ivrTimeoutSid);
      this.callControllerService.removeAndClearTimeoutIvr(currentCallLog.ivrTimeoutSid);
      const newestData = await this.callControllerService.getCallLogOfCall(friendly_name);
      await this.callControllerService.reMappingMemberList(newestData, body);
      if (listPhoneFirstInviteRinging.includes(call_sid)) {
        await this.callControllerService.endCallOfFirstInviteMemberAndUpdateListMember(currentCallLog, body);
      }
    }
    if (event === ConferenceType.END || (event === ConferenceType.LEAVE && members === 0)) {
      if (currentCallLog.ivrTimeoutSid) {
        clearTimeout(currentCallLog.ivrTimeoutSid);
        this.callControllerService.removeAndClearTimeoutIvr(currentCallLog.ivrTimeoutSid);
      }
      await this.callControllerService.updateMemberAndStateOfEndedConference(currentCallLog, body, false, false);
    }
    const updatedLog = await this.callControllerService.getCallLogOfCall(friendly_name);
    const response = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log: updatedLog });
    return res.sendStatus(200);
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
