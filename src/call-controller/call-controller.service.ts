import { Inject, Injectable } from "@nestjs/common";
import { LegMemberStatus } from "src/enums/enum";
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
          await axios.put(
            `${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/Calls/${callSid}`,
            { call_status: "no-answer" },
            {
              headers: {
                Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
              },
            },
          );
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
}
