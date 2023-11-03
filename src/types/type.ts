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
  eventTime?: Date;
  isMute?: boolean;
}

export interface IConfCall {
  caller: string;
  isOneOfMemberAnswer: boolean;
  confUniqueName: string;
  masterCallId: string;
  status: ConfCallStatus;
  members: ILegMember[];
  currentMemberInConf: number;
  fallOverTimeOutSid: string;
  isOutboundCall: boolean;
  listPhoneFirstInviteRinging: string[];
  conversationId?: string;
  eventTime?: string;
  isEnableFallOver?: boolean;
  fallOverMediaUrl?: string;
  fallOverTimeout?: number;
  timeoutMediaUrl?: string;
  queueMediaUrl?: string;
  queueTimeout?: number;
  isTriggerQueueMedia?: boolean;
  isWelcomeMedia?: boolean;
  isMute?: boolean;
  isCallerLeft?: boolean;
}

export interface ITypeOfToUser {
  type: string;
  name?: string;
  sipUri?: string;
  number?: string;
}
