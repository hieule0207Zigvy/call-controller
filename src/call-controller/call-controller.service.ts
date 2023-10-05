import { Inject, Injectable } from "@nestjs/common";
import { GroupCallSettingRingingType, LegMemberStatus, MemberType } from "src/enums/enum";
import { IConfCall, ILegMember } from "src/types/type";
const jambonz = require("@jambonz/node-client");
import axios from "axios";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
var _ = require("lodash");
import { Cache } from "cache-manager";
import { Timer } from "./../utils/Timer";

@Injectable()
export class CallControllerService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}
  private client: any = jambonz(process.env.JAMBONZ_ACCOUNT_SID, process.env.JAMBONZ_API_KEY, {
    baseUrl: process.env.JAMBONZ_REST_API_BASE_URL,
  });
  private fallOverTimeOutList = {};
  private expiredTime = 3 * Timer.month;

  async endAllRingingCall(callSids: string[]): Promise<any> {
    try {
      Promise.all(
        callSids.map(async (callSid: string) => {
          await axios
            .put(
              `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${callSid}`,
              { call_status: "no-answer" },
              {
                headers: {
                  Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
                },
              },
            )
            .catch(err => console.log("🚀 ~ file: call-controller.service.ts:33 ~ CallControllerService ~ callSids.map ~ err:", err));
        }),
      );
      return true;
    } catch (error) {
      console.log("🚀 ~ file: call-controller.service.ts:30 ~ CallControllerService ~ endAllRingingCall ~ error:", error);
      return true;
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

  getCallSettings = (callSettingData: any) => {
    const memberNeedToCall = [];
    let welcomeMedia = "";
    let queueMedia = "";
    let timeoutMedia = "";
    let queueTimeout = 100;
    let voicemailTimeout = 60;
    let voicemailMedia = "";
    let fromNumber: string;
    let isHangup = false;
    let isEnableVoiceMail = false;
    let isForwardCall = false;
    let callForwardPhoneNumber = "";
    let isExternalForwardCall = false;

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

    const { members = [] } = group;
    const memberInOtherGroup = other_group?.members;

    switch (type) {
      case GroupCallSettingRingingType.HANG_UP: {
        isHangup = true;
        if (call_setting_welcome_media) {
          welcomeMedia = call_setting_welcome_media;
        }
        break;
      }
      case GroupCallSettingRingingType.CALL_FORWARDING: {
        fromNumber = external_number.ani;
        callForwardPhoneNumber = call_setting_forward_phone;
        if (call_setting_welcome_media) {
          welcomeMedia = call_setting_welcome_media;
        }
        isForwardCall = true;
        break;
      }
      case GroupCallSettingRingingType.EXTERNAL_NUMBER: {
        isExternalForwardCall = true;
        memberNeedToCall.push({
          type: MemberType.EXTERNAL_PHONE,
          number: external_number.phone_number,
          fromNumber: external_number.ani,
        });
        if (call_setting_welcome_media) {
          welcomeMedia = call_setting_welcome_media;
        }
        break;
      }
      case GroupCallSettingRingingType.MEMBER: {
        members.forEach(member => {
          if (call_setting_member_id.includes(member.id)) {
            memberNeedToCall.push({ type: MemberType.USER, name: `${member?.trunk_sip_credential.username}${process.env.CHATCHILLA_SIP_DOMAIN}` });
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
        members.forEach(member => {
          if (member.roles(call_setting_role)) {
            memberNeedToCall.push({ type: MemberType.USER, name: `${member?.trunk_sip_credential.username}${process.env.CHATCHILLA_SIP_DOMAIN}` });
          }
        });
        if (call_setting_welcome_media) {
          welcomeMedia = call_setting_welcome_media;
        }
        break;
      }
      case GroupCallSettingRingingType.GROUP: {
        // members.forEach(member => {
        //   memberNeedToCall.push({ type: MemberType.USER, name: `${member?.trunk_sip_credential.username}${process.env.CHATCHILLA_SIP_DOMAIN}` });
        // }); // need migra with chatchilla so mocking sip account
        memberNeedToCall.push({ type: MemberType.USER, name: `test8sub@${process.env.CHATCHILLA_SIP_DOMAIN}` });
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
        memberInOtherGroup.forEach(member => {
          memberNeedToCall.push({ type: MemberType.USER, name: `${member?.trunk_sip_credential.username}${process.env.CHATCHILLA_SIP_DOMAIN}` });
        });
        if (call_setting_welcome_media) {
          welcomeMedia = call_setting_welcome_media;
          isEnableVoiceMail = queue_settings.isVoiceMail;
        }
        break;
      }
      case GroupCallSettingRingingType.MEMBER_AUTO_ASSIGN: {
        members.forEach(member => {
          if (member.auto_assign) memberNeedToCall.push({ type: MemberType.USER, name: `${member?.trunk_sip_credential.username}${process.env.CHATCHILLA_SIP_DOMAIN}` });
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
        if (memberNeedToCall.length === 0)
          // queue call
          break;
      }
      case GroupCallSettingRingingType.OWNER: {
        if (owner) {
          memberNeedToCall.push({ type: MemberType.USER, name: `${owner?.trunk_sip_credential.username}${process.env.CHATCHILLA_SIP_DOMAIN}` });
        } else {
          members.forEach(member => {
            memberNeedToCall.push({ type: MemberType.USER, name: `${owner?.trunk_sip_credential.username}${process.env.CHATCHILLA_SIP_DOMAIN}` });
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
      isEnableRecord: call_setting_auto_record,
      isEnableVoiceMail,
      isForwardCall,
      callForwardPhoneNumber,
      isExternalForwardCall,
    };
  };

  enableQueueMedia = async (conferenceLog: IConfCall, masterCallId: string) => {
    console.log("🚀 ~ file: call-controller.service.ts:241 ~ CallControllerService ~ enableQueueMedia= ~ conferenceLog:", conferenceLog);
    await axios
      .put(
        `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${masterCallId}`,
        { call_hook: `${process.env.BACKEND_URL}/call-controller/queue-hook/${conferenceLog.confUniqueName}` },
        {
          headers: {
            Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
          },
        },
      )
      .catch(err => {
        console.log("🚀 ~ file: call-controller.service.ts:254 ~ CallControllerService ~ enableQueueMedia= ~ err:", err);
        return;
      });
  };

  removeQueueMedia = async (masterCallId: string, conferenceName) => {
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
  };
}
