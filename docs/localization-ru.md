# Russian localization notes

## Style guide

- Буква Ё/ё используется
- Знак препинания `;` заменяется на точку
- Не стоит в точности повторять структуру английского сообщения, если она неестественна для русского языка.
  В частности избегайте конструкции `X является Y` (`класс Foo является абстрактным` -> `класс Foo абстрактный`)
- По возможности делайте структуру сообщения проще

## Глоссарий

| English term              | Canonical translation |
| ------------------------- | --------------------- |
| Type annotation           | Аннотация тип**а**    |
| Type annotations          | Аннотации тип**а**    |
| Comprehension             | Включение             |
| set (the built-in class)  | Множество             |
| Type variable             | Переменная тип**а**   |
| Type variables            | Переменные тип**а**   |
| Final класс               | Окончательный класс   |
| Data class                | `dataclass`           |
| Enum                      | Перечисление          |
| f-string                  | f-строка              |
| Format string literal     | f-строка              |
| XYZ is deprecated         | XYZ [больше] не рекомендуется |
| Complex [number]          | Комплексное число     |
| keyword argument/parameter| Именованный аргумент/параметр |
| mapping                   | mapping (нет перевода) |
| awaitable                 | awaitable (нет перевода) или: поддерживающий await |
| positional-only           | чисто позиционный     |

Технические термины ("type annotation", "function", "type variable") всегда следует переводить одинаково.
