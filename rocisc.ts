import { parseArgs } from 'node:util';
import { RegistryClient, ImageRef, Platform, enableGlobalDebug, byteFormatter, printTable } from './utils.ts';

const { values, positionals } = parseArgs({
  options: {
    registry: {
      type: 'string',
      default: RegistryClient.DockerHub,
    },
    arch: {
      type: 'string',
      default: process.arch,
    },
    os: {
      type: 'string',
      default: process.platform,
    },
    debug: {
      type: 'boolean',
      default: false
    },
    maxUncompressedDelta: {
      type: 'string',
      default: '0',
    },
  },
  allowPositionals: true,
});

if (positionals.length < 2) {
  // TODO: Show usage help text
  throw new Error('Invalid arguments');
}
let deltaBytes: number | undefined = undefined;
if (values.maxUncompressedDelta !== '0') {
  deltaBytes = parseInt(values.maxUncompressedDelta, 10);
  if (Number.isNaN(deltaBytes)) {
    throw new Error(`Invalid delta: ${values.maxUncompressedDelta}`);
  }
}

if (values.debug) {
  enableGlobalDebug();
}

const parsedImageRefs = positionals.map(ImageRef.FromEncodedString);

const platform = new Platform(values.arch, values.os);
const registry = new RegistryClient(values.registry, process.env.AUTHORIZATION);
await registry.tryAuthenticate(parsedImageRefs);
const imageStats = await Promise.all(parsedImageRefs.map(imageRef => registry.getImageStatistics(platform, imageRef)));
console.log(printTable(imageStats));

if (deltaBytes) {
  for (const [i, imageStat] of imageStats.entries()) {
    if (i == 0) {
      continue;
    }
    const delta = imageStat['Uncompressed Size'] - imageStats[0]['Uncompressed Size'];
    if (delta > deltaBytes) {
      console.error(`ERROR: Delta exceeded. ${imageStat['Image']} is ${byteFormatter.format(delta)} larger than ${imageStats[0]['Image']}`);
      process.exit(1);
    }
  }
}
