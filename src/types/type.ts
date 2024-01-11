import { LegMemberStatus, ConfCallStatus, MemberType } from "src/enums/enum";

export interface IToUserType {
  type?: string;
  number?: string;
  name?: string;
  trunk?: string;
}
export interface IUpdateConferenceOption {
  conf_hold_status?: string;
  conf_mute_status?: string;
  wait_hook?: string;
}

export interface ILegMember {
  callId: string;
  type: string;
  value: string;
  status: LegMemberStatus;
  eventTime?: Date;
  isMute?: boolean;
  statusList: string[];
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
  duration?: string;
  groupCallSetting?: string;
  ivrTimeoutData?: any;
  ivrTimeoutSid?: any;
  groupId?: string;
  callerNumber?: string;
  callerUserId?: string;
  userIds?: string[];
}

export interface ITypeOfToUser {
  type: string;
  name?: string;
  sipUri?: string;
  number?: string;
}

export interface IIvrType {
  welcomeMedia: string;
  ivrFallOverTimeout?: string;
}
