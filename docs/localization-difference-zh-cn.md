# Localization Difference between BasedPyright and Pylance

由于 Pylance 的翻译存在一些问题，因此在 BasedPyright 中对其部分翻译进行了调整，以更加符合中文语境。该文档主要供后续本地化工作参考，因此主要以中文进行描述并提供英文版本，以便其他语言的开发者了解本次工作的内容。

Due to some issues with the translation of Pylance, some adjustments have been made in BasedPyright to better fit the Chinese context. This document is mainly for reference in subsequent localization work, so it is primarily described in Chinese and provides an English version, so that developers of other languages can understand the content of this work.

## 用词调整 (Word Adjustments)

用词调整针对专有名词和非专有名词采取了不同的调整策略：
- 对于存在争议的专有名词翻译，按照如下规则进行调整，若翻译后：
  - 如果该名词已经被广泛接受，且翻译并未导致歧义，保留原翻译；
  - 如果该翻译存在歧义，则寻找Python官方文档中的翻译，若官方文档中存在翻译，则采用官方翻译；
  - 若官方文档中不存在翻译，或者翻译仍然存在歧义，则采用大众普遍认知的翻译形式并标注英文原词；
  - 若以上方法均无法解决，则直接使用原词不进行翻译；
- 对于非专有名词，向更符合中文书写习惯的方向进行调整。

Word adjustments take different adjustment strategies for proper nouns and non-proper nouns:
- For controversial translations of proper nouns, adjustments are made according to the following rules:
  - If the noun has been widely accepted and the translation does not cause ambiguity, the original translation is retained;
  - If the translation is ambiguous, look for the translation in the Python official documentation. If there is a translation in the official documentation, use the official translation;
  - If there is no translation in the official documentation, or the translation is still ambiguous, use the translation form that is generally recognized by the public and mark the original English word;
  - If none of the above methods can solve the problem, use the original word directly without translation;
---

下列是调整的速查表，调整的原因和影响的范围将在下文进行描述。

Below is a quick reference table of the adjustments. The reasons for the adjustments and the scope of their impact will be described in the following text.

| 原词 (Original Word)         | 原始翻译 (Original Translation) | 调整翻译 (Adjusted Translation) | 错译类型 (Type of Mistranslation)          |
| ---------------------------- | ------------------------------- | ------------------------------- | ------------------------------------------ |
| annotation                   | （类型）批注                    | （类型）标注                    | 与文档不一致/Inconsistent with Python docs |
| Any                          | 任意                            | Any                             | 语义错误/Wrong meaning in context          |
| argument                     | 参数                            | 参数/实参                       | 语义错误/Wrong meaning in context          |
| import                       | 导入/Import                     | 导入                            | 语义错误/Wrong meaning in context          |
| parameter                    | 参数                            | 参数/形参                       | 语义错误/Wrong meaning in context          |
| True                         | true/True                       | True                            | 语义错误/Wrong meaning in context          |
| assign                       | 分配                            | 赋值                            | 词义错误/Wrong word meaning                |
| comprehension                | 理解                            | 推导式                          | 词义错误/Wrong word meaning                |
| follow                       | 遵循                            | 在..之后                        | 词义错误/Wrong word meaning                |
| implementation/unimplemented | （未）实施/实行（的）           | （未）实现（的）                | 词义错误/Wrong word meaning                |
| obscure                      | 遮盖/隐蔽                       | 覆盖                            | 词义错误/Wrong word meaning                |

其中，**import**, **obscure** 和 **True** 在原本的翻译中存在多种翻译，因此在本次调整中统一了翻译。在 Pylance 注释相关的规则中，**True** 则统一为 **true**，因为它代表的并不是 Python 中的布尔值。

Among them, **import**, **obscure** and **True** have multiple translations in the original translation, so the translations have been unified in this adjustment. In the rules related to Pylance annotations, **True** is unified as **true**, because it does not represent a boolean value in Python.

### Any

**Any** 用于表示一个称作 **Any** 的类型，这个类型表示允许任意的类型。在原始翻译中，**Any** 被翻译为 **任意**，这个翻译会引起歧义 ，**任意类型** 可以被理解成类型是任意的。因此，**Any** 保留其作为类型的专有名词，不进行翻译。

与 **Any** 类似的，还有 **Unknown**，但 **Unknown** 并不是 python 的内建类型，而是用于描述类型推断失败的情况，且 **未知类型** 并不会引起歧义，因此 **Unknown** 保留翻译为 **未知**。

---

**Any** is used to represent a type called **Any**, which allows any type. In the original translation, **Any** was translated as **任意**, which can cause ambiguity. **任意类型** can be understood as the type is arbitrary. Therefore, **Any** retains its proper noun as a type and is not translated.

Similar to **Any**, there is **Unknown**, but **Unknown** is not a built-in type of Python, but is used to describe cases where type inference fails, and **未知类型** does not cause ambiguity, so **Unknown** is retained and translated as **未知**.

### follow

**follow** 通常出现在某个语法不能出现在另一个语法之后的规则中，例如 `nonDefaultAfterDefault`。

在原始翻译中，**follow** 被翻译为 **遵循**，但在中文语境中，**遵循** 通常用于描述人的行为，而不是描述某个物体的位置关系。因此，**follow** 被调整为用于描述物体位置关系的 **在..之后**。

---

**follow** usually appears in rules where a syntax cannot appear after another syntax, for example `nonDefaultAfterDefault`.

In the original translation, **follow** was translated as **遵循** (obeying), but in the Chinese context, **遵循** is usually used to describe human behavior, not the positional relationship of an object. Therefore, **follow** has been adjusted to **在..之后** to describe the positional relationship of an object.

例子/Example(s)：

```python
def foo(a=1, b) -> int: ...  # 非默认参数遵循默认参数（官方中文/Official Chinese）
                             # Non-default parameter follows default parameter（官方英文/Official English）
                             # 非默认参数不应位于默认参数后方（修改版本/Modified version）
```

### implementation/unimplemented

**implement** 在程序领域中通常翻译作 **实现**，原始翻译大多也采用了这个译文，偶有部分条目（`abstractMethodInvocation` 和 `overloadFinalInconsistencyImpl`）被错误翻译为 **实施**、**实行**等，因此统一修改为 **实现**/**未实现（的）**。

---

**implement** is commonly translated as **实现** in the programming world and was used in most of the original translations, with occasional entries (`abstractMethodInvocation` and `overloadFinalInconsistencyImpl`) are mistranslated as **实施**, **实行**, etc., so they are unified as **实现**/**未实现（的）**.

例子/Example(s)：

```python
from abc import abstractmethod

class A:
    @abstractmethod
    def a(self):
        raise NotImplementedError

class B(A):
    def a(self):
        super().a()  # 无法调用方法“a”，因为它是抽象的且未实施（官方中文/Official Chinese）
                     # Method "a" cannot be called because it is abstract and unimplemented（官方英文/Official English）
                     # 不能调用未实现的抽象方法“a”（修改版本/Modified version）
```

### comprehension

**comprehension** 是 Python 中的一个术语，Python 官方中文文档中称其为 **推导式**。Pylance 翻译则全部错译为 **理解**。

---

**comprehension** is a Python term, and the official Python Chinese documentation refers to it as **推导式**. Pylance translations all mistranslate it as **理解** (understanding).

例子/Example(s)：

```python
[a := a for a in "lorem ipsum"]  # 赋值表达式目标“a”不能使用与目标理解相同的名称（官方中文/Official Chinese）
                                 # Assignment expression target "a" cannot use same name as comprehension for target（官方英文/Official English）
                                 # 海象运算符赋值的变量名“a”不能与推导变量重名（修改版本/Modified version）
```

### parameter & argument

在实际语境中，**parameter** 指定义函数时标注的 **参数**，也称作 **形参**；而 **argument** 指调用函数时实际传入的 **参数**，也称作 **实参**。Pylance 翻译则未做区分，全部译为 **参数**。

考虑到 **实参**、**形参** 在表述中可能较为生硬，一般仅当需要区分二者时使用，否则可根据实际情况优先译为 **参数**。

---

In the actual context, **parameter** refers to the parameter labeled when defining a function, which is also called **形参**, while **argument** refers to the actual parameter passed when calling a function, which is also called **实参**, and Pylance translates all of them as **参数** without any distinction.

Considering the fact that **实参** and **形参** may be less fluent to express, they are generally used only when there is a need to distinguish between them, otherwise they can be translated as **参数** according to the actual situation in preference.

例子/Example(s)：

```python
def func(a: int, b: str):
    ...

func(12, 42)  # 无法将“Literal[42]”类型的参数分配给函数“func”中类型为“str”的参数“b”（官方中文/Official Chinese）
              # Argument of type "Literal[42]" cannot be assigned to parameter "b" of type "str" in function "func"（官方英文/Official English）
              # “Literal[42]”类型的实参无法确定为函数“func”中“str”类型的形参“b”（修改版本/Modified version）
```

### annotation

Type/typing **annotation** 是 Python 中的一个术语，Python 官方中文文档中称其为 类型**标注**。Pylance 则译为 类型**批注**。

---

Type/typing **annotation** is a Python term, and the official Python Chinese documentation refers to it as 类型**标注**, while Pylance translated it into 类型**批注**.

例子/Example(s)：

```python
lambda x: int: x ** 2  # 此语句不支持类型批注（官方中文/Official Chinese）
                       # Type annotation not supported for this statement（官方英文/Official English）
                       # 此语句不支持类型标注（修改版本/Modified version）
```

### assign

**assign** 在程序语境中一般译作 **赋值**，Pylance 则全部错译为 **分配**。

---

In programming context, **assign** is often translated into **赋值**, while Pylance all mistranslate it as **分配**.

## 风格调整 (Style Adjustments)

风格调整参考了该项目 [sparanoid/chinese-copywriting-guidelines](https://github.com/sparanoid/chinese-copywriting-guidelines)，该项目提供了一些中文文案排版的基本规范，以便提高文案的可读性。

Style adjustments refer to the project [sparanoid/chinese-copywriting-guidelines](https://github.com/sparanoid/chinese-copywriting-guidelines), which provides some basic specifications for Chinese copywriting layout to improve the readability of the copywriting.

### 在全角文本与半角文本之间添加空格 (Add spaces between full-width text and half-width text)

通常在中英文混排时，中文与英文之间需要添加空格，以增加可读性。在原始翻译中，这一规则仅在部分文本中得到了遵循，因此对其进行了调整。并且通过引号括起的文本和参数文本也遵循这一规则，在两侧添加空格以强调其内容。

---

Usually, when mixing Chinese and English, spaces need to be added between Chinese and English to increase readability. In the original translation, this rule was only followed in some texts, so it was adjusted. Text enclosed in quotes and parameter text also follow this rule, adding spaces on both sides to emphasize their content.

## 统一标点符号 (Unified punctuation)

在原始翻译中，中文的全角标点符号和英文的半角标点符号混用，于是对其进行了调整，除英文之间的标点以外，全部统一为全角标点符号。



---

In the original translation, full-width punctuation marks in Chinese and half-width punctuation marks in English were mixed, so they were adjusted to all full-width punctuation marks except for punctuations between English sentences.
