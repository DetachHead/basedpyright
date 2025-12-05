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

foo(
    1, # should display a warning, positional argument used
    width=2, # okay, using keyword
)

len([]) # okay, built-in function with no keyword arguments

pow(
    2, # should display a warning, positional argument used, built-in function
    3, # should display a warning, positional argument used, built-in function
)
