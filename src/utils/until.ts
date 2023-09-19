export const getUniqConferenceName = () => {
  return `conference-${(Math.random() + 1).toString(36).substring(7)}`;
};
export const getUniqConferenceNameTimeout = () => {
  return `conference-timeout-${(Math.random() + 1).toString(36).substring(7)}`;
};

export const isPhoneNumberOrSIP = (input: string) => {
  // Regular expression pattern for phone numbers
  const phoneNumberPattern = /^\+?[0-9\s-]+$/;

  // Regular expression pattern for SIP addresses
  const sipAddressPattern = /^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+$/;

  if (phoneNumberPattern.test(input)) {
    return "phone";
  } else if (sipAddressPattern.test(input)) {
    return "sip";
  }
};
