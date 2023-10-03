export enum ConfCallStatus {
  START = "START",
  END = "END",
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
