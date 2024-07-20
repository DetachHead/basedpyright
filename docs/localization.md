# Localization notes

Here are some guidelines for contributors who would like to help improve the translations in basedpyright.

## General guidelines

- In cases where a word is difficult to translate but it refers to the name of a symbol, leaving it in English and using backticks makes more sense than attempting to translate it. For example, if the English error message says "cannot assign to Final variable" then the translation could just be "невозможно присвоить переменной `Final`" instead of trying to use a Russian word for "final".
- basedpyright is maintained by developers who only speak English, so it would be helpful if you could get some who also speaks your language to review your changes as well.
- We do not use any automated systems to translate our new rules that are specific to basedpyright, so they currently do not have any translations at all (see [this issue](https://github.com/DetachHead/basedpyright/issues/81)). Providing translations for those would be greatly appreciated.
- The initial translations from Pyright seem to be pretty low quality and low consistency. If you want to start a "renovation" for a particular language, it's a good idea to come up with a glossary of common terms so that the final translations will be consistent. Check if the https://docs.python.org has a translation for your language, and if it does, use that as a baseline.

## Specific languages

### Russian

#### Style guide
- Буква Ё/ё не используется
- Знак препинания `;` заменяется на точку
- Не стоит в точности повторять структуру английского сообщения, если она неестественна для русского языка.
  В частности избегайте конструкции `X является Y` (`класс Foo является абстрактным` -> `класс Foo абстрактный`)
- По возможности делайте структуру сообщения проще

#### Глоссарий

| English term              | Canonical translation |
| ------------------------- | --------------------- |
| Type annotation           | Аннотация типа        |
| Comprehension             | Включение             |
| set (встроенный тип)      | Множество             |
| Type variable             | Переменная типа       |
| Final                     | `Final` (как есть)    |
| @final / final class      | `@final` (как есть)   |
| Data class                | Датакласс             |
| Enum                      | Enum (как есть)       |
| f-string                  | f-строка              |
| Format string literal     | f-строка              |
| XYZ is deprecated         | XYZ [больше] не рекомендуется |
| Complex [number]          | Комплексное число     |
| keyword argument/parameter| Именованный аргумент/параметр |
| mapping                   | mapping (нет перевода)|
| awaitable                 | awaitable (нет перевода) или: поддерживающий await |
| positional-only           | только позиционный    |
| keyword-only              | только именованный    |
