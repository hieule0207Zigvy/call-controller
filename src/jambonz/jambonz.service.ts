import { Injectable } from "@nestjs/common";
import axios from "axios";
const jambonz = require("@jambonz/node-client");

@Injectable()
export class JambonzService {
  private client: any = jambonz(process.env.JAMBONZ_ACCOUNT_SID, process.env.JAMBONZ_API_KEY, {
    baseUrl: process.env.JAMBONZ_REST_API_BASE_URL,
  });

  createTwilioVoidCarrier = async (carrierData: any) => {
    try {
      const twilioCarrierSid = process.env.TWILIO_SERVICE_ID;
      const defaultInboundApplicationSid = process.env.DEFAULT_INBOUND_APP_ID;
      const accountSid = process.env.JAMBONZ_ACCOUNT_SID;
      const defaultServiceSid = process.env.SERVICE_PROVIDER;
      const params = {
        name: "Twilio-test8testing",
        e164_leading_plus: 1,
        application_sid: defaultInboundApplicationSid,
        service_provider_sid: defaultServiceSid,
        account_sid: accountSid,
        requires_register: false,
        register_username: "test8",
        register_password: "yZwMnZ3ATSFAVw.MRS5",
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
      const voidTwilioCarrierResponse = await axios
        .post(`${process.env.JAMBONZ_REST_API_BASE_URL}/Accounts/${process.env.JAMBONZ_ACCOUNT_SID}/VoipCarriers`, params, {
          headers: {
            Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
          },
        })
        .catch(err => console.log("🚀 ~ file: call-controller.service.ts:33 ~ CallControllerService ~ callSids.map ~ err:", err));

      if (voidTwilioCarrierResponse && voidTwilioCarrierResponse.status === 201) {
        const newCarrierSid = voidTwilioCarrierResponse.data.sid;
        const sipGatewayOption = {
          ipv4: "pbx-cce67b2d-2361-4b17-955e-72249c0a1f3a.pstn.twilio.com",
          netmask: 32,
          port: 5060,
          inbound: 0,
          outbound: 1,
          voip_carrier_sid: newCarrierSid,
          is_active: 1,
          protocol: "udp",
          pad_crypto: 0,
        };
        const sipGatewayTwilioOutboundResponse = await axios
          .post(`${process.env.JAMBONZ_REST_API_BASE_URL}/SipGateways`, sipGatewayOption, {
            headers: {
              Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
            },
          })
          .catch(err => console.log("🚀 ~ file: call-controller.service.ts:33 ~ CallControllerService ~ callSids.map ~ err:", err));
        console.log("🚀 ~ file: jambonz.service.ts:66 ~ JambonzService ~ createTwilioVoidCarrier= ~ sipGatewayTwilioInboundResponse:", sipGatewayTwilioOutboundResponse);
      } else return false;
    } catch (error) {
      return error;
    }
  };

  createSipAccount = async (account: any) => {
    const { username, password = process.env.DEFAULT_SIP_CLIENT_PASSWORD } = account;
    try {
      const params = {
        account_sid: process.env.JAMBONZ_ACCOUNT_SID,
        username,
        password,
        is_active: true,
      };
      const clientResponse = await axios
        .post(`${process.env.JAMBONZ_REST_API_BASE_URL}/Clients`, params, {
          headers: {
            Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
          },
        })
        .catch(err => {
          console.log("🚀 ~ file: jambonz.service.ts:83 ~ JambonzService ~ createSipAccount= ~ err:", err);
          return;
        });
      if (clientResponse && clientResponse.status === 201) {
        return clientResponse.data.sid;
      }
    } catch (error) {
      console.log("🚀 ~ file: jambonz.service.ts:78 ~ JambonzService ~ createSipAccount= ~ error:", error);
      return error;
    }
  };

  registerPhoneNumber = async (account: any) => {
    const { number, voip_carrier_sid } = account; // number: "+16161998349"
    try {
      const params = {
        account_sid: process.env.JAMBONZ_ACCOUNT_SID,
        application_sid: process.env.DEFAULT_INBOUND_APP_ID,
        number: "+16161998349",
        voip_carrier_sid: "03125a29-8ca2-4d0c-86de-ebc3fe5f57a3",
      };
      const phoneNumberResponse = await axios
        .post(`${process.env.JAMBONZ_REST_API_BASE_URL}/PhoneNumbers`, params, {
          headers: {
            Authorization: `Bearer ${process.env.JAMBONZ_API_KEY}`,
          },
        })
        .catch(err => {
          console.log("🚀 ~ file: jambonz.service.ts:83 ~ JambonzService ~ createSipAccount= ~ err:", err);
          return;
        });
      if (phoneNumberResponse && phoneNumberResponse.status === 201) {
        return phoneNumberResponse.data.sid;
      }
    } catch (error) {
      console.log("🚀 ~ file: jambonz.service.ts:78 ~ JambonzService ~ createSipAccount= ~ error:", error);
      return error;
    }
  };
}
