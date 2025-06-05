# ROCISC

rocisc (Remote OCI Size Checker) is a simple CLI tool to display statistics and compare sizes of Docker/OCI images hosted on OCI-compliant image registeries. It's ideally suited for use in CI systems to enforce limits.

```
$ rocisc stats library/ubuntu library/alpine library/debian:stable library/debian:stable-slim
┌─────────┬──────────────────────────────┬────────────┬─────────────────┬───────────────────┬───────────────┐
│ (index) │ Image                        │ Num Layers │ Compressed Size │ Uncompressed Size │ Space Savings │
├─────────┼──────────────────────────────┼────────────┼─────────────────┼───────────────────┼───────────────┤
│ 0       │ 'library/ubuntu:latest'      │ 2          │ '29.72MB'       │ '80.63MB'         │ '64%'         │
│ 1       │ 'library/alpine:latest'      │ 2          │ '3.797MB'       │ '8.595MB'         │ '56%'         │
│ 2       │ 'library/debian:stable'      │ 2          │ '48.49MB'       │ '121.3MB'         │ '61%'         │
│ 3       │ 'library/debian:stable-slim' │ 2          │ '28.23MB'       │ '77.88MB'         │ '64%'         │
└─────────┴──────────────────────────────┴────────────┴─────────────────┴───────────────────┴───────────────┘
```


```
$ rocisc compare library/debian:stable-slim library/debian:stable  --max-uncompressed-delta=1024
ERROR: uncompressed size of library/debian:stable is 43MB larger than library/debian:stable-slim
```
