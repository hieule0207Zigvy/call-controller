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
    return Promise.all(
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
  }

  pushTimeOut = (timeout, masterCallId: string) => {
    this.fallOverTimeOutList[masterCallId] = timeout;
    console.log("🚀 ~ file: call-controller.service.ts:32 ~ CallControllerService ~ this.fallOverTimeOutList:", this.fallOverTimeOutList);
    return true;
  };

  removeAndClearTimeout = (masterCallId: string) => {
    clearTimeout(this.fallOverTimeOutList[masterCallId]);
    _.omit(this.fallOverTimeOutList, [masterCallId]);
    console.log("🚀 ~ file: call-controller.service.ts:38 ~ CallControllerService ~ this.fallOverTimeOutList:", this.fallOverTimeOutList);
    return true;
  };
}
