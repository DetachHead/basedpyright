# how we keep up-to-date with upstream

every time pyright releases a new version, we merge its release tag into basedpyright. each basedpyright version is based on a release version of pyright.

you can check which pyright version basedpyright is based on by running `basedpyright --version`:

```
basedpyright 1.14.0
based on pyright 1.1.372
```

we try to update basedpyright as soon as a new pyright version is released. we typically release on the same day that pyright does.
