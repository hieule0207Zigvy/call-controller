var AWS = require("aws-sdk");
var S3Stream = require("s3-upload-stream");
const Websocket = require("ws");
import "dotenv/config";
import { Readable } from "stream";
const PCMToMP3Encoder = require("./encoder");
const S3MultipartUploadStream = require("./s3-multipart-upload-stream");

export const recordAudio = async (logger, socket) => {
  socket.on("message", function (data, isBinary) {
    /* first message is a JSON object containing metadata about the call */
    socket._recvInitialMetadata = false;
    try {
      if (!isBinary && !socket._recvInitialMetadata) {
        socket._recvInitialMetadata = true;
        logger.debug(`initial metadata: ${data}`);
        const obj = JSON.parse(data.toString());
        logger.info({ obj }, "received JSON message from jambonz");
        const { sampleRate, accountSid, callSid, direction, from, to, callId, applicationSid, originatingSipIp, originatingSipTrunkName } = obj;
        const metadata = {
          accountSid,
          callSid,
          direction,
          from,
          to,
          callId,
          applicationSid,
          originatingSipIp,
          originatingSipTrunkName,
          sampleRate: `${sampleRate}`,
        };
        const day = new Date();
        let Key = `${day.getFullYear()}/${(day.getMonth() + 1).toString().padStart(2, "0")}`;
        Key += `/${day.getDate().toString().padStart(2, "0")}/${callSid}.mp3`;
        const uploaderOpts = {
          bucketName: process.env.RECORD_BUCKET,
          Key,
          metadata,
          region: process.env.AWS_REGION || "us-east-1",
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.SECRET_ACCESS_KEY,
          },
        };
        const uploadStream = new S3MultipartUploadStream(logger, uploaderOpts);
        if (!uploadStream) {
          logger.info("There is no available record uploader, close the socket.");
          socket.close();
        }
        const encoder = new PCMToMP3Encoder({
          channels: 2,
          sampleRate: sampleRate,
          bitrate: 128,
        });
        const duplex = Websocket.createWebSocketStream(socket);
        duplex.pipe(encoder).pipe(uploadStream);
      }
    } catch (err) {
      console.log("🚀 ~ file: recordUtils.ts:76 ~ err:", err);
      // logger.error({ err }, `Error starting upload to bucket ${process.env.RECORD_BUCKET}`);
    }
  });
  socket.on("error", function (err) {
    logger.error({ err }, "aws upload: error");
  });
  socket.on("close", data => {
    logger.info({ data }, "aws_s3: close");
  });
  socket.on("end", function (err) {
    logger.error({ err }, "aws upload: socket closed from jambonz");
  });
};
