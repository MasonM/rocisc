import { parseArgs } from 'node:util';
import { RegistryClient, ImageRef, Platform, enableGlobalDebug } from './utils.ts';

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

if (values.debug) {
  enableGlobalDebug();
}
const parsedImageRefs = positionals.map(ImageRef.FromEncodedString);
const platform = new Platform(values.arch, values.os);
const registry = new RegistryClient(values.registry, process.env.AUTHORIZATION);
await registry.tryAuthenticate(parsedImageRefs);
const imageStats = await Promise.all(parsedImageRefs.map(imageRef => registry.getImageStatistics(platform, imageRef)));
const imageDataObjects = imageStats.map((stats, index) => stats.toTabularDataObject(index == 0 ? undefined : imageStats[0]));

console.table(imageDataObjects);
if (values.maxUncompressedDelta !== '0') {
  const deltaBytes = parseInt(values.maxUncompressedDelta, 10);
  if (Number.isNaN(deltaBytes)) {
    throw new Error(`Invalid delta: ${values.maxUncompressedDelta}`);
  }

  if (!imageStats.every((imageStat, index) => {
    if (index === 0) {
      return true;
    }
    return (imageStat.totalUncompressedSize - imageStats[0].totalUncompressedSize) <= deltaBytes;
  })) {
    throw new Error(`Delta exceeded`);
  }
}
