import { Inject, Injectable } from "@nestjs/common";
import { CallStatus, CallType, ConfCallStatus, ConferenceType, GroupCallSettingRingingType, LegMemberStatus, MemberType } from "src/enums/enum";
import { IConfCall, ILegMember, ITypeOfToUser } from "src/types/type";
const jambonz = require("@jambonz/node-client");
import axios from "axios";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
var _ = require("lodash");
import { Cache } from "cache-manager";
import { Timer } from "./../utils/Timer";
import { getNameOfEmail, isPhoneNumberOrSIP } from "src/utils/until";
import { JambonzService } from "src/jambonz/jambonz.service";

@Injectable()
export class CallControllerService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache, private jambonzService: JambonzService) {}
  private client: any = jambonz(process.env.JAMBONZ_ACCOUNT_SID, process.env.JAMBONZ_API_KEY, {
    baseUrl: process.env.JAMBONZ_REST_API_BASE_URL,
  });
  private fallOverTimeOutList = {};
  private ivrTimeOutList = {};
  private expiredTime = 3 * Timer.month;

  async endAllRingingCall(callSids: string[]): Promise<any> {
    if (callSids.length === 0) return false;
    let isSuccess = true;
    try {
      await Promise.all(
        callSids.map(async (callSid: string) => {
          try {
            const response = await axios.put(
              `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${callSid}`,
              { call_status: "no-answer" },
              {
                headers: {
                  Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
                },
              },
            );
          } catch (err) {
            if (err?.response?.status === 422) {
              try {
                const response = await axios.put(
                  `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${callSid}`,
                  { call_status: "completed" },
                  {
                    headers: {
                      Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
                    },
                  },
                );
              } catch (error) {
                if (error?.response?.status === 422) {
                  console.log("🚀 ~ file: call-controller.service.ts:50 ~ CallControllerService ~ callSids.map ~ error?.status:", error?.response?.status);
                  isSuccess = false;
                }
                console.log("🚀 ~ file: call-controller.service.ts:48 ~ CallControllerService ~ callSids.map ~ error:", error?.response?.status);
                isSuccess = false;
              }
            }
          }
        }),
      );
      return isSuccess;
    } catch (error) {
      console.log("🚀 ~ file: call-controller.service.ts:40 ~ CallControllerService ~ endAllRingingCall ~ error:", error);
      return false;
    }
  }

  pushTimeOut = (timeout: any, masterCallId: string) => {
    return (this.fallOverTimeOutList[masterCallId] = timeout);
  };

  pushTimeOutIvr = (timeout: any, masterCallId: string) => {
    return (this.ivrTimeOutList[masterCallId] = timeout);
  };

  removeAndClearTimeout = (masterCallId: string) => {
    clearTimeout(this.fallOverTimeOutList[masterCallId]);
    const newList = _.omit(this.fallOverTimeOutList, [masterCallId]);
    return this.setFallOverTimeOutList(newList);
  };

  removeAndClearTimeoutIvr = (masterCallId: string) => {
    clearTimeout(this.ivrTimeOutList[masterCallId]);
    const newList = _.omit(this.ivrTimeOutList, [masterCallId]);
    return this.setFallOverTimeOutListIvr(newList);
  };

  setFallOverTimeOutList = (fallOverTimeOutList: []) => {
    return (this.fallOverTimeOutList = fallOverTimeOutList);
  };

  setFallOverTimeOutListIvr = (ivrTimeOutList: []) => {
    return (this.ivrTimeOutList = ivrTimeOutList);
  };

  setCallLogToRedis = async (callLogKey: string, newCallLog: any, currentCallLog: IConfCall) => {
    if (currentCallLog) {
      return this.cacheManager.set(`${process.env.REDIS_CALL_SERVER_PREFIX}-${callLogKey}`, { ...currentCallLog, ...newCallLog }, this.expiredTime);
    }
    return this.cacheManager.set(`${process.env.REDIS_CALL_SERVER_PREFIX}-${callLogKey}`, newCallLog, this.expiredTime);
  };

  getCallLogOfCall = async (callLogKey: string) => {
    const result: IConfCall = await this.cacheManager.get(`${process.env.REDIS_CALL_SERVER_PREFIX}-${callLogKey}`);
    return result;
  };

  getCallSettings = async (callSettingData: any, to: string) => {
    const memberNeedToCall = [];
    let welcomeMedia = "";
    let queueMedia = "";
    let timeoutMedia = "";
    let queueTimeout = 45;
    let voicemailTimeout = 60;
    let voicemailMedia = "";
    let fromNumber: string;
    let isHangup = false;
    let isEnableVoiceMail = false;
    let isForwardCall = false;
    let callForwardPhoneNumber = "";
    const ivrData: any = {};
    let isIVR = false;
    let userIds = [];

    const userId = [];
    try {
      const {
        type,
        call_setting_forward_phone,
        external_number,
        call_setting_member_id,
        group,
        call_setting_welcome_media,
        queue_settings,
        call_setting_role,
        other_group,
        owner,
        call_setting_auto_record,
        IVR,
      } = callSettingData;
      const voipCarrier = owner?.voip_carrier;
      const carrierName = await this.jambonzService.getCarrierName(voipCarrier);
      const { members = [] } = group;
      const memberInOtherGroup = other_group?.members;
      const groupCallSetting = type;

      switch (type) {
        case GroupCallSettingRingingType.IVR: {
          isIVR = true;
          const { ivr_timeout_seconds = 45, ivr_listen_dtmf, ivr_welcome_media, failover, timeout, action = [] } = IVR[0];
          if (ivr_welcome_media) {
            ivrData.welcomeMedia = ivr_welcome_media;
          }
          //time out
          const timeoutData = this.handleTimeoutDataIvr(timeout, carrierName, to);
          const failoverData = this.handleFailoverDataIvr(failover, carrierName, to);
          const actionData = this.handleDataActionIvr(action, carrierName, owner, to);
          ivrData.timeoutData = timeoutData;
          ivrData.failoverData = failoverData;
          ivrData.actionData = actionData;
          ivrData.listenDtmf = ivr_listen_dtmf;
          ivrData.timeout = ivr_timeout_seconds || 45;
          break;
        }
        case GroupCallSettingRingingType.HANG_UP: {
          //pass

          isHangup = true;
          if (call_setting_welcome_media) {
            welcomeMedia = call_setting_welcome_media;
          }
          break;
        }
        case GroupCallSettingRingingType.CALL_FORWARDING: {
          //pass
          fromNumber = external_number.ani;
          callForwardPhoneNumber = call_setting_forward_phone;
          if (call_setting_welcome_media) {
            welcomeMedia = call_setting_welcome_media;
          }
          isForwardCall = true;
          break;
        }
        case GroupCallSettingRingingType.EXTERNAL_NUMBER: {
          // pass
          memberNeedToCall.push({
            type: MemberType.EXTERNAL_PHONE,
            number: external_number.phone_number.replace(/[\s+]/g, ""),
            trunk: carrierName,
          });
          fromNumber = external_number.ani.replace(/[\s+]/g, "");
          if (call_setting_welcome_media) {
            welcomeMedia = call_setting_welcome_media;
          }
          break;
        }
        case GroupCallSettingRingingType.MEMBER: {
          // pass
          members.forEach(member => {
            if (call_setting_member_id.includes(member.id)) {
              userIds.push(member.id);
              const { email } = member;
              const sipName = getNameOfEmail(email);
              if (!!sipName) {
                memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
                memberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
                const user = {};
                user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = member.id;
                userId.push(user);
              }
            }
          });
          if (call_setting_welcome_media) {
            welcomeMedia = call_setting_welcome_media;
            queueMedia = queue_settings.queue_media;
            timeoutMedia = queue_settings.timeout_media;
            queueTimeout = queue_settings.queue_timeout;
            voicemailTimeout = queue_settings.voicemail_timeout;
            voicemailMedia = queue_settings.voicemail_media;
            isEnableVoiceMail = queue_settings.isVoiceMail;
          }
          break;
        }
        case GroupCallSettingRingingType.A_ROLE_IN_GROUP: {
          // pass
          members.forEach(member => {
            const { roles } = member;
            if (roles.includes(call_setting_role)) {
              const { email } = member;
              userIds.push(member.id);
              const sipName = getNameOfEmail(email);
              if (!!sipName) {
                memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
                memberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
                const user = {};
                user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = member.id;
                userId.push(user);
              }
            }
          });
          if (call_setting_welcome_media) {
            welcomeMedia = call_setting_welcome_media;
          }
          break;
        }
        case GroupCallSettingRingingType.GROUP: {
          // pass
          userIds = members.map(item => item.id);
          members.forEach(member => {
            const { email } = member;
            const sipName = getNameOfEmail(email);
            if (!!sipName) {
              memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
              memberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
              const user = {};
              user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = member.id;
              userId.push(user);
            }
          });
          if (call_setting_welcome_media) {
            welcomeMedia = call_setting_welcome_media;
            queueMedia = queue_settings.queue_media;
            timeoutMedia = queue_settings.timeout_media;
            queueTimeout = queue_settings.queue_timeout;
            voicemailTimeout = queue_settings.voicemail_timeout;
            voicemailMedia = queue_settings.voicemail_media;
            isEnableVoiceMail = queue_settings.isVoiceMail;
          }
          break;
        }
        case GroupCallSettingRingingType.OTHER_GROUP: {
          // pass
          userIds = memberInOtherGroup.map(item => item.id);
          memberInOtherGroup.forEach(member => {
            const { email } = member;
            const sipName = getNameOfEmail(email);
            if (!!sipName) {
              memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
              memberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
              const user = {};
              user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = member.id;
              userId.push(user);
            }
          });

          if (call_setting_welcome_media) {
            welcomeMedia = call_setting_welcome_media;
            isEnableVoiceMail = queue_settings.isVoiceMail;
          }
          break;
        }
        case GroupCallSettingRingingType.MEMBER_AUTO_ASSIGN: {
          members.forEach(member => {
            if (member.auto_assign) {
              userIds.push(member.id);
              const { email } = member;
              const sipName = getNameOfEmail(email);
              if (!!sipName) {
                memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
                memberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
                const user = {};
                user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = member.id;
                userId.push(user);
              }
            }
          });
          if (call_setting_welcome_media) {
            welcomeMedia = call_setting_welcome_media;
            queueMedia = queue_settings.queue_media;
            timeoutMedia = queue_settings.timeout_media;
            queueTimeout = queue_settings.queue_timeout;
            voicemailTimeout = queue_settings.voicemail_timeout;
            voicemailMedia = queue_settings.voicemail_media;
            isEnableVoiceMail = queue_settings.isVoiceMail;
          }
          break;
        }
        case GroupCallSettingRingingType.OWNER: {
          // if (owner) {
          userIds.push(owner.id);
          const { email } = owner;
          const sipName = getNameOfEmail(email);
          if (!!sipName) {
            memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
            memberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
            const user = {};
            user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = owner.id;
            userId.push(user);
          }
          // } else {
          //   members.forEach(member => {
          //     const { email } = member;
          //     const sipName = getNameOfEmail(email);
          //     if (!!sipName) {
          //       memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
          //       const user = {};
          //       user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = member.id;
          //       userId.push(user);
          //     }
          //   });
          // }
          if (call_setting_welcome_media) {
            welcomeMedia = call_setting_welcome_media;
            queueMedia = queue_settings.queue_media;
            timeoutMedia = queue_settings.timeout_media;
            queueTimeout = queue_settings.queue_timeout;
            voicemailTimeout = queue_settings.voicemail_timeout;
            voicemailMedia = queue_settings.voicemail_media;
            isEnableVoiceMail = queue_settings.isVoiceMail;
          }
          break;
        }
        default:
          break;
      }

      return {
        welcomeMedia,
        queueMedia,
        timeoutMedia,
        voicemailMedia,
        queueTimeout,
        voicemailTimeout,
        fromNumber,
        isHangup,
        memberNeedToCall,
        userId,
        isEnableRecord: call_setting_auto_record,
        isEnableVoiceMail,
        isForwardCall,
        callForwardPhoneNumber,
        isWelcomeMedia: !!call_setting_welcome_media,
        voipCarrier,
        groupCallSetting,
        isIVR,
        ivrData,
        userIds,
      };
    } catch (error) {
      console.log("🚀 ~ file: call-controller.service.ts:271 ~ error:", error);
      return {};
    }
  };

  enableQueueMedia = async (currentCallLog: IConfCall, jambonzLog: any) => {
    console.log("🚀 ~ file: call-controller.service.ts:280 ~ CallControllerService ~ enableQueueMedia= ~ currentCallLog:", currentCallLog);
    const { call_sid, friendly_name, time } = jambonzLog;
    const newData = { fallOverTimeOutSid: "", masterCallId: call_sid, status: ConfCallStatus.QUEUE, eventTime: time };
    try {
      await axios.put(
        `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
        { call_hook: `${process.env.BACKEND_URL}/call-controller/queue-hook/${currentCallLog.confUniqueName}` },
        {
          headers: {
            Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
          },
        },
      );
      return this.setCallLogToRedis(friendly_name, newData, currentCallLog);
    } catch (error) {
      console.log("🚀 ~ file: call-controller.service.ts:289 ~ enableQueueMedia= ~ error:", error);
    }
  };

  removeQueueMedia = async (masterCallId: string, conferenceName: string) => {
    try {
      await axios
        .put(
          `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${masterCallId}`,
          { call_hook: `${process.env.BACKEND_URL}/call-controller/rejoin-hook/${conferenceName}` },
          {
            headers: {
              Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
            },
          },
        )
        .catch(err => {
          console.log("🚀 ~ file: call-controller.service.ts:272 ~ CallControllerService ~ removeQueueMedia= ~ err:", err);
          return;
        });
    } catch (error) {
      console.log("🚀 ~ file: call-controller.service.ts:312 ~ removeQueueMedia= ~ error:", error);
    }
  };

  updateListMemberOfConference = async (currentCallLog: IConfCall, jambonzLog: any) => {
    const { call_sid, event, friendly_name, time, members } = jambonzLog;
    const newMembers = currentCallLog?.members || [];
    newMembers.forEach((m: ILegMember) => {
      if (call_sid === m.callId) {
        m.status = LegMemberStatus[event];
        m.statusList = [...m.statusList, LegMemberStatus[event]];
        m.eventTime = time;
      }
    });
    const prevStatusConf = currentCallLog?.status;
    const prevIsOneOfMemberAnswer = currentCallLog?.isOneOfMemberAnswer;
    const newData = {
      // members: newMembers,
      currentMemberInConf: members,
      masterCallId: currentCallLog?.masterCallId,
      isOneOfMemberAnswer: currentCallLog?.isOneOfMemberAnswer,
      status: currentCallLog?.status,
    };
    if (members >= 2 && prevStatusConf === ConfCallStatus.CREATED && prevIsOneOfMemberAnswer === false) {
      newData.isOneOfMemberAnswer = true;
      newData.status = ConfCallStatus.START;
    }
    if (!currentCallLog?.masterCallId) newData.masterCallId = call_sid;
    await this.setCallLogToRedis(friendly_name, newData, currentCallLog);
    return;
  };

  triggerFallOverTimeoutWithoutQueueMedia = async (currentCallLog: IConfCall, jambonzLog: any) => {
    try {
      const { call_sid, friendly_name, time } = jambonzLog;
      const newData = { fallOverTimeOutSid: "", masterCallId: call_sid, status: ConfCallStatus.START, eventTime: time };
      const timeoutFallOverFunc = setTimeout(async () => {
        const test = await axios.put(
          `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
          { call_hook: `${process.env.BACKEND_URL}/call-controller/conference-wait-hook/${friendly_name}` },
          {
            headers: {
              Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
            },
          },
        );
      }, currentCallLog?.fallOverTimeout);
      this.pushTimeOut(timeoutFallOverFunc, call_sid);
      newData.fallOverTimeOutSid = call_sid;
      return this.setCallLogToRedis(friendly_name, newData, currentCallLog);
    } catch (error) {
      console.log("🚀 ~ file: call-controller.service.ts:342 ~ CallControllerService ~ triggerFallOverTimeoutWithoutQueueMedia= ~ error:", error);
    }
  };

  reMappingMemberList = async (currentCallLog: IConfCall, jambonzLog: any) => {
    const { call_sid, to, time, members, friendly_name } = jambonzLog;
    const currentMembers = currentCallLog.members;
    const currentMemberCallSids = currentMembers.map((m: ILegMember) => m.callId);
    if (!currentMemberCallSids.includes(call_sid)) {
      currentMembers.push({
        callId: call_sid,
        type: isPhoneNumberOrSIP(to) === MemberType.SIP_USER ? MemberType.USER : MemberType.EXTERNAL_PHONE,
        status: LegMemberStatus.join,
        value: to,
        eventTime: time,
        statusList: [LegMemberStatus.calling, LegMemberStatus.join],
      });
      const newData = { members: currentMembers, currentMemberInConf: members };
      await this.setCallLogToRedis(friendly_name, newData, currentCallLog);
      return;
    }
  };

  endCallOfFirstInviteMemberAndUpdateListMember = async (currentCallLog: IConfCall, jambonzLog: any) => {
    try {
      const { members, friendly_name, call_sid, time } = jambonzLog;
      const listPhoneFirstInviteRinging = currentCallLog?.listPhoneFirstInviteRinging || [];
      if (!currentCallLog.isOutboundCall || currentCallLog?.callType === CallType.live_chat) {
        const membersList = currentCallLog?.members || [];
        const endCallList = membersList.filter(call => listPhoneFirstInviteRinging.includes(call.callId) && call.callId !== call_sid && call.status === LegMemberStatus.calling);
        const endCallListIds = endCallList.map(item => item.callId);
        await this.endAllRingingCall(endCallListIds);
        const currentMembers = currentCallLog.members;
        currentMembers.forEach((member: ILegMember) => {
          if (endCallListIds.includes(member.callId)) {
            if (member.status !== LegMemberStatus.no_answer && member.status !== LegMemberStatus.not_available) {
              member.status = LegMemberStatus.leave;
              member.statusList = [...member.statusList, LegMemberStatus.leave];
              member.eventTime = time;
            }
          }
        });
        const newData = { fallOverTimeOutSid: null, currentMemberInConf: members, members: currentMembers };
        await this.setCallLogToRedis(friendly_name, newData, currentCallLog);
      } else {
        const newData = { fallOverTimeOutSid: null, currentMemberInConf: members };
        await this.setCallLogToRedis(friendly_name, newData, currentCallLog);
        return;
      }
    } catch (error) {
      console.log("🚀 ~ file: call-controller.service.ts:381 ~ CallControllerService ~ endCallOfFirstInviteMemberAndUpdateListMember= ~ error:", error);
    }
  };

  updateMemberAndStateOfEndedConference = async (currentCallLog: IConfCall, jambonzLog: any, isEnableQueueMedia: boolean, fromQueueHook: boolean) => {
    if (!isEnableQueueMedia || (isEnableQueueMedia && fromQueueHook)) {
      const { friendly_name, time, duration } = jambonzLog;
      const filterRingingCallSid = currentCallLog.members.filter((member: ILegMember) => member.status === LegMemberStatus.calling).map((member: ILegMember) => member.callId);
      await this.endAllRingingCall(filterRingingCallSid);
      const currentMembers = currentCallLog.members;
      currentMembers.forEach((member: ILegMember) => {
        member.status = LegMemberStatus.leave;
        member.statusList = [...member.statusList, LegMemberStatus.leave];
        member.eventTime = time;
      });
      const newData = { status: ConfCallStatus.END, members: currentMembers, fallOverTimeOutSid: null, currentMemberInConf: 0, eventTime: time, duration };
      await this.setCallLogToRedis(friendly_name, newData, currentCallLog);
      await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/voice-log`, { log: { ...currentCallLog, ...newData } });
      return;
    }
  };

  handleTimeoutDataIvr = (timeoutData, carrierName, to) => {
    const timeoutHandle: any = {};
    const timeoutMemberNeedToCall = [];
    const timeoutUserId = [];
    const { timeout_media, timeout_action, timeout_external_number, timeout_other_group, timeout_member, member } = timeoutData;
    if (timeout_media) {
      timeoutHandle.timeoutMedia = timeout_media;
    }
    if (timeout_action === GroupCallSettingRingingType.EXTERNAL_NUMBER) {
      timeoutMemberNeedToCall.push({ type: MemberType.EXTERNAL_PHONE, number: timeout_external_number.replace(/[\s+]/g, ""), trunk: carrierName });
      timeoutHandle.fromNumber = to.replace(/[\s+]/g, "");
    }
    if (timeout_action === GroupCallSettingRingingType.MEMBER) {
      member.forEach(member => {
        if (timeout_member.includes(member.id)) {
          const { email } = member;
          const sipName = getNameOfEmail(email);
          if (!!sipName) {
            timeoutMemberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
            timeoutMemberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
            let user = {};
            user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = member.id;
            timeoutUserId.push(user);
          }
        }
      });
    }
    if (timeout_action === GroupCallSettingRingingType.OTHER_GROUP) {
      const timeoutMemberInOtherGroup = timeout_other_group.members;
      timeoutMemberInOtherGroup.forEach(member => {
        const { email } = member;
        const sipName = getNameOfEmail(email);
        if (!!sipName) {
          timeoutMemberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
          timeoutMemberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
          let user = {};
          user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = member.id;
          timeoutUserId.push(user);
        }
      });
    }
    timeoutHandle.timeoutMemberNeedToCall = timeoutMemberNeedToCall;
    timeoutHandle.timeoutUserId = timeoutUserId;
    return timeoutHandle;
  };

  handleFailoverDataIvr = (failoverData, carrierName, to) => {
    const failoverHandle: any = {};
    const failoverMemberNeedToCall = [];
    const failoverUserId = [];
    const { failover_media, failover_action, failover_external_number, failover_other_group, failover_member, member } = failoverData;
    if (failover_media) {
      failoverHandle.failoverMedia = failover_media;
    }
    if (failover_action === GroupCallSettingRingingType.EXTERNAL_NUMBER) {
      failoverMemberNeedToCall.push({ type: MemberType.EXTERNAL_PHONE, number: failover_external_number.replace(/[\s+]/g, ""), trunk: carrierName });
      failoverHandle.fromNumber = to.replace(/[\s+]/g, "");
    }
    if (failover_action === GroupCallSettingRingingType.MEMBER) {
      member.forEach(member => {
        if (failover_member.includes(member.id)) {
          const { email } = member;
          const sipName = getNameOfEmail(email);
          if (!!sipName) {
            failoverMemberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
            failoverMemberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
            let user = {};
            user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = member.id;
            failoverUserId.push(user);
          }
        }
      });
    }
    if (failover_action === GroupCallSettingRingingType.OTHER_GROUP) {
      const failoverMemberInOtherGroup = failover_other_group.members;
      failoverMemberInOtherGroup.forEach(member => {
        const { email } = member;
        const sipName = getNameOfEmail(email);
        if (!!sipName) {
          failoverMemberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
          failoverMemberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
          let user = {};
          user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = member.id;
          failoverUserId.push(user);
        }
      });
    }
    failoverHandle.failoverMemberNeedToCall = failoverMemberNeedToCall;
    failoverHandle.failoverUserId = failoverUserId;
    return failoverHandle;
  };

  handleDataActionIvr = (action, carrierName, ownerData, to) => {
    const ivrData: any = {};
    action.forEach(actionData => {
      const { DMTF } = actionData;
      const dmtf = {
        welcomeMedia: "",
        memberNeedToCall: [],
        userId: [],
        fromNumber: "",
        isHangup: false,
        isForward: false,
      };
      dmtf.welcomeMedia = actionData[`ivr_dtmf_${DMTF}_welcome_media`];
      const type = actionData[`ivr_dtmf_${DMTF}_type`];
      switch (type) {
        case GroupCallSettingRingingType.OWNER: {
          const { email } = ownerData;
          const sipName = getNameOfEmail(email);
          if (!!sipName) {
            dmtf.memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
            dmtf.memberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
            let user = {};
            user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = ownerData.id;
            dmtf.userId.push(user);
          }
          ivrData[DMTF] = dmtf;
          break;
        }
        case GroupCallSettingRingingType.MEMBER: {
          const { member } = actionData;
          const call_setting_member_id = actionData[`ivr_dtmf_${DMTF}_member_id`];
          member.forEach(m => {
            if (call_setting_member_id.includes(m.id)) {
              const { email } = m;
              const sipName = getNameOfEmail(email);
              if (!!sipName) {
                dmtf.memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
                dmtf.memberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
                let user = {};
                user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = m.id;
                dmtf.userId.push(user);
              }
            }
          });
          ivrData[DMTF] = dmtf;
          break;
        }
        case GroupCallSettingRingingType.GROUP: {
          const { members } = actionData[`ivr_dtmf_${DMTF}_group_id`];
          members.forEach(m => {
            const { email } = m;
            const sipName = getNameOfEmail(email);
            if (!!sipName) {
              dmtf.memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
              dmtf.memberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
              let user = {};
              user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = m.id;
              dmtf.userId.push(user);
            }
          });
          ivrData[DMTF] = dmtf;
          break;
        }
        case GroupCallSettingRingingType.OTHER_GROUP: {
          const { members } = actionData[`ivr_dtmf_${DMTF}_other_group_id`];
          members.forEach(member => {
            const { email } = member;
            const sipName = getNameOfEmail(email);
            if (!!sipName) {
              dmtf.memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
              dmtf.memberNeedToCall.push({ type: MemberType.USER, name: `mobile-${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
              let user = {};
              user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = member.id;
              dmtf.userId.push(user);
            }
          });
          ivrData[DMTF] = dmtf;
          break;
        }
        case GroupCallSettingRingingType.EXTERNAL_NUMBER: {
          const externalNumber = actionData[`ivr_dtmf_${DMTF}_external_number`];
          dmtf.memberNeedToCall.push({
            type: MemberType.EXTERNAL_PHONE,
            number: externalNumber.replace(/[\s+]/g, ""),
            trunk: carrierName,
          });
          dmtf.fromNumber = to.replace(/[\s+]/g, "");
          dmtf.isForward = true;
          ivrData[DMTF] = dmtf;
          break;
        }
        case GroupCallSettingRingingType.HANG_UP: {
          dmtf.isHangup = true;
          ivrData[DMTF] = dmtf;
          break;
        }
        default:
          break;
      }
    });
    return ivrData;
  };

  triggerTimeoutActionIvr = async (currentCallLog: IConfCall, jambonzLog: any) => {
    try {
      const { call_sid, friendly_name, time } = jambonzLog;
      const newData = { ivrTimeoutSid: "", masterCallId: call_sid, status: ConfCallStatus.START, eventTime: time };
      const timeoutFallOverFunc = setTimeout(async () => {
        const test = await axios.put(
          `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${call_sid}`,
          { call_hook: `${process.env.BACKEND_URL}/call-controller/conference-timeout-ivr-hook/${friendly_name}` },
          {
            headers: {
              Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
            },
          },
        );
      }, 45000);
      this.pushTimeOutIvr(timeoutFallOverFunc, call_sid);
      newData.ivrTimeoutSid = call_sid;
      return this.setCallLogToRedis(friendly_name, newData, currentCallLog);
    } catch (error) {
      console.log("🚀 ~ file: call-controller.service.ts:342 ~ CallControllerService ~ triggerFallOverTimeoutWithoutQueueMedia= ~ error:", error);
    }
  };

  clearTimeoutConf = async (timeoutSid: string) => {
    return clearTimeout(timeoutSid);
  };

  makeCallAndConferenceForLiveChat = async (jambonzClient, headers, carrierName, res) => {
    try {
      const groupId = headers?.groupid;
      const uniqNameConference = headers?.conferencename;
      const callerUserId = headers?.userid;
      const conversationId = headers?.conversationid;
      const isAgentCall = headers?.agentcall;
      const listInviteEmail = [];
      let userIds = [];
      if (isAgentCall) {
        listInviteEmail.push({ type: MemberType.USER, name: `${conversationId}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
      } else {
        const groupCallSettingResponse = await axios.post(`${process.env.CHATCHILLA_BACKEND_URL}/group/group_member_email`, { groupId });
        if (groupCallSettingResponse?.status !== 200) return;
        const { data } = groupCallSettingResponse;
        const allEmail = data?.userEmail;
        userIds = data?.userIds;

        if (allEmail.length > 0) {
          allEmail.forEach(email => {
            const emailName = getNameOfEmail(email);
            listInviteEmail.push({ type: MemberType.USER, name: `${emailName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
            listInviteEmail.push({ type: MemberType.USER, name: `mobile-${emailName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
          });
        }
      }

      jambonzClient.conference({
        name: uniqNameConference,
        statusEvents: [ConferenceType.END, ConferenceType.JOIN, ConferenceType.START, ConferenceType.LEAVE],
        statusHook: "/call-controller/conference-status",
        startConferenceOnEnter: true,
        endConferenceOnExit: true,
      }); // conference created.
      const allFistInvMem = [];
      const allFistCallIds = [];
      await Promise.all(
        listInviteEmail.map(async (member: ITypeOfToUser) => {
          let userIdData = "";
          const callRingingSid = await this.client.calls.create({
            from: `livechat chatchilla`,
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
              fromLiveChat: true,
            },
          });
          allFistInvMem.push({
            callId: callRingingSid,
            type: member.type === MemberType.USER ? MemberType.USER : MemberType.EXTERNAL_PHONE,
            value: member.type === MemberType.USER ? member.name : member.number,
            status: LegMemberStatus.calling,
            statusList: [LegMemberStatus.calling],
          });
          allFistCallIds.push(callRingingSid);
        }),
      ).catch(err => {
        console.log("🚀 ~ file: call-controller.controller.ts:534 ~ CallControllerController ~ callHook ~ err:", err);
      });
      const initCallLog: IConfCall = {
        caller: `livechat-${callerUserId}`,
        isOneOfMemberAnswer: false,
        confUniqueName: uniqNameConference,
        masterCallId: "",
        status: ConfCallStatus.CREATED,
        members: allFistInvMem,
        currentMemberInConf: 0,
        fallOverTimeOutSid: "",
        isOutboundCall: true,
        listPhoneFirstInviteRinging: allFistCallIds,
        eventTime: "",
        conversationId: conversationId || "",
        isEnableFallOver: false,
        fallOverMediaUrl: null,
        fallOverTimeout: null,
        timeoutMediaUrl: null,
        queueMediaUrl: null,
        queueTimeout: null,
        isTriggerQueueMedia: null,
        isWelcomeMedia: null,
        callerUserId,
        userIds,
        callType: CallType.live_chat,
      };
      await this.setCallLogToRedis(uniqNameConference, initCallLog, null);
      res.status(200).json(jambonzClient);
    } catch (error) {}
  };
}
