export enum ConfCallStatus {
  CREATED = "CREATED",
  START = "START",
  END = "END",
  QUEUE = "QUEUE",
  AUTO_ASSIGN_QUEUE = "AUTO_ASSIGN_QUEUE",
}

export enum MemberType {
  SIP_USER = "sip",
  EXTERNAL_PHONE = "phone",
  USER = "user",
}

export enum LegMemberStatus {
  calling = "CALLING",
  join = "JOIN",
  end = "END",
  leave = "LEAVE",
  no_answer = "NO_ANSWER",
  not_available = "NOT_AVAILABLE",
}

export enum ConferenceType {
  START = "start",
  LEAVE = "leave",
  JOIN = "join",
  END = "end",
}

export enum GroupCallSettingRingingType {
  MEMBER_AUTO_ASSIGN = "MEMBER_AUTO_ASSIGN",
  OWNER = "OWNER",
  MEMBER = "MEMBER",
  GROUP = "GROUP",
  OTHER_GROUP = "OTHER_GROUP",
  EXTERNAL_NUMBER = "EXTERNAL_NUMBER",
  IVR = "IVR",
  HANG_UP = "HANG_UP",
  A_ROLE_IN_GROUP = "A_ROLE_IN_GROUP",
  CALL_FORWARDING = "CALL_FORWARDING",
}
export enum CallingType {
  INBOUND = "inbound",
  OUTBOUND = "outbound",
}

export enum CallStatus {
  ringing = "ringing",
  no_answer = "no-answer",
  not_available = "failed",
  trying = "trying",
  early_media = "early-media",
  in_progress = "in-progress",
}

export enum SampleMedia {
  welcomeMedia = "",
  queueMedia = "https://smartonhold.com.au/wp-content/uploads/2021/11/FEMALE-DEMO-2-Inga-Feitsma-5-11-21.mp3",
  timeoutMedia = "https://smartonhold.com.au/wp-content/uploads/2023/07/Male-Demo-Rick-Davey.mp3",
  voicemailMedia = "https://smartonhold.com.au/wp-content/uploads/2023/04/Male-Demo-1Mark-Fox.mp3",
}
