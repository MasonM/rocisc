# ROCISC

rocisc (Remote OCI Size Checker) is a simple, zero-dependency CLI tool to display statistics and compare sizes of Docker/OCI images hosted on OCI-compliant image registeries. It's ideally suited for use in CI systems to enforce limits.

```shell
$ node rocisc.ts library/alpine library/ubuntu --maxUncompressedDelta 1024
┌───────────────────────┬────────────┬───────────────────┬───────────────────┬───────────────┐
│ Image                 │ Num Layers │ Compressed Size   │ Uncompressed Size │ Space Savings │
├───────────────────────┼────────────┼───────────────────┼───────────────────┼───────────────┤
│ library/alpine:latest │ 2          │ 3.797MB           │ 8.595MB           │ 55.82%        │
│ library/ubuntu:latest │ 2          │ 29.72MB (+682.6%) │ 80.63MB (+838.1%) │ 63.14%        │
└───────────────────────┴────────────┴───────────────────┴───────────────────┴───────────────┘
ERROR: Delta exceeded: library/ubuntu:latest is 72.03MB larger than library/alpine:latest
```
