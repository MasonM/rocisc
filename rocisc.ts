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
    }
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
const subcommand = positionals.shift()
const parsedImageRefs = positionals.map(ImageRef.FromEncodedString);
const platform = new Platform(values.arch, values.os);
const registry = new RegistryClient(values.registry, process.env.AUTHORIZATION);
await registry.tryAuthenticate(parsedImageRefs);
const imageStats = await Promise.all(parsedImageRefs.map(imageRef => registry.getImageStatistics(platform, imageRef)));

switch (subcommand) {
  case 'stats':
    console.table(imageStats.map(stats => stats.toTabularDataObject));
    break;
  case 'compare':
    // TODO Implement
    break;
  default:
    throw new Error(`Invalid command: ${subcommand}`);
}
