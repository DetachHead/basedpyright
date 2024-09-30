# improved integration with CI platforms

regular pyright has third party integrations for github actions and gitlab, but they are difficult to install/set up. these integrations are built into basedpyright, which makes them much easier to use.

## github actions

basedpyright automatically detects when it's running in a github action, and modifies its output to use [github workflow commands](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions). this means errors will be displayed on the affected lines of code in your pull requests automatically:

![image](https://github.com/DetachHead/basedpyright/assets/57028336/cc820085-73c2-41f8-ab0b-0333b97e2fea)

this is an improvement to regular pyright, which requires you to use a [third party action](https://github.com/jakebailey/pyright-action) that [requires boilerplate to get working](https://github.com/jakebailey/pyright-action?tab=readme-ov-file#use-with-a-virtualenv). basedpyright just does it automatically without you having to do anything special:

```yaml title=".github/workflows/your_workflow.yaml"
jobs:
    check:
        steps:
            - run: ... # checkout repo, install dependencies, etc
            - run: basedpyright # no additional arguments required. it automatically detects if it's running in a github action
```

## gitlab code quality reports

the `--gitlabcodequality` argument will output a [gitlab code quality report](https://docs.gitlab.com/ee/ci/testing/code_quality.html) which shows up on merge requests:

![image](https://github.com/DetachHead/basedpyright/assets/57028336/407f0e61-15f2-4d04-b235-1946d49fd180)

to enable this in your gitlab CI, just specify a file path to output the report to, and in the `artifacts.reports.codequality` section of your `.gitlab-ci.yml` file:

```yaml title=".gitlab-ci.yml"
basedpyright:
    script: basedpyright --gitlabcodequality report.json
    artifacts:
        reports:
            codequality: report.json
```
