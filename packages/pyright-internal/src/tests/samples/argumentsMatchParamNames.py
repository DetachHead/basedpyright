def foo(
    height: int,
    width: int,
): ...


height = 1
length = 2

foo(
    height,  # okay, name matches parameter name
    length,  # should display a warning, argument doesn't match parameter
)

foo(
    height=height,  # okay, using keyword
    width=length,  # okay, using keyword
)

foo(
    height,  # okay, matches
    width=length,  # okay, using keyword
)

iterable = []
len(iterable)  # okay, built-in function
