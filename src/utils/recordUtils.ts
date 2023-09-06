var AWS = require("aws-sdk");
var S3Stream = require("s3-upload-stream");
const Websocket = require("ws");
import 'dotenv/config'

export const recordAudio = async (logger, socket) => {
  console.log("🚀 ~ file: recordUtils.ts:6 ~ recordAudio ~ recordAudio:")
  socket.on("message", function (data) {
    /* first message is a JSON object containing metadata about the call */
    try {
      socket.removeAllListeners("message");
      const metadata = JSON.parse(data);
      const { parent_call_sid = "" } = metadata;
      logger.info({ metadata }, "received metadata");
      const { callSid, accountSid, applicationSid, from, to, callId, traceId, botSessionId, originalCallerNumber, originalCalledNumber } = metadata;
      console.log("🚀 ~ file: recordUtils.ts:16 ~ metadata:", metadata)
      const regex = /[^a-zA-Z0-9]/g;
      let md = {
        //'jambonz-callsid': callSid,
        "jambonz-trace-id": traceId,
        //accountSid,
        //applicationSid,
        "genesys-callerid": from,
        "genesys-ddi": to,
        //callId,
        // "bot-session-id": botSessionId,
        // "original-caller-number": from.replace(regex, ''),
        // "original-called-number": to.replace(regex, ''),
        parent_call_sid: "",
      };
      if (parent_call_sid) md = { ...md, parent_call_sid: parent_call_sid };
      const s3Stream = new S3Stream(new AWS.S3());
      console.log("🚀 ~ file: recordUtils.ts:37 ~ md:", md)

      const upload = s3Stream.upload({
        Bucket: process.env.RECORD_BUCKET,
        Key: `${metadata.callSid}.L16`,
        ACL: "public-read",
        ContentType: `audio/L16;rate=${metadata.sampleRate};channels=${metadata.mixType === "stereo" ? 2 : 1}`,
        Metadata: md,
      });
      upload.on("error", function (err) {
        console.log("🚀 ~ file: recordUtils.ts:41 ~ err:", err)
        logger.error({ err }, `Error uploading audio to ${process.env.RECORD_BUCKET}`);
      });
      const duplex = Websocket.createWebSocketStream(socket);
      duplex.pipe(upload);
      logger.info(`starting upload to bucket ${process.env.RECORD_BUCKET}`);
    } catch (err) {
      logger.error({ err }, `Error starting upload to bucket ${process.env.RECORD_BUCKET}`);
    }
  });
  socket.on("error", function (err) {
    logger.error({ err }, "recordAudio: error");
  });
};
