import { Injectable } from "@nestjs/common";
import { LegMemberStatus } from "src/enums/enum";
import { ILegMember } from "src/types/type";
const jambonz = require("@jambonz/node-client");
import axios from "axios";
var _ = require("lodash");
@Injectable()
export class CallControllerService {
  private client: any = jambonz(process.env.JAMBONZ_ACCOUNT_SID, process.env.JAMBONZ_API_KEY, {
    baseUrl: process.env.JAMBONZ_REST_API_BASE_URL,
  });
  private fallOverTimeOutList = {};

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

  pushTimeOut = (timeout, masterCallId: string) => {
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
}
