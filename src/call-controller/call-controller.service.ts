import { Injectable } from "@nestjs/common";
import { LegMemberStatus } from "src/enums/enum";
import { ILegMember } from "src/types/type";
const jambonz = require("@jambonz/node-client");
import axios from "axios";
@Injectable()
export class CallControllerService {
  private client: any = jambonz(process.env.JAMBONZ_ACCOUNT_SID, process.env.JAMBONZ_API_KEY, {
    baseUrl: process.env.JAMBONZ_REST_API_BASE_URL,
  });

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
}
