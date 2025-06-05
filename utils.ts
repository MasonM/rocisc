// Reference: https://github.com/opencontainers/distribution-spec/blob/v1.1.1/spec.md#pulling-manifests
export class ImageRef {
  // "a scope for API calls on a registry for a collection of content (including manifests, blobs, and tags)"
  readonly repository: string;
  // "either (a) the digest of the manifest or (b) a tag"
  readonly reference: string;

  constructor(repository: string, reference: string) {
    this.repository = repository;
    this.reference = reference;
  }

  forRef(reference: string): ImageRef { return new ImageRef(this.repository, reference); }
  toString(): String { return `${this.repository}:${this.reference}`; }

  static FromEncodedString(imageRef: string) {
    // Doesn't seem to be standardized. Dockerism?
    // Reference: https://docs.docker.com/reference/cli/docker/image/tag/#description
    const parts = imageRef.split(':');
    switch (parts.length) {
      case 1:
        return new ImageRef(parts[0], 'latest');
      case 2:
        return new ImageRef(parts[0], parts[1])
      default:
        throw new Error(`Invalid image reference: ${imageRef}`);
    }
  }
}

// Reference: https://github.com/opencontainers/image-spec/blob/v1.0.1/manifest.md
type ImageManifest = Record<string, any>;

const totalArray = (arr: number[]): number => arr.reduce((a, b) => a + b, 0);

export class ImageStatistics {
  readonly imageRef: ImageRef;
  compressedSizes: number[] = [];
  uncompressedSizes: number[] = [];

  constructor(imageRef: ImageRef) {
    this.imageRef = imageRef;
  }

  get totalCompressedSize(): number{ return totalArray(this.compressedSizes); }
  get totalUncompressedSize(): number { return totalArray(this.uncompressedSizes); }
  get totalLayers(): number { return this.compressedSizes.length; }
  get spaceSavings(): number { return 1 - (this.totalCompressedSize / this.totalUncompressedSize); }

  get toTabularDataObject() {
    const byteFormatter = new Intl.NumberFormat(undefined, {
      unit: 'byte',
      style: 'unit',
      unitDisplay: 'narrow',
      notation: 'compact',
      maximumSignificantDigits: 4,
    })
    const percentFormatter = new Intl.NumberFormat(undefined, {
      style: 'percent',
      maximumSignificantDigits: 4,
    });
    return {
      'Image': this.imageRef.toString(),
      'Num Layers': this.totalLayers,
      'Compressed Size': byteFormatter.format(this.totalCompressedSize),
      'Uncompressed Size': byteFormatter.format(this.totalUncompressedSize),
      'Space Savings': percentFormatter.format(this.spaceSavings),
    }
  }
}

// Reference: https://github.com/opencontainers/image-spec/blob/v1.0.1/image-index.md
export class Platform {
  // "This REQUIRED property specifies the CPU architecture. Image indexes
  // SHOULD use, and implementations SHOULD understand, values listed in the Go
  // Language document for GOARCH."
  // Reference: https://go.dev/doc/install/source#environment
  readonly architecture: string;
  // "This REQUIRED property specifies the operating system. Image indexes SHOULD use,
  // and implementations SHOULD understand, values listed in the Go Language document
  // for GOOS."
  readonly os: string;

  constructor(architecture: string, os: string) {
    // Map NodeJS process.arch values to GOARCH: https://nodejs.org/api/process.html#processarch
    // No strict validation. Let the registry tell us if the arch/os is invalid
    this.architecture = architecture === 'x64' ? 'amd64' : architecture;
    // Map NodeJS process.platform values to GOOS: https://nodejs.org/api/process.html#processplatform
    this.os = os === 'win32' ? 'windows' : os;
  }
}

// Reference: https://github.com/opencontainers/image-spec/blob/main/manifest.md#image-manifest-property-descriptions
interface ImageLayer {
  mediaType: string;
  size: number;
  digest: string;
}

let debug = false;
export function enableGlobalDebug() { debug = true; }

async function fetchWrapper(url: URL, options: globalThis.RequestInit = {}, throwOnError = true): Promise<globalThis.Response> {
  const response = await fetch(url, options);
  if (debug) {
    console.log(`Request url=${url}, auth=${options?.headers?.['Authorization']}, response status=${response.status}`)
  }
  if (throwOnError && !response.ok) {
    throw new Error(`Response status for ${url}: ${response.status}`);
  }
  return response;
}

export class RegistryClient {
  protected readonly registry: string;
  protected authorization?: string;
  // Source: https://github.com/moby/moby/blob/59bdc72463bbbf236f9113e0c1fb2f95a1fbb6e5/registry/config.go#L39-L45
  static readonly DockerHub = 'https://registry-1.docker.io';
  // Reference: https://github.com/opencontainers/image-spec/blob/v1.0.1/media-types.md
  readonly mediaTypes = [
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.oci.image.layer.v1.tar',
    'application/vnd.oci.image.layer.nondistributable.v1.tar',
    'application/vnd.oci.image.layer.v1.tar+gzip',
    'application/vnd.oci.image.layer.nondistributable.v1.tar+gzip',
    'application/vnd.oci.image.layer.v1.tar+zstd',
    'application/vnd.oci.image.layer.nondistributable.v1.tar+zstd',

    // Legacy Docker media types
    'application/vnd.docker.distribution.manifest.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
    'application/vnd.docker.container.image.v1+json',
    'application/vnd.docker.image.rootfs.diff.tar.gzip',
    'application/vnd.docker.image.rootfs.foreign.diff.tar.gzip',
  ];

  constructor(registry: string, authorization?: string) {
    this.registry = registry;
    this.authorization = authorization;
  }

  // Reference: https://docs.docker.com/docker-hub/usage/pulls/#view-pull-rate-and-limit
  async tryAuthenticate(imageRefs: ImageRef[]) {
    if (this.authorization) {
      return;
    }

    // Not standardized?
    // "This endpoint MAY be used for authentication/authorization purposes, but this is out of the purview of this specification."
    // - https://github.com/opencontainers/distribution-spec/blob/main/spec.md#api
    const response = await fetchWrapper(new URL('/v2/', this.registry), {}, false);
    if (response.status === 401) {
      const wwwAuthenticate = response.headers.get('www-authenticate');
      if (wwwAuthenticate) {
        // Reference: https://httpwg.org/specs/rfc9110.html#field.www-authenticate
        // TODO: More robust parsing
        const groups = wwwAuthenticate.match('([^ ]*) realm="([^"]*)", *service="([^"]*)"')
        if (groups) {
          const params = new URLSearchParams(imageRefs.map(imageRef =>
            ['scope', `repository:${imageRef.repository}:pull`]));
          params.append('service', groups[3])
          await fetchWrapper(new URL(`${groups[2]}?${params}`))
            .then(response => response.json())
            .then(data => this.authorization = `${groups[1]} ${data.token}`);
        }
      }
    }
  }

  async request(urlPath: string, headers: globalThis.HeadersInit = {}): Promise<globalThis.Response> {
    return fetchWrapper(new URL(urlPath, this.registry), {
      headers: {
        ...headers,
        ...(this.authorization ? { Authorization: this.authorization } : {}),
        Accept: this.mediaTypes.join(','),
      },
    })
  }

  // Reference: https://github.com/opencontainers/distribution-spec/blob/v1.1.1/spec.md#pulling-manifests
  async getManifest(imageRef: ImageRef): Promise<ImageManifest> {
    return this.request(`/v2/${imageRef.repository}/manifests/${imageRef.reference}`)
      .then(response => response.json());
  }

  // Reference: https://github.com/opencontainers/distribution-spec/blob/v1.1.1/spec.md#pulling-blobs
  async getBlob(imageRef: ImageRef, headers={}): Promise<globalThis.Response> {
    return this.request(`/v2/${imageRef.repository}/blobs/${imageRef.reference}`, headers);
  }

  async getImageStatistics(platform: Platform, imageRef: ImageRef): Promise<ImageStatistics> {
    const manifestList = await this.getManifest(imageRef).then(data => data.manifests);
    // Reference: https://github.com/opencontainers/image-spec/blob/v1.0.1/image-index.md
    // TODO: Handle regular manifests, not just image index manifests
    const manifestDigest = manifestList.find(m =>
      m.platform.architecture === platform.architecture && m.platform.os === platform.os);
    if (!manifestDigest) {
      throw new Error(`Failed to find manifest for os ${platform.os} and architecture ${platform.architecture} for image ${imageRef.repository}:${imageRef.reference}`);
    }
    const manifest = await this.getManifest(imageRef.forRef(manifestDigest.digest));
    const details = new ImageStatistics(imageRef);

    // Parallelize requests for performance
    const promises: Promise<any>[] = [];
    for (const layer of manifest.layers) {
      details.compressedSizes.push(layer.size);
      promises.push(this.uncompressedSize(imageRef, layer as ImageLayer)
        .then(size => details.uncompressedSizes.push(size)));
    }

    details.compressedSizes.push(manifest.config.size);
    details.uncompressedSizes.push(manifest.config.size);
    /*
    // TODO: Do we really need to fetch the config?
    promises.push(this.getBlob(imageRef.forRef(manifest.config.digest))
      .then(response => response.json())
      .then(config => details.config = config));
    */

    await Promise.all(promises);

    return details;
  }

  async uncompressedSize(baseImageRef: ImageRef, layer: ImageLayer): Promise<number> {
      switch (layer.mediaType) {
        case 'application/vnd.oci.image.layer.nondistributable.v1.tar':
        case 'application/vnd.oci.image.layer.v1.tar':
          return layer.size;
        // https://github.com/distribution/distribution/blob/v2.8.3/docs/spec/manifest-v2-2.md#image-manifest
        case 'application/vnd.docker.image.rootfs.diff.tar.gzip':
        case 'application/vnd.docker.image.rootfs.foreign.diff.tar.gzip':
        case 'application/vnd.oci.image.layer.nondistributable.v1.tar+gzip':
        case 'application/vnd.oci.image.layer.v1.tar+gzip':
          // Reference: http://www.zlib.org/rfc-gzip.html
          return this.getBlob(baseImageRef.forRef(layer.digest), { Range: 'bytes=-4' })
            .then(response => response.arrayBuffer())
            .then(buffer => new Uint32Array(buffer)[0]);
        case 'application/vnd.oci.image.layer.nondistributable.v1.tar+zstd':
        case 'application/vnd.oci.image.layer.v1.tar+zstd':
          // Reference: https://github.com/facebook/zstd/blob/dev/doc/zstd_compression_format.md
          return this.getBlob(baseImageRef.forRef(layer.digest), { Range: 'bytes=0-18' })
            .then(response => response.arrayBuffer())
            .then(buffer => parseZstandardHeader(buffer));
        default:
          throw new Error(`Unrecognized media type ${layer.mediaType}`);
      }
  }
}

// Reference: https://github.com/facebook/zstd/blob/dev/doc/zstd_compression_format.md#zstandard-frames
export function parseZstandardHeader(buffer: ArrayBuffer): number {
  const dataView = new DataView(buffer, 0, 18);
  const Magic_Number = dataView.getUint32(0, true).toString(16);
  if (Magic_Number !== 'fd2fb528') {
    throw new Error(`Invalid magic number: ${Magic_Number}`);
  }
  const Frame_Header_Descriptor_offset = 4;
  const Frame_Header_Descriptor = dataView.getUint8(Frame_Header_Descriptor_offset);
  const Frame_Content_Size_flag = Frame_Header_Descriptor >>> 6;
  const Single_Segment_flag = Frame_Header_Descriptor & 0b00100000;
  const Dictionary_ID_flag = Frame_Header_Descriptor & 0b00000011;
  const DID_Field_Size = (Dictionary_ID_flag === 3 ? 4 : Dictionary_ID_flag);
  const Frame_Content_Size_offset = Frame_Header_Descriptor_offset + 1 + DID_Field_Size + (Single_Segment_flag === 0 ? 1 : 0);

  switch (Frame_Content_Size_flag) {
    case 0:
      if (Single_Segment_flag === 0) {
        // TODO: Handle this better
        throw new Error('FCS not available');
      }
      return dataView.getUint8(Frame_Content_Size_offset);
    case 1:
      return dataView.getUint16(Frame_Content_Size_offset, true) + 256;
    case 2:
      return dataView.getUint32(Frame_Content_Size_offset, true);
    case 3:
      return Number(dataView.getBigUint64(Frame_Content_Size_offset, true));
    default:
      throw new Error(`Invalid valid for Frame_Content_Size_flag: ${Frame_Content_Size_flag}`);
  }
}
