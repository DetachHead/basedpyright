# Localization Difference between basedpyright and pyright

由于 pyright 的翻译存在一些问题，因此在 basedpyright 中对其部分翻译进行了调整，以更加符合中文语境。该文档主要供后续本地化工作参考，因此主要以中文进行描述并提供英文版本，以便其他语言的开发者了解本次工作的内容。

Due to some issues with the translation of Pyright, some adjustments have been made in BasedPyright to better fit the Chinese context. This document is mainly for reference in subsequent localization work, so it is primarily described in Chinese and provides an English version, so that developers of other languages can understand the content of this work.

## 用词调整 (Word Adjustments)

下列是调整的速查表，调整的原因和影响的范围将在下文进行描述。

Below is a quick reference table of the adjustments. The reasons for the adjustments and the scope of their impact will be described in the following text.

| 原词 (Original Word) | 原始翻译 (Original Translation) | 调整翻译 (Adjusted Translation) |
| -------------------- | ------------------------------- | ------------------------------- |
| Any                  | 任意                            | Any                             |
| follow               | 遵循                            | 在..之后                        |
| import               | 导入/Import                     | 导入                            |
| obscure              | 遮盖/隐蔽                       | 遮盖                            |
| True                 | true/True                       | True                            |

其中，**import**, **obscure** 和 **True** 在原本的翻译中存在多种翻译，因此在本次调整中统一了翻译。在pyright注释相关的规则中，**True** 则统一为 **true**，因为它代表的并不是 python 中的布尔值。

Among them, **import**, **obscure** and **True** have multiple translations in the original translation, so the translations have been unified in this adjustment. In the rules related to Pyright annotations, **True** is unified as **true**, because it does not represent a boolean value in Python.

### Any

**Any** 用于表示一个称作 **Any** 的类型，这个类型表示允许任意的类型。在原始翻译中，**Any** 被翻译为 **任意**，这个翻译会引起歧义 ，**任意类型** 可以被理解成类型是任意的。因此，**Any** 保留其作为类型的专有名词，不进行翻译。

与 **Any** 类似的，还有 **Unknown**，但 **Unknown** 并不是 python 的内建类型，而是用于描述类型推断失败的情况，且 **未知类型** 并不会引起歧义，因此 **Unknown** 保留翻译为 **未知**。



---

**Any** is used to represent a type called **Any**, which allows any type. In the original translation, **Any** was translated as **任意**, which can cause ambiguity. **任意类型** can be understood as the type is arbitrary. Therefore, **Any** retains its proper noun as a type and is not translated.

Similar to **Any**, there is **Unknown**, but **Unknown** is not a built-in type of Python, but is used to describe cases where type inference fails, and **未知类型** does not cause ambiguity, so **Unknown** is retained and translated as **未知**.

### follow

**follow** 通常出现在某个语法不能出现在另一个语法之后的规则中，例如`nonDefaultAfterDefault`，以下是一个例子：

```python
def foo(a = 1, b) -> int:... # 非默认参数遵循默认参数
```

在原始翻译中，**follow** 被翻译为 **遵循**，但在中文语境中，**遵循** 通常用于描述人的行为，而不是描述某个物体的位置关系。因此，**follow** 被调整为用于描述物体位置关系的 **在..之后**。

---

**follow** usually appears in rules where a syntax cannot appear after another syntax, such as `nonDefaultAfterDefault`. Here is an example:

```python
def foo(a = 1, b) -> int:... # Non-default parameter follows default parameter
```

In the original translation, **follow** was translated as **遵循**, but in the Chinese context, **遵循** is usually used to describe human behavior, not the positional relationship of an object. Therefore, **follow** has been adjusted to **在..之后** to describe the positional relationship of an object.


## 风格调整 (Style Adjustments)

风格调整参考了该项目 [sparanoid/chinese-copywriting-guidelines](https://github.com/sparanoid/chinese-copywriting-guidelines)，该项目提供了一些中文文案排版的基本规范，以便提高文案的可读性。

Style adjustments refer to the project [sparanoid/chinese-copywriting-guidelines](https://github.com/sparanoid/chinese-copywriting-guidelines), which provides some basic specifications for Chinese copywriting layout to improve the readability of the copywriting.

### 在全角文本与半角文本之间添加空格 (Add spaces between full-width text and half-width text)

通常在中英文混排时，中文与英文之间需要添加空格，以增加可读性。在原始翻译中，这一规则仅在部分文本中得到了遵循，因此对其进行了调整。并且通过引号括起的文本和参数文本也遵循这一规则，在两侧添加空格以强调其内容。

---

Usually, when mixing Chinese and English, spaces need to be added between Chinese and English to increase readability. In the original translation, this rule was only followed in some texts, so it was adjusted. Text enclosed in quotes and parameter text also follow this rule, adding spaces on both sides to emphasize their content.

### 统一标点符号 (Unified punctuation)

在原始翻译中，中文的全角标点符号和英文的半角标点符号混用，于是对其进行了调整，全部统一为全角标点符号。

---

In the original translation, full-width punctuation marks in Chinese and half-width punctuation marks in English were mixed, so they were adjusted to all full-width punctuation marks.