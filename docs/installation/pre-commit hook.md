# pre-commit hook

```yaml title=".pre-commit-config.yaml"
repos:
    - repo: https://github.com/DetachHead/basedpyright-pre-commit-mirror
      rev: v1.13.0 # or whatever the latest version is at the time
      hooks:
          - id: basedpyright
```

!!! warning

    pre-commit is not recommended. for more information, [see here](https://github.com/DetachHead/basedpyright-pre-commit-mirror/blob/main/README.md#should-i-use-this)
