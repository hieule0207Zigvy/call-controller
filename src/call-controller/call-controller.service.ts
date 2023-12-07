import { Inject, Injectable } from "@nestjs/common";
import { CallStatus, ConfCallStatus, GroupCallSettingRingingType, LegMemberStatus, MemberType } from "src/enums/enum";
import { IConfCall, ILegMember } from "src/types/type";
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

  removeAndClearTimeout = (masterCallId: string) => {
    clearTimeout(this.fallOverTimeOutList[masterCallId]);
    const newList = _.omit(this.fallOverTimeOutList, [masterCallId]);
    return this.setFallOverTimeOutList(newList);
  };

  setFallOverTimeOutList = (fallOverTimeOutList: []) => {
    return (this.fallOverTimeOutList = fallOverTimeOutList);
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

  getCallSettings = async (callSettingData: any) => {
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
    let welcomeMediaUrl = false;

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
      } = callSettingData;
      const voipCarrier = owner?.voip_carrier;
      const carrierName = await this.jambonzService.getCarrierName(voipCarrier);
      const { members = [] } = group;
      const memberInOtherGroup = other_group?.members;
      const groupCallSetting = type;

      switch (type) {
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
              const { email } = member;
              const sipName = getNameOfEmail(email);
              if (!!sipName) {
                memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
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
              const sipName = getNameOfEmail(email);
              if (!!sipName) {
                memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
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
          members.forEach(member => {
            const { email } = member;
            const sipName = getNameOfEmail(email);
            if (!!sipName) {
              memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
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
          memberInOtherGroup.forEach(member => {
            const { email } = member;
            const sipName = getNameOfEmail(email);
            if (!!sipName) {
              memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
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
              const { email } = member;
              const sipName = getNameOfEmail(email);
              if (!!sipName) {
                memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
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
          if (owner) {
            const { email } = owner;
            const sipName = getNameOfEmail(email);
            if (!!sipName) {
              memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
              const user = {};
              user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = owner.id;
              userId.push(user);
            }
          } else {
            members.forEach(member => {
              const { email } = member;
              const sipName = getNameOfEmail(email);
              if (!!sipName) {
                memberNeedToCall.push({ type: MemberType.USER, name: `${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`, trunk: carrierName });
                const user = {};
                user[`${sipName}@${process.env.CHATCHILLA_SIP_DOMAIN}`] = member.id;
                userId.push(user);
              }
            });
          }
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
    const newData = { members: newMembers, currentMemberInConf: members, masterCallId: currentCallLog?.masterCallId };
    if (!currentCallLog?.masterCallId) newData.masterCallId = call_sid;
    await this.setCallLogToRedis(friendly_name, newData, currentCallLog);
    return
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
      if (!currentCallLog.isOutboundCall) {
        const filterAcceptCallSid = listPhoneFirstInviteRinging.filter((ringingCall: string) => ringingCall !== call_sid);
        const listMember = currentCallLog.members;
        const endCallList = [];
        listMember.forEach(member => {
          if (filterAcceptCallSid.includes(member.callId) && member.status === LegMemberStatus.calling) {
            endCallList.push(member.callId);
          }
        });
        await this.endAllRingingCall(endCallList);
        const currentMembers = currentCallLog.members;
        currentMembers.forEach((member: ILegMember) => {
          if (filterAcceptCallSid.includes(member.callId)) {
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
}
