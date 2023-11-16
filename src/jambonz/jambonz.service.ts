import { Injectable } from "@nestjs/common";
import axios from "axios";
import { getNameOfEmail } from "src/utils/until";
const jambonz = require("@jambonz/node-client");

export const DefaultSipGateway = [
  {
    ipv4: "54.65.63.192",
    netmask: 30,
    port: 5060,
    inbound: 1,
    outbound: 0,
    voip_carrier_sid: "",
    is_active: 1,
    protocol: "udp",
    pad_crypto: 0,
  },
  {
    ipv4: "54.171.127.192",
    netmask: 30,
    port: 5060,
    inbound: 1,
    outbound: 0,
    voip_carrier_sid: "",
    is_active: 1,
    protocol: "udp",
    pad_crypto: 0,
  },
  {
    ipv4: "54.169.127.128",
    netmask: 30,
    port: 5060,
    inbound: 1,
    outbound: 0,
    voip_carrier_sid: "",
    is_active: 1,
    protocol: "udp",
    pad_crypto: 0,
  },
  {
    ipv4: "168.86.128.0",
    netmask: 18,
    port: 5060,
    inbound: 1,
    outbound: 0,
    voip_carrier_sid: "",
    is_active: 1,
    protocol: "udp",
    pad_crypto: 0,
  },
  {
    ipv4: "54.244.51.0",
    netmask: 30,
    port: 5060,
    inbound: 1,
    outbound: 0,
    voip_carrier_sid: "",
    is_active: 1,
    protocol: "udp",
    pad_crypto: 0,
  },
  {
    sip_gateway_sid: "",
    ipv4: "35.156.191.128",
    netmask: 30,
    port: 5060,
    inbound: 1,
    outbound: 0,
    voip_carrier_sid: "",
    is_active: 1,
    protocol: "udp",
    pad_crypto: 0,
  },
  {
    sip_gateway_sid: "",
    ipv4: "54.172.60.0",
    netmask: 30,
    port: 5060,
    inbound: 1,
    outbound: 0,
    voip_carrier_sid: "",
    is_active: 1,
    protocol: "udp",
    pad_crypto: 0,
  },
  {
    sip_gateway_sid: "",
    ipv4: "177.71.206.192",
    netmask: 30,
    port: 5060,
    inbound: 1,
    outbound: 0,
    voip_carrier_sid: "",
    is_active: 1,
    protocol: "udp",
    pad_crypto: 0,
  },
  {
    sip_gateway_sid: "",
    ipv4: "54.252.254.64",
    netmask: 30,
    port: 5060,
    inbound: 1,
    outbound: 0,
    voip_carrier_sid: "",
    is_active: 1,
    protocol: "udp",
    pad_crypto: 0,
  },
];

@Injectable()
export class JambonzService {
  private client: any = jambonz(process.env.JAMBONZ_ACCOUNT_SID, process.env.JAMBONZ_API_KEY, {
    baseUrl: process.env.JAMBONZ_REST_API_BASE_URL,
  });

  createTwilioVoidCarrier = async (carrierData: any) => {
    const { trunkDomain, username } = carrierData;
    if (!trunkDomain || !username) return false;
    try {
      const loginPayload = {
        username: process.env.JAMBONZ_USERNAME,
        password: process.env.JAMBONZ_PASSWORD,
      };
      const loginResponse: any = await axios.post(`${process.env.JAMBONZ_REST_API_BASE_URL}/login`, loginPayload);
      if (loginResponse?.status !== 200) {
        return false;
      }
      const authToken = loginResponse?.data?.token;
      const defaultInboundApplicationSid = process.env.DEFAULT_INBOUND_APP_ID;
      const accountSid = process.env.JAMBONZ_ACCOUNT_SID;
      const defaultServiceSid = process.env.TWILIO_SERVICE_PROVIDER;
      const defaultTwilioSipPassword = process.env.TWILIO_DEFAULT_SIP_CREDENTIAL_PASSWORD;
      const voidCarrierParams = {
        name: `${trunkDomain}-twilio-carrier`,
        e164_leading_plus: 1,
        application_sid: defaultInboundApplicationSid,
        service_provider_sid: defaultServiceSid,
        account_sid: accountSid,
        requires_register: false,
        register_username: username,
        register_password: defaultTwilioSipPassword,
        register_sip_realm: null,
        register_from_user: null,
        register_from_domain: null,
        register_public_ip_in_contact: false,
        tech_prefix: null,
        diversion: null,
        is_active: 1,
        smpp_system_id: null,
        smpp_password: null,
        smpp_inbound_system_id: null,
        smpp_inbound_password: null,
      };
      const voidTwilioCarrierResponse: any = await axios
        .post(`${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/VoipCarriers`, voidCarrierParams, {
          headers: {
            Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
          },
        })
        .catch(err => console.log("🚀 ~ file: call-controller.service.ts:33 ~ CallControllerService ~ callSids.map ~ err:", err));
      if (!voidTwilioCarrierResponse && voidTwilioCarrierResponse.status !== 201) return false;
      const newCarrierSid = voidTwilioCarrierResponse.data.sid;
      const sipGateWayList = DefaultSipGateway.map(item => ({ ...item, voip_carrier_sid: newCarrierSid }));
      const sipGatewayOption = {
        // ipv4: "pbx-cce67b2d-2361-4b17-955e-72249c0a1f3a.pstn.twilio.com",
        ipv4: `${trunkDomain}.pstn.twilio.com`,
        netmask: 32,
        port: 5060,
        inbound: 0,
        outbound: 1,
        voip_carrier_sid: newCarrierSid,
        is_active: 1,
        protocol: "udp",
        pad_crypto: 0,
      };
      sipGateWayList.push(sipGatewayOption);
      let isSipAddingFailed = false;
      await Promise.all(
        sipGateWayList.map(async sipData => {
          try {
            await axios.post(`${process.env.JAMBONZ_REST_API_BASE_URL}/SipGateways`, sipData, {
              headers: {
                Authorization: `Bearer ${authToken}`,
              },
            });
          } catch (error) {
            console.log("🚀 ~ file: jambonz.service.ts:186 ~ JambonzService ~ createTwilioVoidCarrier= ~ error:", error);
            isSipAddingFailed = true;
          }
        }),
      );
      if (isSipAddingFailed) return false;
      return newCarrierSid;
    } catch (error) {
      console.log("🚀 ~ file: jambonz.service.ts:193 ~ JambonzService ~ createTwilioVoidCarrier= ~ error:", error);
      return false;
    }
  };

  createSipAccount = async (account: any) => {
    const { email } = account;
    const emailName = getNameOfEmail(email);
    try {
      const params = {
        account_sid: process.env.JAMBONZ_ACCOUNT_SID,
        username: emailName,
        password: process.env.DEFAULT_SIP_CLIENT_PASSWORD,
        is_active: true,
      };
      const clientResponse = await axios.post(`${process.env.JAMBONZ_REST_API_BASE_URL}/Clients`, params, {
        headers: {
          Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
        },
      });

      if (clientResponse && clientResponse?.status === 201) {
        return clientResponse?.data?.sid;
      }
    } catch (error) {
      console.log("🚀 ~ file: jambonz.service.ts:78 ~ JambonzService ~ createSipAccount= ~ error:", error);
      return false;
    }
  };

  registerPhoneNumber = async (account: any) => {
    const { number, voip_carrier_sid } = account; // number: "+16161998349"
    try {
      const params = {
        account_sid: process.env.JAMBONZ_ACCOUNT_SID,
        application_sid: process.env.DEFAULT_INBOUND_APP_ID,
        number: number,
        voip_carrier_sid: voip_carrier_sid,
      };
      const phoneNumberResponse = await axios.post(`${process.env.JAMBONZ_REST_API_BASE_URL}/PhoneNumbers`, params, {
        headers: {
          Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
        },
      });
      if (phoneNumberResponse && phoneNumberResponse.status === 201) {
        return phoneNumberResponse.data.sid;
      }
    } catch (error) {
      console.log("🚀 ~ file: jambonz.service.ts:78 ~ JambonzService ~ createSipAccount= ~ error:", error);
      return false;
    }
  };
}
