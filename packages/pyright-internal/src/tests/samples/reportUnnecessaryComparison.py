from typing import Never, assert_never

def _(something_else: Never, subject: int | str):
    match subject:
        case int():
            ...
        case str():
            ...
        case _: # no error, intentional due to assert_never on the subject
            assert_never(subject)

    match subject:
        case int():
            ...
        case str():
            ...
        case _: # error, the argument passed to assert_never is unrelated to the match subject
            assert_never(something_else)

    match subject:
        case int():
            ...
        case str():
            ...
        case _: # error, not an assert_never
            print(subject)
