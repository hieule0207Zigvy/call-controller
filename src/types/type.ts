import { MemberType } from "aws-sdk/clients/workmail";
import { LegMemberStatus, ConfCallStatus } from "src/enums/enum";

export interface IToUserType {
  type?: string;
  number?: string;
  name?: string;
}
export interface IUpdateConferenceOption {
  conf_hold_status?: string;
  conf_mute_status?: string;
  wait_hook?: string;
}

export interface ILegMember {
  callId: string;
  type: MemberType;
  value: string;
  status: LegMemberStatus;
}

export interface IConfCall {
  isOneOfMemberAnswer: boolean;
  confUniqueName: string;
  masterCallId: string;
  status: ConfCallStatus;
  callerCallId?: string;
  members: ILegMember[];
  currentMemberInConf: number;
  fallOverTimeOut?: any;
}

export interface ITypeOfToUser {
  type: string;
  name?: string;
  sipUri?: string;
  number?: string;
}
