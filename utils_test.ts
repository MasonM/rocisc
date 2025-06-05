import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RegistryClient, ImageRef, Platform } from './utils.ts';


describe('End-to-end', () => {
  const platform = new Platform(process.arch, process.platform);

  it('should print stats for image on Docker Hub', async () => {
    const imageRef = new ImageRef('library/ubuntu','sha256:b59d21599a2b151e23eea5f6602f4af4d7d31c4e236d22bf0b62b86d2e386b8f');
    const registry = new RegistryClient(RegistryClient.DockerHub);
    await registry.tryAuthenticate([imageRef]);

    const imageStat = await registry.getImageStatistics(platform, imageRef);
    assert.equal(imageStat.totalLayers, 2);
    assert.equal(imageStat.totalUncompressedSize, 80626935n);
    assert.equal(imageStat.totalCompressedSize, 29717632n);
    assert.equal(imageStat.spaceSavings, 0.64);
  });

  it('should print stats for image on mcr.microsoft.com', async () => {
    // Tag: 1.2.4-ubuntu-24.04
    const imageRef = new ImageRef('devcontainers/base','sha256:4c8b0c0465d6452808c2c97920da968fee7a128ba3bcdf2c79e2b6684c9b65dc');
    const registry = new RegistryClient('https://mcr.microsoft.com');
    await registry.tryAuthenticate([imageRef]);

    const imageStat = await registry.getImageStatistics(platform, imageRef);
    assert.equal(imageStat.totalLayers, 10);
    assert.equal(imageStat.totalUncompressedSize, 768075090n);
    assert.equal(imageStat.totalCompressedSize, 295935442n);
    assert.equal(imageStat.spaceSavings, 0.62);
  });
});
