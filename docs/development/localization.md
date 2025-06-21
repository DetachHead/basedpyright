# Localization notes

the translations in pyright come from microsoft's localization team, who are not programmers. this not only results in poor quality translations, but microsoft also doesn't accept contributions to fix them ([more info here](https://github.com/microsoft/pyright/issues/7441#issuecomment-1987027067)).

in basedpyright we want to fix this but we need your help! if you are fluent in a language other than english and would like to contribute, it would be greatly appreciated.

Here are some guidelines for contributors who would like to help improve the translations in basedpyright.

## Tools for localization

A TUI tool `build/py3_13/localization_helper.py` script is provided to help you with the localization process. It can be used to:

-   Check every message in comparison with the corresponding English message.
-   Compare message keys with the English version and find out which messages are missing and which ones are redundant.

### Usage

Run the script:

```shell
# use uv
./pw uv run build/py3_13/localization_helper.py
# or from inside the venv
npm run localization-helper
```

About the interface:

-   The TUI is created with [textual](https://github.com/Textualize/textual), and it is generally fine to use it with mouse.
-   Click on the tabs for the given language at the top of the interface to switch to the localized content in the corresponding language.
-   Click on the function buttons at the bottom of the interface to carry out the corresponding operations.
-   Click on a category in the message tree to expand/collapse the content under that category.
-   Click on a message entry in the message tree to prompt the corresponding English entry automatically.

!!! note

    If the operation "Compare message keys differences" is triggered, the popup can ONLY be closed by pressing <kbd>C</kbd>.

## General guidelines

-   Do not use any automatic translation tools.
-   In cases where a word is difficult to translate but it refers to the name of a symbol, leaving it in English and using backticks makes more sense than attempting to translate it. For example, if the English error message says "cannot assign to Final variable" then the translation could just be "невозможно присвоить переменной `Final`" instead of trying to use a Russian word for "final".
-   basedpyright is maintained by developers who only speak English, so it would be helpful if you could get someone who also speaks your language to review your changes as well.
-   new rules that are specific to basedpyright currently do not have any translations at all (see [this issue](https://github.com/DetachHead/basedpyright/issues/81)). Providing translations for those would be greatly appreciated.
-   The initial translations from Pyright seem to be pretty low quality and low consistency. If you want to start a "renovation" for a particular language, it's a good idea to come up with a glossary of common terms so that the final translations will be consistent. Check if the https://docs.python.org has a translation for your language, and if it does, use that as a baseline.
-   Some messages in the English localization file contain a `"comment"` field with formal specifiers like `Locked` and `StrContains`. Use your judgement as to whether they should be followed. It's usually better to apply common sense and the language-specific glossary to decide to which parts of the string should be translated.

## Specific languages

### Russian

#### Style guide

-   Буква Ё/ё не используется
-   Знак препинания `;` заменяется на точку
-   Не стоит в точности повторять структуру английского сообщения, если она неестественна для русского языка.
    В частности избегайте конструкции `X является Y` (`класс Foo является абстрактным` -> `класс Foo абстрактный`)
-   По возможности делайте структуру сообщения проще

#### Глоссарий

| English term               | Canonical translation                              |
| -------------------------- | -------------------------------------------------- |
| Type annotation            | Аннотация типа                                     |
| Comprehension              | Включение                                          |
| set (встроенный тип)       | Множество                                          |
| tuple                      | Кортеж                                             |
| Type variable              | Переменная типа                                    |
| Final                      | `Final` (как есть)                                 |
| @final / final class       | `@final` (как есть)                                |
| Data class                 | Датакласс                                          |
| Enum                       | Перечисление                                       |
| f-string                   | f-строка                                           |
| Format string literal      | f-строка                                           |
| XYZ is deprecated          | XYZ [больше] не рекомендуется                      |
| Complex [number]           | Комплексное число                                  |
| keyword argument/parameter | Именованный аргумент/параметр                      |
| mapping                    | mapping (нет перевода)                             |
| awaitable                  | awaitable (нет перевода) или: поддерживающий await |
| positional-only            | только позиционный                                 |
| keyword-only               | только именованный                                 |
| generic                    | обобщенный                                         |
| type alias                 | псевдоним типа                                     |
| generic type alias         | обобщенный псевдоним типа                          |

### Chinese

#### Style guide

-   风格调整参考了该项目 [sparanoid/chinese-copywriting-guidelines](https://github.com/sparanoid/chinese-copywriting-guidelines)，该项目提供了一些中文文案排版的基本规范，以便提高文案的可读性。
-   通常在中英文混排时，中文与英文之间需要添加空格，以增加可读性。在原始翻译中，这一规则仅在部分文本中得到了遵循，因此对其进行了调整。并且通过引号括起的文本和参数文本也遵循这一规则，在两侧添加空格以强调其内容。
-   原始翻译中存在中文的全角标点符号和英文的半角标点符号混用，同时存在使用不正确，因此对其进行调整。考虑到文本格式化时部分条目会出现**硬编码**的直引号 `"`，因此将所有格式化参数的双引号统一为英文直双引号，代码标识统一为反引号。除引号以外的非英文之间的标点全部统一为全角标点符号。
-   考虑到英文原文可能不符合中文的表达逻辑，因此允许不完全遵循原文，以符合中文理解习惯和语法为主，但仍需保证正确性。
-   Python 官方文档的部分译文也存在一致性问题，需要酌情选取广泛使用的译文。
-   若翻译后文本并不是常见写法，可添加括号并标注原文。
-   在英文原文中使用的名词复数形式保留原词不译时：
    -   若复数形式是术语的一部分或影响语义（如专有名词、代码标识），保留复数；
    -   若复数无特殊含义或中文可通过量词/语境隐含复数，改为单数形式。
-   对于某些冗余表述（例如本身不存在 non-literal 形式的 `formatted string literals` 等），可以酌情省略翻译。

#### 用词调整

| 原词 (Word)                  | 原始翻译 (Original)   | 调整翻译 (Adjusted) | 错译类型 (Type of Mistranslation)          |
| ---------------------------- | --------------------- | ------------------- | ------------------------------------------ |
| annotation                   | （类型）批注          | （类型）注解        | 与文档不一致/Inconsistent with Python docs |
| Any                          | 任意                  | Any                 | 固定术语/Terminology                       |
| Unknown                      | 未知/Unknown          | 未知                | 固定术语/Terminology                       |
| import                       | 导入/Import           | 导入                | 语义错误/Wrong meaning                     |
| True                         | true/True             | True                | 语义错误/Wrong meaning                     |
| assign                       | 分配                  | 赋值                | 词义错误/Wrong meaning                     |
| follow                       | 遵循                  | 在 ... 之后         | 词义错误/Wrong meaning                     |
| variance                     | 差异                  | 可变性              | 词义错误/Wrong meaning                     |
| key                          | 密钥                  | 键                  | 词义错误/Wrong meaning                     |
| argument                     | 参数                  | 参数/实参/传入值    | 词义不准确/Inaccurate meaning              |
| parameter                    | 参数                  | 参数/形参           | 词义不准确/Inaccurate meaning              |
| implementation/unimplemented | （未）实施/实行（的） | （未）实现（的）    | 词义不准确/Inaccurate meaning              |
| obscure                      | 遮盖/隐蔽             | 覆盖                | 词义不准确/Inaccurate meaning              |
| irrefutable                  | 无可辩驳的            | 通配                | 词义不准确/Inaccurate meaning              |
| entry                        | 条目                  | 项                  | 词义不准确/Inaccurate meaning              |

#### 量词

-   对于“数量”“个数”等离散计数的表述，在数值后通常需要添加量词“个”；
-   对于“长度”“大小”等在习惯上非离散计数的表述，在数值后一般不添加量词“个”。
