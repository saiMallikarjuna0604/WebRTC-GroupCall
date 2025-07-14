const mediasoup = require('mediasoup');

const config = {
  worker: {
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp']
  },
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: { 'x-google-start-bitrate': 1000 }
      }
    ]
  },
  webRtcTransport: {
    listenIps: [{ ip: '127.0.0.1', announcedIp: null }],
    initialAvailableOutgoingBitrate: 1000000,
    minimumAvailableOutgoingBitrate: 600000,
    maxSctpMessageSize: 262144,
    maxIncomingBitrate: 1500000
  }
};

async function createWorker() {
  const worker = await mediasoup.createWorker(config.worker);
  worker.on('died', () => {
    console.error('MediaSoup worker died, exiting...');
    setTimeout(() => process.exit(1), 2000);
  });
  return worker;
}

async function createRouter(worker) {
  return await worker.createRouter(config.router);
}

async function createWebRtcTransport(router, options = {}) {
  const transport = await router.createWebRtcTransport({
    ...config.webRtcTransport,
    ...options
  });
  return transport;
}

module.exports = { config, createWorker, createRouter, createWebRtcTransport }; 